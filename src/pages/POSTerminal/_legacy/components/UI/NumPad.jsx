import { useEffect } from 'react';

const ROWS = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', '⌫']];

const NumPad = ({ value, onChange, onConfirm, mode = 'qty', withKeyboard = false }) => {
  const handlePress = (key) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === '.' && mode === 'qty') return;
    if (key === '.' && value.includes('.')) return;
    onChange(`${value}${key}`);
  };

  useEffect(() => {
    if (!withKeyboard) return;
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); handlePress(e.key); }
      else if (e.key === '.' && mode !== 'qty') { e.preventDefault(); handlePress('.'); }
      else if (e.key === 'Backspace') { e.preventDefault(); handlePress('⌫'); }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withKeyboard, value, mode]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {ROWS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handlePress(key)}
            className={`rounded-2xl py-4 text-xl font-semibold transition-all duration-150 active:scale-95 ${
              key === '⌫'
                ? 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                : 'border border-surface-200 bg-white text-surface-900 shadow-card hover:shadow-card-hover hover:border-brand-300'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="btn-primary w-full py-4"
      >
        Confirm
      </button>
    </div>
  );
};

export default NumPad;
