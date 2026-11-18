const PreparationChoice = ({ value, onChange, disabled = false, subject = 'item' }) => (
  <fieldset className="mt-4" disabled={disabled}>
    <legend className="text-sm font-medium text-surface-700">Has the kitchen already prepared this {subject}?</legend>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {[{ value: false, label: 'Not prepared' }, { value: true, label: 'Already prepared' }].map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50 ${value === option.value
            ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
            : 'border-surface-200 text-surface-700 hover:bg-surface-50'}`}
        >{option.label}</button>
      ))}
    </div>
  </fieldset>
);

export default PreparationChoice;
