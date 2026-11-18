import { Fragment, useEffect } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const FALLBACK_CENTER = [30.3753, 69.3451];
const ROUTE_COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a'];

const validPoint = (latitude, longitude) => (
  Number.isFinite(Number(latitude))
  && Number.isFinite(Number(longitude))
  && Number(latitude) >= -90
  && Number(latitude) <= 90
  && Number(longitude) >= -180
  && Number(longitude) <= 180
);

const statusColor = (rider) => {
  if (!rider.onDuty) return '#94a3b8';
  if (['offline', 'interrupted'].includes(rider.trackingState)) return '#ef4444';
  if (['delayed', 'gps_unavailable'].includes(rider.trackingState)) return '#f59e0b';
  if (rider.available) return '#10b981';
  if (rider.status === 'delivery_failed') return '#ef4444';
  return '#4f46e5';
};

const FitMap = ({ coordinates }) => {
  const map = useMap();
  useEffect(() => {
    if (!coordinates.length) return;
    if (coordinates.length === 1) {
      map.setView(coordinates[0], Math.max(map.getZoom(), 15), { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(coordinates), { padding: [36, 36], maxZoom: 16, animate: false });
  }, [coordinates, map]);
  return null;
};

const RiderLiveMap = ({ riders = [], routePoints = [], routeSegments = [], outlet = null, className = 'h-[420px]' }) => {
  const riderPoints = riders
    .filter((rider) => validPoint(rider.location?.latitude, rider.location?.longitude))
    .map((rider) => ({ rider, coordinates: [Number(rider.location.latitude), Number(rider.location.longitude)] }));
  const routeLines = routeSegments.length
    ? routeSegments.map((segment) => ({
        key: segment.assignment?._id || segment.assignmentId,
        label: `${segment.routeSequence ? `Stop ${segment.routeSequence} · ` : ''}${segment.assignment?.orderNumber || segment.assignment?.rider?.name || 'Order'}`,
        coordinates: (segment.points || [])
          .filter((point) => validPoint(point.latitude, point.longitude))
          .map((point) => [Number(point.latitude), Number(point.longitude)]),
      }))
    : [{ key: 'route', label: 'Route', coordinates: routePoints
        .filter((point) => validPoint(point.latitude, point.longitude))
        .map((point) => [Number(point.latitude), Number(point.longitude)]) }];
  const route = routeLines.flatMap((line) => line.coordinates);
  const outletCoordinates = outlet?.riderTracking?.location?.coordinates;
  const outletPoint = Array.isArray(outletCoordinates)
    && validPoint(outletCoordinates[1], outletCoordinates[0])
    ? [Number(outletCoordinates[1]), Number(outletCoordinates[0])]
    : null;
  const allCoordinates = [...route, ...riderPoints.map((point) => point.coordinates), ...(outletPoint ? [outletPoint] : [])];
  const center = allCoordinates[0] || FALLBACK_CENTER;

  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`}>
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMap coordinates={allCoordinates} />
        {outletPoint && (
          <>
            <Circle
              center={outletPoint}
              radius={Number(outlet?.riderTracking?.geofenceRadiusMeters || 150)}
              pathOptions={{ color: '#7c3aed', fillColor: '#8b5cf6', fillOpacity: 0.08, weight: 2 }}
            />
            <CircleMarker center={outletPoint} radius={8} pathOptions={{ color: '#6d28d9', fillColor: '#7c3aed', fillOpacity: 1 }}>
              <Tooltip direction="top" offset={[0, -8]} permanent>{outlet?.name || 'Outlet'}</Tooltip>
            </CircleMarker>
          </>
        )}
        {routeLines.map((line, index) => {
          if (!line.coordinates.length) return null;
          const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
          const start = line.coordinates[0];
          const end = line.coordinates[line.coordinates.length - 1];
          return (
            <Fragment key={line.key || index}>
              {line.coordinates.length > 1 && <Polyline positions={line.coordinates} pathOptions={{ color, weight: 5, opacity: 0.82 }} />}
              <CircleMarker center={start} radius={6} pathOptions={{ color, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
                <Tooltip direction="top">{line.label} route start</Tooltip>
              </CircleMarker>
              {line.coordinates.length > 1 && (
                <CircleMarker center={end} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }}>
                  <Tooltip direction="top">{line.label} route end</Tooltip>
                </CircleMarker>
              )}
            </Fragment>
          );
        })}
        {riderPoints.map(({ rider, coordinates }) => (
          <CircleMarker
            key={rider._id}
            center={coordinates}
            radius={10}
            pathOptions={{ color: '#fff', weight: 3, fillColor: statusColor(rider), fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent>{rider.name}</Tooltip>
            <Popup>
              <div className="min-w-[180px]">
                <strong>{rider.name}</strong><br />
                Status: {String(rider.status || 'unknown').replaceAll('_', ' ')}<br />
                {(rider.assignments || (rider.assignment ? [rider.assignment] : [])).length ? <>Active orders: {(rider.assignments || [rider.assignment]).map((assignment) => assignment.orderNumber).join(', ')}<br /></> : null}
                GPS: {rider.locationAgeSeconds == null ? 'unknown' : `${rider.locationAgeSeconds}s ago`}<br />
                Signal: {rider.signalAgeSeconds == null ? 'unknown' : `${rider.signalAgeSeconds}s ago`}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

export default RiderLiveMap;
