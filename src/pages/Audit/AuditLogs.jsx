import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Search, ChevronDown, ChevronRight, ShieldCheck, LogIn, Pencil, Plus, Trash2, AlertTriangle, Monitor, MapPin } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { getAuditLogs } from '../../api/auditApi';
import useDebounce from '../../hooks/useDebounce';
import usePagination from '../../hooks/usePagination';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Pagination from '../../components/UI/Pagination';
import { formatInTimeZone } from '../../utils/datetime';
import { describeAction, toPairs } from './auditFormat';
import useQueryState from '../../hooks/useQueryState';

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'auto', label: 'Changes' },
  { value: 'auth', label: 'Sign-in / out' },
  { value: 'action', label: 'Detailed actions' },
];

const VERB_ICON = { Created: Plus, Updated: Pencil, Deleted: Trash2 };
const actionIcon = (log) => {
  if (log.action === 'auth.login') return LogIn;
  if (log.action === 'auth.logout' || log.action === 'auth.login_failed') return ShieldCheck;
  return VERB_ICON[describeAction(log).verb] ?? ScrollText;
};

// Readable key→value grid for a before/after payload.
const DetailPairs = ({ title, obj }) => {
  const pairs = toPairs(obj);
  if (!pairs.length) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{title}</p>
      <dl className="rounded-lg border border-slate-100 bg-white divide-y divide-slate-50">
        {pairs.map(({ key, value }) => (
          <div key={key} className="flex items-start justify-between gap-4 px-3 py-1.5">
            <dt className="text-[11px] text-gray-500">{key}</dt>
            <dd className="text-[11px] font-medium text-gray-800 text-right break-words max-w-[60%]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const Row = ({ log, tz }) => {
  const [open, setOpen] = useState(false);
  const desc = describeAction(log);
  const Icon = actionIcon(log);
  const failed = log.statusCode && log.statusCode >= 400;
  const hasDetail = (log.before && Object.keys(log.before).length) || (log.after && Object.keys(log.after).length);

  return (
    <>
      <tr
        className={clsx('border-b border-slate-50 hover:bg-slate-50/60 transition-colors', hasDetail && 'cursor-pointer')}
        onClick={() => hasDetail && setOpen((o) => !o)}
      >
        <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500 tabular-nums">
          {formatInTimeZone(log.timestamp, tz)}
        </td>
        <td className="px-4 py-2.5">
          <p className="text-sm font-medium text-gray-900 leading-tight">{log.actorName}</p>
          {log.actorRole && <p className="text-[10px] text-gray-400 capitalize">{log.actorRole}</p>}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className={clsx('inline-flex h-6 w-6 items-center justify-center rounded-lg shrink-0', desc.cls)}>
              <Icon size={13} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{desc.title}</p>
              <p className="text-[10px] text-gray-400 truncate">{log.method ? `${log.method} ${log.path}` : log.action}</p>
            </div>
            {hasDetail && (open ? <ChevronDown size={13} className="text-gray-300 ml-auto shrink-0" /> : <ChevronRight size={13} className="text-gray-300 ml-auto shrink-0" />)}
          </div>
        </td>
        <td className="px-4 py-2.5">
          {log.statusCode != null && (
            <span className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              failed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            )}>
              {failed && <AlertTriangle size={9} />}{log.statusCode}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 align-top">
          <div className="text-[11px] text-gray-600 leading-tight space-y-0.5">
            {log.device && (
              <p className="flex items-center gap-1"><Monitor size={10} className="text-gray-400 shrink-0" />{log.device}</p>
            )}
            <p className="flex items-center gap-1 text-gray-400">
              <MapPin size={10} className="shrink-0" />
              <span>{log.location || 'Unknown'}{log.ip ? ` · ${log.ip}` : ''}</span>
            </p>
          </div>
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="bg-slate-50/40">
          <td colSpan={5} className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailPairs title="Before" obj={log.before} />
              <DetailPairs title={log.before ? 'After' : 'Details'} obj={log.after} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useQueryState('search', '');
  const [module, setModule] = useQueryState('module', '');
  const [source, setSource] = useQueryState('source', '');
  const [from, setFrom] = useQueryState('from', '');
  const [to, setTo] = useQueryState('to', '');
  const pagination = usePagination(30);
  const debouncedSearch = useDebounce(search, 400);
  const tz = undefined; // browser timezone for the audit trail viewer

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getAuditLogs({
        page: pagination.page,
        limit: pagination.pageSize,
        search: debouncedSearch || undefined,
        module: module || undefined,
        source: source || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      const d = data?.data ?? {};
      setLogs(d.logs ?? []);
      setModules(d.modules ?? []);
      pagination.setTotal(d.pagination?.total ?? 0);
    } catch {
      toast.error('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.pageSize, debouncedSearch, module, source, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { pagination.reset(); }, [debouncedSearch, module, source, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ScrollText size={22} className="text-indigo-600" /> Audit Logs
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Every change and sign-in across the system. Owner-only.
        </p>
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search user, action, path…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>
        <div className="min-w-[150px]">
          <SearchableSelect
            options={[{ value: '', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: m }))]}
            value={module}
            onChange={setModule}
          />
        </div>
        <div className="min-w-[150px]">
          <SearchableSelect options={SOURCE_OPTIONS} value={source} onChange={setSource} />
        </div>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </FilterBar>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `${pagination.total} ${pagination.total === 1 ? 'entry' : 'entries'}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['When', 'Who', 'Action', 'Status', 'Origin'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Loading audit trail…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No activity found for these filters.</td></tr>
              ) : (
                logs.map((log) => <Row key={log._id} log={log} tz={tz} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination {...pagination} />
    </div>
  );
};

export default AuditLogs;
