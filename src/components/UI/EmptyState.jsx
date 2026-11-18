import { Inbox } from 'lucide-react';

const EmptyState = ({ message = 'No results found.', icon: Icon = Inbox }) => (
  <tr>
    <td colSpan={100}>
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Icon size={40} strokeWidth={1.5} className="mb-3" />
        <p className="text-sm">{message}</p>
      </div>
    </td>
  </tr>
);

export default EmptyState;
