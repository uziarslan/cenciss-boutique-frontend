import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/UI/Button';
import Portal from '../../components/UI/Portal';
import { bulkImportEmployees, previewEmployeeBulkImport } from '../../api/salaryApi';
import {
  downloadEmployeeImportTemplate,
  parseEmployeeImportWorkbook,
} from '../../utils/employeeImportWorkbook';

const EMPTY_SUMMARY = { total: 0, ready: 0, update: 0, unchanged: 0, duplicate: 0, invalid: 0 };

const DUPLICATE_OPTIONS = [
  { value: 'changes_only', label: 'Update new changes only', description: 'Only update filled fields that differ. Keep unchanged values and existing values for blank cells.' },
  { value: 'entire_record', label: 'Update entire record', description: 'Replace all template fields. Blank optional cells clear existing values or reset them to template defaults.' },
  { value: 'skip', label: 'Skip existing employees', description: 'Only add employees whose CNIC is new.' },
];

const SUMMARY_CARDS = [
  { key: 'total', label: 'Rows', box: 'border-slate-200 bg-slate-50', value: 'text-slate-700', labelClass: 'text-slate-500' },
  { key: 'ready', label: 'New', box: 'border-emerald-200 bg-emerald-50', value: 'text-emerald-700', labelClass: 'text-emerald-600' },
  { key: 'update', label: 'To update', box: 'border-indigo-200 bg-indigo-50', value: 'text-indigo-700', labelClass: 'text-indigo-600' },
  { key: 'unchanged', label: 'Unchanged', box: 'border-slate-200 bg-slate-50', value: 'text-slate-700', labelClass: 'text-slate-500' },
  { key: 'duplicate', label: 'Duplicate', box: 'border-amber-200 bg-amber-50', value: 'text-amber-700', labelClass: 'text-amber-600' },
  { key: 'invalid', label: 'Invalid', box: 'border-rose-200 bg-rose-50', value: 'text-rose-700', labelClass: 'text-rose-600' },
];

const STATUS_META = {
  ready: { label: 'Ready', badge: 'bg-emerald-100 text-emerald-700' },
  update: { label: 'Update', badge: 'bg-indigo-100 text-indigo-700' },
  unchanged: { label: 'Unchanged', badge: 'bg-slate-100 text-slate-600' },
  duplicate: { label: 'Duplicate', badge: 'bg-amber-100 text-amber-700' },
  invalid: { label: 'Invalid', badge: 'bg-rose-100 text-rose-700' },
};

const formatPKR = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
const formatChangeValue = (value, field, outlets) => {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field === 'salary') return formatPKR(value);
  if (field === 'outlet') return outlets.find((outlet) => String(outlet._id ?? outlet.id) === String(value))?.name || String(value);
  return String(value);
};

