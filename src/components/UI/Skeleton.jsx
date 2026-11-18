const SkeletonCell = ({ wide }) => (
  <td className="px-4 py-3">
    <div className={`h-4 bg-gray-200 rounded animate-pulse ${wide ? 'w-32' : 'w-20'}`} />
  </td>
);

const SkeletonRow = ({ cols }) => (
  <tr className="border-b border-gray-100">
    {Array.from({ length: cols }).map((_, i) => (
      <SkeletonCell key={i} wide={i === 1} />
    ))}
  </tr>
);

const Skeleton = ({ rows = 5, cols = 5 }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonRow key={i} cols={cols} />
    ))}
  </>
);

export default Skeleton;
