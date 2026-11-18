import { describe, expect, it } from 'vitest';
import {
  buildEmployeeImportWorkbook,
  EMPLOYEE_IMPORT_COLUMNS,
  parseEmployeeImportWorkbook,
} from './employeeImportWorkbook';

describe('employee import workbook', () => {
  it('builds an empty template with all headers, instructions, and outlet codes', async () => {
    const workbook = await buildEmployeeImportWorkbook([
      { code: 'MAIN', name: 'Main Branch' },
      { code: 'DHA', name: 'DHA Branch' },
    ]);
    const employees = workbook.getWorksheet('Employees');

    expect(employees.getRow(1).values.slice(1)).toEqual(
      EMPLOYEE_IMPORT_COLUMNS.map((column) => column.header),
    );
    expect(workbook.getWorksheet('Outlets').getCell('A2').value).toBe('MAIN');
    expect(workbook.getWorksheet('Instructions').getCell('A2').value).toBe('Name');
    expect(await parseEmployeeImportWorkbook(await workbook.xlsx.writeBuffer())).toEqual([]);
  });

  it('parses employee rows and preserves source row numbers', async () => {
    const workbook = await buildEmployeeImportWorkbook([{ code: 'MAIN', name: 'Main Branch' }]);
    const sheet = workbook.getWorksheet('Employees');
    sheet.getRow(2).values = [
      'Ayesha Khan',
      '42101-1234567-1',
      '03001234567',
      '',
      'Chef',
      'Kitchen',
      'MAIN',
      new Date(Date.UTC(2026, 0, 15)),
      45000,
      5,
      '',
      '',
      '09:00',
      '18:00',
      '',
      '',
      '',
      'Yes',
      'No',
      '',
    ];

    const rows = await parseEmployeeImportWorkbook(await workbook.xlsx.writeBuffer());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      name: 'Ayesha Khan',
      cnic: '42101-1234567-1',
      outletCode: 'MAIN',
      joiningDate: '2026-01-15',
      salary: 45000,
      salaryDate: 5,
      cashAdvanceEnabled: 'Yes',
      chargeToSalaryEnabled: 'No',
    });
  });

  it('rejects workbooks missing required headers', async () => {
    const workbook = await buildEmployeeImportWorkbook([]);
    workbook.getWorksheet('Employees').getCell('A1').value = 'Renamed';

    await expect(parseEmployeeImportWorkbook(await workbook.xlsx.writeBuffer()))
      .rejects.toThrow('Missing required header: Name.');
  });
});
