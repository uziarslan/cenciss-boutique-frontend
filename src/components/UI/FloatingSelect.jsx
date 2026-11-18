import { useId } from 'react';
import SearchableSelect from './SearchableSelect';

/** Select input with a persistent floating label and the app's searchable menu. */
const FloatingSelect = ({
  label,
  options = [],
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  searchable = true,
  className = '',
  containerClassName = '',
  id,
  name,
  ...props
}) => (
  <FloatingSelectField
    label={label}
    options={options}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    error={error}
    disabled={disabled}
    searchable={searchable}
    className={className}
    containerClassName={containerClassName}
    id={id}
    name={name}
    props={props}
  />
);

const FloatingSelectField = ({ label, options, value, onChange, placeholder, error, disabled, searchable, className, containerClassName, id, name, props }) => {
  const reactId = useId();
  const inputId = id || `floating-select-${reactId}`;
  return (
    <div className={`relative pt-1 ${containerClassName}`}>
      {label && <label htmlFor={inputId} className="pointer-events-none absolute left-3 top-0 z-10 -translate-y-1/2 bg-white px-1 text-[11px] font-semibold text-gray-500">{label}</label>}
      <SearchableSelect
        {...props}
        id={inputId}
        name={name}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder || (label ? `Select ${label.toLowerCase()}` : 'Select…')}
        error={error}
        disabled={disabled}
        searchable={searchable}
        className={`min-h-[44px] rounded-xl py-2.5 ${className}`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default FloatingSelect;
