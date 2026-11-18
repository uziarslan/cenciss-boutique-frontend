import clsx from 'clsx';

/**
 * Premium button. Variants: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gradient'
 */
const VARIANTS = {
  primary:   'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
  gradient:  'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:brightness-110',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost:     'text-slate-600 hover:bg-slate-100',
  danger:    'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-5 py-2.5 text-sm rounded-xl',
};

const Button = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  ...rest
}) => (
  <button
    {...rest}
    className={clsx(
      'inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40',
      VARIANTS[variant] || VARIANTS.primary,
      SIZES[size] || SIZES.md,
      className
    )}
  >
    {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
    {children}
    {IconRight && <IconRight size={size === 'sm' ? 13 : 15} />}
  </button>
);

export default Button;
