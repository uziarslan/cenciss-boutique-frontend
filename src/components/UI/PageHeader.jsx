import clsx from 'clsx';

/**
 * Standard page header used across every back-office page.
 * Mirrors the spacing and typography used on the Dashboard.
 *
 *   <PageHeader title="Vendors" subtitle="Manage suppliers" actions={<Button/>} />
 */
const PageHeader = ({ title, subtitle, actions, icon: Icon, className }) => (
  <div className={clsx('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-indigo-50 items-center justify-center shrink-0">
          <Icon size={20} className="text-indigo-600" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="break-words text-xl font-bold tracking-tight text-gray-900 sm:truncate sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
