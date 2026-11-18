import { forwardRef, useMemo } from 'react';

// Formats a numeric string with thousands separators while preserving any
// trailing decimal the user is in the middle of typing (e.g. "1234." → "1,234.").
const formatAmountString = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return '';
  // Strip everything except digits and the first decimal point.
  let cleaned = String(raw).replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  if (cleaned === '' || cleaned === '.') return cleaned;
  const [intPart, decPart] = cleaned.split('.');
  const intFormatted = intPart === '' ? '' : Number(intPart).toLocaleString('en-US');
  return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
};

const stripCommas = (str) => String(str ?? '').replace(/,/g, '');

/**
 * Live-formatted amount input. Displays "1,234.25" while the user types and
 * emits the raw numeric string (no commas) via onChange so parent state stays
 * compatible with existing numeric handling.
 *
 * Props mirror a normal <input>:
 *   value         number | string  — current value (raw, no commas)
 *   onChange      (rawString) => void
 *   onValueChange (rawString) => void  — alias of onChange for clarity
 *   maxDecimals   number (default 2)
 */
const AmountInput = forwardRef(function AmountInput(
  { value, onChange, onValueChange, maxDecimals = 2, onBlur, className, ...rest },
  ref
) {
  const display = useMemo(() => {
    if (value === '' || value === null || value === undefined) return '';
    return formatAmountString(String(value));
  }, [value]);

  const handleChange = (e) => {
    let raw = stripCommas(e.target.value);
    // Allow only digits and a single decimal point.
    raw = raw.replace(/[^\d.]/g, '');
    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) {
      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    }
    if (firstDot !== -1 && maxDecimals >= 0) {
      const [i, d = ''] = raw.split('.');
      raw = `${i}.${d.slice(0, maxDecimals)}`;
    }
    if (onChange) onChange(raw);
    if (onValueChange) onValueChange(raw);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      className={className}
      {...rest}
    />
  );
});

export default AmountInput;
export { formatAmountString, stripCommas };
