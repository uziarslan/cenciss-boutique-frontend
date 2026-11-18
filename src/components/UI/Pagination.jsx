import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const Pagination = ({ page, pages, total, pageSize, hasPrev, hasNext, prev, next, goTo }) => {
  if (pages <= 1 && total === 0) return null;

  const from = Math.min((page - 1) * pageSize + 1, total);
  const to   = Math.min(page * pageSize, total);

  // Build a compact page window: prev2, prev1, current, next1, next2
  const makeRange = () => {
    const delta = 2;
    const range = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(pages, page + delta); i++) {
      range.push(i);
    }
    return range;
  };

  return (
    <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
      <p className="text-sm text-gray-500">
        {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={prev}
          disabled={!hasPrev}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {makeRange().map((n) => (
          <button
            key={n}
            onClick={() => goTo(n)}
            className={clsx(
              'w-8 h-8 rounded-lg text-sm font-medium transition',
              n === page
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {n}
          </button>
        ))}

        <button
          onClick={next}
          disabled={!hasNext}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
