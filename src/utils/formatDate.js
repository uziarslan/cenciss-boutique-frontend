import { format, parseISO, isValid } from 'date-fns';

/**
 * Format a date as "DD MMM YYYY"  e.g. 15 Apr 2026
 */
export const formatDate = (value) => {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, 'dd MMM yyyy') : '—';
};

/**
 * Format a date as "DD MMM YYYY, HH:mm"  e.g. 15 Apr 2026, 14:30
 */
export const formatDateTime = (value) => {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, 'dd MMM yyyy, HH:mm') : '—';
};

export default formatDate;
