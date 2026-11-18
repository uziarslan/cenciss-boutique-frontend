import { Fragment } from 'react';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import clsx from 'clsx';

/**
 * Premium table.
 *
 * columns: Array<{
 *   key: string,
 *   header: string,
 *   render?: (value, row) => ReactNode,
 *   className?: string,        // applied to <td>
 *   headerClassName?: string,  // applied to <th>
 *   align?: 'left' | 'right' | 'center'
 * }>
 *
 * data: Array<object>
 * loading: boolean
 * emptyMessage: string
 * rowClassName: (row) => string
 * onRowClick: (row) => void   — when set, rows become clickable
 */
const Table = ({
  columns,
  data,
  loading = false,
  emptyMessage = 'No records found.',
  rowClassName,
  onRowClick,
  expandedRowRender,
  isRowExpanded,
  bare = false, // when true, omit outer wrapper (parent provides it, e.g. <Card padding={false}>)
}) => {
  const inner = (
    <table className="min-w-full text-sm text-left">
      <thead className="bg-slate-50/80 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-sm">
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={clsx(
                'px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap',
                col.align === 'right' && 'text-right',
                col.align === 'center' && 'text-center',
                col.headerClassName
              )}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {loading ? (
          <Skeleton rows={6} cols={columns.length} />
        ) : data.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          data.map((row, ri) => {
            const expanded = Boolean(expandedRowRender && isRowExpanded?.(row));
            return (
              <Fragment key={row._id ?? ri}>
                <tr
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={clsx(
                    'transition-colors',
                    onRowClick && 'cursor-pointer',
                    expanded ? 'bg-indigo-50/50' : 'hover:bg-indigo-50/40',
                    rowClassName ? rowClassName(row) : ''
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={clsx(
                        'px-4 py-3.5 text-slate-700 whitespace-nowrap align-middle',
                        col.align === 'right' && 'text-right tabular-nums',
                        col.align === 'center' && 'text-center',
                        col.className
                      )}
                    >
                      {col.render
                        ? col.render(row[col.key], row)
                        : (row[col.key] ?? <span className="text-slate-300">—</span>)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={columns.length} className="px-5 py-4 whitespace-normal">
                      {expandedRowRender(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })
        )}
      </tbody>
    </table>
  );

  if (bare) {
    return <div className="overflow-x-auto">{inner}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      {inner}
    </div>
  );
};

export default Table;
