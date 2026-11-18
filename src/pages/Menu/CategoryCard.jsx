import { GripVertical, Edit3, Trash2 } from 'lucide-react';
import clsx from 'clsx';

const CategoryCard = ({ category, selected, onSelect, onEdit, onDelete, onDragStart, onDragOver, onDrop, dragOver }) => (
  <div
    draggable
    onDragStart={() => onDragStart && onDragStart(category._id)}
    onDragOver={(e) => { e.preventDefault(); onDragOver && onDragOver(category._id); }}
    onDrop={(e) => { e.preventDefault(); onDrop && onDrop(); }}
    onClick={() => onSelect && onSelect()}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect && onSelect(); } }}
    role="button"
    tabIndex={0}
    aria-pressed={selected}
    className={clsx(
      'rounded-xl transition cursor-pointer bg-white border',
      selected
        ? 'border-indigo-300 ring-2 ring-indigo-500/30 shadow-sm'
        : 'border-gray-100 hover:border-gray-200 hover:shadow-sm',
      dragOver && 'ring-2 ring-indigo-400/50'
    )}
  >
    <div className="px-3 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <GripVertical size={16} className="text-gray-300 shrink-0" />
        <span
          className="inline-block rounded-full h-3 w-3 shrink-0 ring-2 ring-white shadow-sm"
          style={{ backgroundColor: category.color || '#4F46E5' }}
        />
        <div className="min-w-0">
          <p className={clsx('text-sm truncate', selected ? 'font-bold text-indigo-700' : 'font-semibold text-gray-800')}>
            {category.name}
          </p>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">Sort {category.sortOrder ?? 0}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(category); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
            title="Edit category"
          >
            <Edit3 size={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(category); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
            title="Delete category"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  </div>
);

export default CategoryCard;
