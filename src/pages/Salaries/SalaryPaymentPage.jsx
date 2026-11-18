import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { useGetEmployeesQuery, useGetSalaryPaymentsQuery, listQueryOpts } from '../../store/baseApi';
import useAuth from '../../hooks/useAuth';
import { SalaryPaymentForm } from './SalaryPaymentForm';

export default function SalaryPaymentPage() {
  const { paymentId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(paymentId);
  const allowed = !isEditing || role === 'owner';
  const employeesQuery = useGetEmployeesQuery(isEditing ? {} : { active: 'true' }, { ...listQueryOpts, skip: !allowed });
  const paymentsQuery = useGetSalaryPaymentsQuery({}, { ...listQueryOpts, skip: !isEditing || !allowed });
  const returnTo = location.state?.salaryReturnTo;
  const backTo = typeof returnTo === 'string' && (returnTo === '/salaries' || returnTo.startsWith('/salaries?')) ? returnTo : '/salaries';
  const close = () => navigate(backTo);

  if (!allowed) return <Navigate to="/salaries" replace />;
  if (employeesQuery.isLoading || (isEditing && paymentsQuery.isLoading)) {
    return <p role="status" className="py-16 text-center text-sm text-slate-500">Loading salary details…</p>;
  }
  if (employeesQuery.isError || (isEditing && paymentsQuery.isError)) {
    return <div role="alert" className="rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-slate-900">Salary details could not be loaded</h1>
      <p className="mt-2 text-sm text-slate-500">Try again before creating or editing a payment.</p>
      <button type="button" onClick={() => { employeesQuery.refetch(); if (isEditing) paymentsQuery.refetch(); }} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
      <button type="button" onClick={close} className="ml-3 text-sm font-semibold text-slate-600">Back to Salaries</button>
    </div>;
  }
  const payment = isEditing ? paymentsQuery.data?.find((item) => item._id === paymentId) : null;
  if (isEditing && (!payment || payment.voidedAt)) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-lg font-semibold text-slate-900">{payment?.voidedAt ? 'This payment has been voided' : 'Salary payment not found'}</h1><button type="button" onClick={close} className="mt-4 text-sm font-semibold text-indigo-600">Back to Salaries</button></div>;
  }
  return <SalaryPaymentForm key={paymentId || 'new'} employees={employeesQuery.data || []} payment={payment} onClose={close} />;
}