const EmployeeBulkImportModal = ({ outlets, onClose, onImported }) => {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState([]);
  // Keep the source cells, including blanks, for every preview and confirmation.
  // Normalized preview values include defaults and must never become input.
  const [sourceRows, setSourceRows] = useState([]);
  const [fileColumns, setFileColumns] = useState(null);
  const [duplicateMode, setDuplicateMode] = useState('changes_only');
  const [previewValid, setPreviewValid] = useState(false);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const actionableCount = summary.ready + summary.update;
  const confirmLabel = [summary.ready ? `Import ${summary.ready}` : '', summary.update ? `Update ${summary.update}` : '']
    .filter(Boolean).join(' · ') || 'No changes to import';

  const validateRows = async (rows, mode = duplicateMode) => {
    const { data } = await previewEmployeeBulkImport(rows, mode);
    setPreviewRows(data?.data || []);
    setSummary({ ...EMPTY_SUMMARY, ...data?.summary });
    setPreviewValid(true);
  };

  const handleDuplicateMode = async (mode) => {
    setDuplicateMode(mode);
    setPreviewValid(false);
    setBusy(true);
    setError('');
    try {
      await validateRows(sourceRows, mode);
    } catch (previewError) {
      setError(previewError?.response?.data?.message || 'Could not refresh the preview. Select an import option to try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadEmployeeImportTemplate(outlets);
      toast.success('Employee import template downloaded.');
    } catch (downloadError) {
      toast.error(downloadError?.message || 'Could not create the Excel template.');
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Upload the .xlsx template downloaded from this screen.');
      return;
    }

    setBusy(true);
    setPreviewValid(false);
    setError('');
    setPreviewRows([]);
    setSourceRows([]);
    setFileColumns(null);
    setSummary(EMPTY_SUMMARY);
    try {
      const parsed = await parseEmployeeImportWorkbook(file, { includeMetadata: true });
      if (!parsed.rows.length) throw new Error('The Employees sheet has no filled employee rows.');
      await validateRows(parsed.rows);
      setSourceRows(parsed.rows);
      setFileColumns({ columns: parsed.columns, readOnlyColumns: parsed.readOnlyColumns, totalRows: parsed.rows.length });
      setFileName(file.name);
    } catch (uploadError) {
      setFileName('');
      setError(uploadError?.response?.data?.message || uploadError?.message || 'Could not read this Excel file.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (rowNumber) => {
    const remaining = sourceRows.filter((row) => row.rowNumber !== rowNumber);
    setPreviewValid(false);
    if (!remaining.length) {
      setSourceRows([]);
      setPreviewRows([]);
      setSummary(EMPTY_SUMMARY);
      return;
    }

    setBusy(true);
    setError('');
    try {
      // Revalidate so a remaining row from a duplicate pair becomes ready.
      await validateRows(remaining);
      setSourceRows(remaining);
    } catch (removeError) {
      setError(removeError?.response?.data?.message || 'Could not revalidate the remaining rows.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewValid || busy || confirming || !actionableCount) return;
    setConfirming(true);
    setError('');
    try {
      const { data } = await bulkImportEmployees(sourceRows, duplicateMode);
      const created = Number(data?.summary?.created || 0);
      const updated = Number(data?.summary?.updated || 0);
      const unchanged = Number(data?.summary?.unchanged || 0);
      const skipped = Number(data?.summary?.skipped || 0);
      const message = `${created} created; ${updated} updated${unchanged ? `; ${unchanged} unchanged` : ''}${skipped ? `; ${skipped} skipped` : ''}.`;
      if (created || updated || unchanged) toast.success(message);
      else toast.error(message);
      onImported?.(data);
      onClose?.();
    } catch (confirmError) {
      setError(confirmError?.response?.data?.message || 'Employee import failed. Please review the rows and try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
        <div role="dialog" aria-modal="true" aria-labelledby="employee-import-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-white/20">
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 px-5 py-5 text-white sm:px-6">
            <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/15 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">Bulk import</p>
                  <h2 id="employee-import-title" className="mt-0.5 text-xl font-bold">Import employees from Excel</h2>
                  <p className="mt-1 text-xs text-indigo-100/90">Upload, choose how to handle existing employees, then review and confirm.</p>
                </div>
              </div>
              <button type="button" onClick={onClose} disabled={confirming} className="rounded-xl p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Close import">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <div>
                <p className="text-sm font-semibold text-indigo-950">Start with the prepared template</p>
                <p className="mt-0.5 text-xs text-indigo-700">It contains the required headers, accepted formats, and your valid outlet codes.</p>
              </div>
              <Button variant="secondary" icon={Download} onClick={handleTemplateDownload}>
                Download Empty Template
              </Button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || confirming}
              className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-7 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? <Loader2 size={25} className="animate-spin text-indigo-600" /> : <Upload size={25} className="text-indigo-600" />}
              <span className="mt-2 text-sm font-semibold text-slate-800">{busy ? 'Reading and validating…' : 'Choose completed .xlsx file'}</span>
              <span className="mt-1 text-xs text-slate-500">Maximum 500 employee rows per upload</span>
              <span className="mt-1 text-xs text-slate-500">After editing in Excel, save the workbook and select it again to refresh this preview.</span>
            </button>
            <input ref={fileInputRef} type="file" aria-label="Employee Excel file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} className="hidden" />

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="mt-5 space-y-4">
                {fileColumns && (
                  <details className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                    <summary className="cursor-pointer font-semibold text-slate-800">
                      Excel fields read: {fileColumns.columns.filter((column) => column.present).length} of {fileColumns.columns.length} · Device Employee No.: {fileColumns.columns.find((column) => column.key === 'deviceEmployeeNo')?.filled || 0} of {fileColumns.totalRows} rows filled
                    </summary>
                    <p className="mt-2">CNIC identifies the employee. Every other import field below is compared with that employee’s saved value.</p>
                    <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                      {fileColumns.columns.map((column) => (
                        <li key={column.key} className={!column.present ? 'text-amber-700' : ''}>
                          <span className="font-medium">{column.header}:</span> {column.present ? `${column.filled} filled, ${fileColumns.totalRows - column.filled} blank` : 'Column missing'}
                        </li>
                      ))}
                    </ul>
                    {fileColumns.readOnlyColumns.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="font-medium">Informational export columns</p>
                        {fileColumns.readOnlyColumns.map((column) => <p key={column.header} className="mt-1">{column.header}: {column.reason}. This column does not update employee data.</p>)}
                      </div>
                    )}
                  </details>
                )}
                <fieldset disabled={busy || confirming} className="rounded-2xl border border-indigo-100 bg-white p-4">
                  <legend className="px-1 text-sm font-semibold text-slate-900">How should existing employees be updated?</legend>
                  <p className="mb-3 text-xs text-slate-500">Employees are matched by CNIC. Choose what to do when a match is found.</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {DUPLICATE_OPTIONS.map((option) => (
                      <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition ${duplicateMode === option.value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'} ${busy || confirming ? 'cursor-wait opacity-60' : ''}`}>
                        <input type="radio" name="employee-import-duplicate-mode" value={option.value} checked={duplicateMode === option.value} onChange={() => handleDuplicateMode(option.value)} onClick={() => { if (!previewValid && duplicateMode === option.value) handleDuplicateMode(option.value); }} className="mt-0.5 accent-indigo-600" />
                        <span>
                          <span className="block text-xs font-semibold text-slate-900">{option.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-slate-500">{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Both update options keep the employee ID, attendance, payroll history, and face enrollment. Identical records are left unchanged.</p>
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{fileName}</p>
                    <p className="text-xs text-slate-500">Review every parsed employee before confirmation.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-live="polite">
                    {SUMMARY_CARDS.map((card) => (
                      <div key={card.key} className={`min-w-[76px] rounded-xl border px-2.5 py-2 text-center ${card.box}`}>
                        <p className={`text-lg font-bold leading-none ${card.value}`}>{summary[card.key]}</p>
                        <p className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${card.labelClass}`}>{card.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="max-h-[430px] overflow-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Row</th>
                          <th className="px-3 py-3">Employee</th>
                          <th className="px-3 py-3">CNIC</th>
                          <th className="px-3 py-3">Device Employee No.</th>
                          <th className="px-3 py-3">Outlet</th>
                          <th className="px-3 py-3">Salary</th>
                          <th className="px-3 py-3">Status / validation</th>
                          <th className="px-3 py-3 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewRows.map((row) => {
                          const status = STATUS_META[row.status] || STATUS_META.invalid;
                          return (
                            <tr key={row.rowNumber} className="align-top hover:bg-slate-50/70">
                              <td className="px-3 py-3 font-mono text-slate-500">{row.rowNumber}</td>
                              <td className="px-3 py-3">
                                <p className="font-semibold text-slate-900">{row.data?.name || 'Unnamed employee'}</p>
                                <p className="mt-0.5 text-slate-500">{[row.data?.designation, row.data?.department].filter(Boolean).join(' · ') || '—'}</p>
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">{row.data?.cnic || '—'}</td>
                              <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                                {String(sourceRows.find((source) => source.rowNumber === row.rowNumber)?.deviceEmployeeNo ?? '').trim() || 'Blank in Excel'}
                              </td>
                              <td className="px-3 py-3">
                                <p className="font-medium text-slate-800">{row.data?.outletName || row.data?.outletCode || '—'}</p>
                                {row.data?.outletName && <p className="mt-0.5 font-mono text-slate-400">{row.data.outletCode}</p>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">{formatPKR(row.data?.salary)}</td>
                              <td className="min-w-[260px] px-3 py-3">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.badge}`}>
                                  {status.label}
                                </span>
                                {row.status === 'unchanged' && <p className="mt-1.5 text-[11px] text-slate-500">No changes needed. This record will be left as is.</p>}
                                {row.status === 'update' && row.changes?.length > 0 && (
                                  <details className="mt-1.5 text-[11px] text-slate-600">
                                    <summary className="cursor-pointer font-medium text-indigo-700">{row.changes.length} field{row.changes.length === 1 ? '' : 's'} changed</summary>
                                    <ul className="mt-1.5 space-y-1">
                                      {row.changes.map((change) => (
                                        <li key={change.field} className="break-words">
                                          <span className="font-semibold">{change.label}:</span> {formatChangeValue(change.previous, change.field, outlets)} → {formatChangeValue(change.next, change.field, outlets)}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                                {row.errors?.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-rose-600">
                                    {row.errors.map((message) => <li key={message}>• {message}</li>)}
                                  </ul>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button type="button" onClick={() => handleRemove(row.rowNumber)} disabled={busy || confirming} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40" title="Remove from import">
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                {(summary.duplicate > 0 || summary.invalid > 0) && (
                  <p className="text-xs text-slate-500">Invalid rows and repeated CNICs within this file will be skipped. Remove extra rows or correct the file and upload again.{duplicateMode === 'skip' ? ' Existing employees will also be skipped.' : ''}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <p className="text-xs text-slate-500">Matches and changes are checked again when you confirm.</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={confirming}>Cancel</Button>
              <Button variant="primary" icon={confirming ? Loader2 : CheckCircle2} onClick={handleConfirm} disabled={busy || confirming || !previewValid || actionableCount === 0}>
                {confirming ? 'Importing…' : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default EmployeeBulkImportModal;
