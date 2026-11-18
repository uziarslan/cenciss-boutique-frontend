import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdvanceDeletionPreview } from '../../api/salaryApi';
import PremiumModal, { ModalSection, inputCls, PrimaryButton, SecondaryButton } from '../../components/UI/PremiumModal';

// ── Void confirmation modal ───────────────────────────────────────────────────
// Universal destructive-action confirmation with a mandatory audit reason.
// The server decides whether the action reverses or permanently deletes rows.
export const VoidReasonModal = ({ open, target, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletionCheck, setDeletionCheck] = useState(null);
  const isDelete = target?.kind === 'delete-advance';
  const targetId = target?.id;

  useEffect(() => { if (!open) { setReason(''); setBusy(false); } }, [open]);
  useEffect(() => {
    setDeletionCheck(null);
    if (!open || !isDelete) return undefined;
    let cancelled = false;
    getAdvanceDeletionPreview(targetId).then(({ data }) => {
      if (!cancelled) setDeletionCheck({ id: targetId, data: data?.data, error: data?.data ? null : 'Could not check this advance. Close and try again.' });
    }).catch((error) => {
      if (!cancelled) setDeletionCheck({ id: targetId, error: error?.response?.data?.message || 'Could not check this advance. Close and try again.' });
    });
    return () => { cancelled = true; };
  }, [open, isDelete, targetId]);

  if (!open || !target) return null;
  const check = deletionCheck?.id === targetId ? deletionCheck : null;
  const deletionPreview = check?.data;
  const restoringOrder = deletionPreview?.mode === 'restore-pos';

  const handle = async () => {
    if (isDelete && !deletionPreview) return;
    if (!reason.trim()) return toast.error('Please enter a reason.');
    if (isDelete && reason.trim().length < 5) return toast.error('Please enter at least 5 characters.');
    setBusy(true);
    try {
      await onConfirm(reason.trim(), deletionPreview?.mode);
      onClose();
    } catch (err) {
      if (isDelete && err?.response?.status === 409) {
        setDeletionCheck({ id: targetId, error: err.response.data?.message || 'This advance has changed. Close and review it again.' });
      }
      toast.error(err?.response?.data?.message ?? (isDelete ? 'Delete failed.' : 'Void failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PremiumModal
      open
      onClose={busy ? undefined : onClose}
      eyebrow={restoringOrder ? 'Remove Salary Charge' : isDelete ? 'Permanent Delete' : 'Void'}
      title={restoringOrder ? target.title.replace('Delete advance', 'Remove CTS') : target.title}
      subtitle={target.subtitle}
      icon={isDelete ? Trash2 : Ban}
      accent="rose"
      size="md"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton accent="rose" onClick={handle} disabled={busy || !reason.trim() || (isDelete && (!deletionPreview || reason.trim().length < 5))}>
            {busy ? (restoringOrder ? 'Restoring…' : isDelete ? 'Deleting…' : 'Voiding…') : (isDelete ? deletionPreview?.confirmLabel || (check?.error ? 'Unavailable' : 'Checking…') : 'Confirm Void')}
          </PrimaryButton>
        </>
      }
    >
      <ModalSection
        icon={AlertTriangle}
        accent="rose"
        title="Heads up"
        subtitle={isDelete ? deletionPreview?.summary || (check?.error ? 'Removal is unavailable for this advance' : 'Checking the advance and its linked records') : 'Voiding is permanent in the audit trail'}
      >
        {isDelete && !deletionPreview ? (
          <p role={check?.error ? 'alert' : 'status'} className="text-sm text-slate-700">
            {check?.error || 'Checking what will happen to this advance and its POS order…'}
          </p>
        ) : (
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
            {(isDelete ? deletionPreview.consequences : target.consequences)?.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </ModalSection>
      <ModalSection title="Reason" subtitle="Required — captured in the audit log">
        <textarea
          rows={3}
          className={inputCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={isDelete ? 'e.g. Duplicate advance entered by mistake…' : 'e.g. Wrong amount entered, paid to wrong employee, duplicate entry…'}
        />
      </ModalSection>
    </PremiumModal>
  );
};
