// Shared date/time helpers for rendering timestamps in a specific (outlet)
// timezone, plus the IANA timezone list for the outlet form's selector.

const FALLBACK_ZONES = [
  'Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Kathmandu', 'Asia/Kabul', 'Asia/Tehran', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Asia/Tokyo', 'Asia/Shanghai', 'Europe/London', 'Europe/Paris', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Australia/Sydney', 'UTC',
];

// All IANA zones the browser knows (Chrome/modern), with a curated fallback.
const ALL_ZONES = (() => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const z = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(z) && z.length) return z;
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_ZONES;
})();

// Current UTC offset label (e.g. "GMT+5") for a zone, for nicer option text.
const offsetLabel = (tz) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
};

// Options for the outlet timezone SearchableSelect: { value, label }.
export const TIMEZONE_OPTIONS = ALL_ZONES.map((tz) => {
  const off = offsetLabel(tz);
  return { value: tz, label: off ? `${tz} (${off})` : tz };
});

// Format an instant in a specific timezone. `opts` are Intl.DateTimeFormat
// options; defaults to a medium date + short time. Falls back to the browser
// locale/zone when tz is missing or invalid.
export const formatInTimeZone = (date, tz, opts) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const options = opts || { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, ...(tz ? { timeZone: tz } : {}) }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(d);
  }
};

// Convenience: time-only (e.g. "01:09 PM") in a timezone.
export const formatTimeInTimeZone = (date, tz) =>
  formatInTimeZone(date, tz, { hour: '2-digit', minute: '2-digit', hour12: true });

// A scheduled HH:mm is already an outlet-local wall-clock time, not an instant.
export const formatTimeOfDay = (value) => {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value || '')) return '';
  const [hour, minute] = value.split(':').map(Number);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};

// Business dates and month labels must not move when viewed in another timezone.
export const formatDateOnly = (value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  return formatInTimeZone(`${value}T00:00:00.000Z`, 'UTC', opts);
};
