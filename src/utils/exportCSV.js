/**
 * exportToCSV(data, filename)
 *
 * Converts an array of flat objects to a CSV blob and triggers a browser download.
 * - Column headers derived from keys of the first object.
 * - Values are JSON-stringified so commas / quotes inside values are escaped.
 *
 * @param {Object[]} data     - Array of plain objects (all same shape)
 * @param {string}   filename - Download filename (`.csv` appended if missing)
 */
export const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const escape  = (v) => JSON.stringify(v == null ? '' : v);

  const rows = [
    headers.map(escape).join(','),
    ...data.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];

  const csv  = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
