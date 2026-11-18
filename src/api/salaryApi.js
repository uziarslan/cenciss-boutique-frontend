import api from './axios';

// ── Employees ─────────────────────────────────────────────────────────────────

export const listEmployees = (params = {}) =>
    api.get('/api/salary/employees', { params });

export const getEmployee = (id) =>
    api.get(`/api/salary/employees/${id}`);

export const createEmployee = (data) =>
    api.post('/api/salary/employees', data);

export const previewEmployeeBulkImport = (rows, duplicateMode = 'skip') =>
    api.post('/api/salary/employees/bulk-import/preview', { rows, duplicateMode });

export const bulkImportEmployees = (rows, duplicateMode = 'skip') =>
    api.post('/api/salary/employees/bulk-import', { rows, duplicateMode });

export const updateEmployee = (id, data) =>
    api.put(`/api/salary/employees/${id}`, data);

export const enrollEmployeeFace = (id, data) =>
    api.put(`/api/salary/employees/${id}/face-enroll`, data);

export const deactivateEmployee = (id) =>
    api.delete(`/api/salary/employees/${id}`);

// ── Salary Payments ───────────────────────────────────────────────────────────

export const listSalaryPayments = (params = {}) =>
    api.get('/api/salary/payments', { params });

export const paySalary = (data) =>
    api.post('/api/salary/payments', data);

export const updateSalaryPayment = (id, data) =>
    api.patch(`/api/salary/payments/${id}`, data);

export const voidSalaryPayment = (id, reason) =>
    api.post(`/api/salary/payments/${id}/void`, { reason });

// ── Advances ──────────────────────────────────────────────────────────────────

export const listAdvances = (params = {}) =>
    api.get('/api/salary/advances', { params });

export const giveAdvance = (data) =>
    api.post('/api/salary/advances', data);

export const updateAdvance = (id, data) =>
    api.patch(`/api/salary/advances/${id}`, data);

export const getAdvanceDeletionPreview = (id) =>
    api.get(`/api/salary/advances/${id}/deletion-preview`);

export const deleteAdvance = (id, reason, expectedMode) =>
    api.delete(`/api/salary/advances/${id}`, { data: { reason, expectedMode } });

export const repayAdvance = (id, data) =>
    api.post(`/api/salary/advances/${id}/repay`, data);

export const voidAdvance = (id, reason) =>
    api.post(`/api/salary/advances/${id}/void`, { reason });

export const voidRepayment = (advanceId, repaymentId, reason) =>
    api.post(`/api/salary/advances/${advanceId}/repayments/${repaymentId}/void`, { reason });

export const getOutstandingAdvance = (employeeId, params = {}) =>
    api.get(`/api/salary/advances/outstanding/${employeeId}`, { params });

export const getOutstandingAllowanceExcess = (employeeId) =>
    api.get(`/api/salary/allowance-excess/outstanding/${employeeId}`);

// Revenue heads for a charge-to-salary ("where to punch the sale").
export const getRevenueAccounts = () =>
    api.get('/api/salary/revenue-accounts');
