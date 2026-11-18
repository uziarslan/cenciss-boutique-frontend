import { Sparkles } from 'lucide-react';
import useFeatures from '../../hooks/useFeatures';

/**
 * Wraps a Membership/Rewards report so it never blows up if the feature is
 * disabled — shows an inline informational state instead.
 */
const MembershipFeatureGuard = ({ children }) => {
  const { hasFeature } = useFeatures();
  if (hasFeature('membershipRewards')) return children;

  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/40 px-6 py-12 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-white border border-amber-200 flex items-center justify-center mb-4">
        <Sparkles size={20} className="text-amber-500" />
      </div>
      <h3 className="text-base font-bold text-gray-800">Membership / Rewards is disabled</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-md">
        Ask your administrator to enable the Membership / Rewards feature for your account to view this report.
      </p>
    </div>
  );
};

export default MembershipFeatureGuard;
