import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, UserPlus, X } from 'lucide-react';
import { assignDeliveryRider, getDeliveryRiders } from '../../api/saleApi';
import Spinner from '../UI/Spinner';

const AssignRiderModal = ({ order, onClose, onAssigned }) => {
  const currentRider = order?.assignedRiderUser || order?.assignedRider || null;
  const currentRiderId = currentRider?._id ? String(currentRider._id) : '';
  const currentRiderType = order?.assignedRiderUser || currentRider?.role === 'rider' ? 'user' : 'employee';
  const isReassignment = Boolean(currentRiderId);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(currentRiderId);
  const [selectedType, setSelectedType] = useState(currentRiderType);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [riderTrackingMode, setRiderTrackingMode] = useState(false);

  useEffect(() => {
    setSelectedId(currentRiderId);
    setSelectedType(currentRiderType);
  }, [currentRiderId, currentRiderType]);

  useEffect(() => {
    let active = true;
    getDeliveryRiders()
      .then((result) => {
        if (!active) return;
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        setEmployees(rows);
        setRiderTrackingMode(result?.riderTrackingMode === true);
        if (!currentRiderId) {
          const assignedRow = rows.find((employee) => (
            (employee.activeAssignments || (employee.currentAssignment ? [employee.currentAssignment] : []))
              .some((assignment) => String(assignment.saleTransaction || '') === String(order?._id || ''))
          ));
          if (assignedRow?._id) {
            setSelectedId(String(assignedRow._id));
            setSelectedType(assignedRow.assignmentType || 'user');
          }
        }
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load outlet employees'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentRiderId, order?._id]);

  const filtered = employees.filter((employee) => {
    const q = search.trim().toLowerCase();
    return !q || [employee.name, employee.email, employee.phone, employee.designation, employee.department]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  });

  const submit = async () => {
    if (!selectedId || saving) return;
    if (isReassignment && String(selectedId) === currentRiderId && selectedType === currentRiderType) {
      toast.error('Choose a different available rider.');
      return;
    }
    setSaving(true);
    try {
      const updated = await assignDeliveryRider(order._id, selectedId, selectedType);
      const assigned = updated?.assignedRiderUser || updated?.assignedRider;
      toast.success(`Rider ${assigned?.name || ''} ${isReassignment ? 'changed' : 'assigned'}`.trim());
      onAssigned({ ...updated, assignedRider: assigned });
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${isReassignment ? 'change' : 'assign'} rider`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-surface-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="assign-rider-title">
      <div className="relative z-[2001] flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-float">
        <div className="flex shrink-0 items-center justify-between border-b border-surface-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-violet-500">{order.transactionNumber}</p>
            <h3 id="assign-rider-title" className="text-lg font-extrabold text-surface-900">{isReassignment ? 'Change Rider' : 'Assign Rider'}</h3>
            {isReassignment && <p className="mt-0.5 text-xs text-surface-500">Currently assigned to {currentRider.name || 'this rider'}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close rider assignment" className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"><X size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-surface-200 px-3 py-2">
            <Search size={14} className="text-surface-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={riderTrackingMode ? 'Search riders or employees…' : 'Search outlet employees…'} className="min-w-0 flex-1 text-sm outline-none" />
          </div>
          <div className="max-h-[min(18rem,50dvh)] space-y-2 overflow-y-auto">
            {loading && <div className="flex justify-center py-10"><Spinner size="md" /></div>}
            {!loading && filtered.length === 0 && <p className="py-10 text-center text-sm text-surface-400">{riderTrackingMode ? 'No riders or employees found.' : 'No active outlet employees found.'}</p>}
            {filtered.map((employee) => {
              const employeeId = String(employee._id);
              const employeeType = employee.assignmentType || (employee.role === 'rider' ? 'user' : 'employee');
              const activeAssignments = employee.activeAssignments || (employee.currentAssignment ? [employee.currentAssignment] : []);
              const handlesThisOrder = activeAssignments.some((assignment) => String(assignment.saleTransaction || '') === String(order?._id || ''));
              const isCurrentRider = (employeeId === currentRiderId && employeeType === currentRiderType) || handlesThisOrder;
              const isUnavailable = employeeType === 'user' && !employee.available && !isCurrentRider;
              const isSelected = String(selectedId) === employeeId && selectedType === employeeType;
              const distance = employee.distanceFromOutletMeters == null ? '' : ` · ${Math.round(employee.distanceFromOutletMeters)} m away`;
              const trackingStatus = employee.trackingState === 'interrupted'
                ? 'Tracking interrupted'
                : employee.trackingState === 'offline'
                  ? 'Tracking offline'
                  : employee.trackingState === 'gps_unavailable'
                    ? 'Device online · GPS unavailable'
                  : employee.trackingState === 'delayed'
                    ? 'GPS delayed · online'
                    : activeAssignments.length
                      ? `${activeAssignments.length} active order${activeAssignments.length === 1 ? '' : 's'}`
                      : employee.onDuty ? 'On duty' : 'Off duty';
              const riderStatus = isCurrentRider
                ? `Currently assigned${distance}`
                : `${employee.available ? 'Available' : trackingStatus}${distance}`;
              const employeeDetails = [employee.designation, employee.department, employee.phone].filter(Boolean).join(' · ');
              const employeeStatus = `${isCurrentRider ? 'Currently assigned · ' : ''}Employee · No app tracking${employeeDetails ? ` · ${employeeDetails}` : ''}`;
              return (
              <button key={`${employeeType}:${employee._id}`} type="button" disabled={isUnavailable} onClick={() => { setSelectedId(employeeId); setSelectedType(employeeType); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${isSelected ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-surface-200 hover:bg-surface-50'}`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">{employee.name?.charAt(0)?.toUpperCase() || 'R'}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-surface-900">{employee.name}</p>
                  <p className="truncate text-xs text-surface-500">{employeeType === 'user' ? riderStatus : employeeStatus}</p>
                </div>
                <span className={`h-4 w-4 rounded-full border-2 ${isSelected ? 'border-violet-600 bg-violet-600 ring-2 ring-white' : 'border-surface-300'}`} />
              </button>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-surface-100 bg-surface-50/60 px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
          <button type="button" onClick={submit} disabled={!selectedId || saving || (isReassignment && String(selectedId) === currentRiderId && selectedType === currentRiderType)} className="btn-primary flex-1 py-2.5 disabled:opacity-50"><UserPlus size={14} />{saving ? (isReassignment ? 'Changing…' : 'Assigning…') : (isReassignment ? 'Change Rider' : 'Assign Rider')}</button>
        </div>
      </div>
    </div>
  );
};

export default AssignRiderModal;
