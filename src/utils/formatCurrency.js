/**
 * Format a number as Rs. currency.
 * e.g. 1234567.5 → "Rs. 1,234,567.50"
 */
export const formatCurrency = (amount, options = {}) => {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const formatted = num.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  });
  return `Rs. ${formatted}`;
};

export default formatCurrency;
