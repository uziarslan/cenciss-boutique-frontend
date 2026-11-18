export const EMPLOYEE_IMPORT_MAX_ROWS = 500;

const loadExcelJS = async () => {
  const module = await import('exceljs/dist/exceljs.min.js');
  return module.default || module;
};

export const EMPLOYEE_IMPORT_COLUMNS = [
  { key: 'name', header: 'Name', required: true, width: 24, format: 'Full employee name' },
  { key: 'cnic', header: 'CNIC', required: true, width: 20, format: 'XXXXX-XXXXXXX-X or 13 digits' },
  { key: 'phone', header: 'Phone', width: 18, format: 'Text' },
  { key: 'address', header: 'Address', width: 32, format: 'Text' },
  { key: 'designation', header: 'Designation', width: 20, format: 'Text' },
  { key: 'department', header: 'Department', width: 20, format: 'Text' },
  { key: 'outletCode', header: 'Outlet Code', required: true, width: 18, format: 'Choose a code from the Outlets sheet' },
  { key: 'joiningDate', header: 'Joining Date', width: 16, format: 'YYYY-MM-DD' },
  { key: 'salary', header: 'Monthly Salary (PKR)', required: true, width: 22, format: 'Number, zero or greater' },
  { key: 'salaryDate', header: 'Salary Day', required: true, width: 14, format: 'Whole number from 1 to 28' },
  { key: 'paidOffDutyDays', header: 'Paid Off-Duty Days', width: 20, format: 'Whole number from 0 to 15; blank defaults to 4' },
  { key: 'bankName', header: 'Bank Name', width: 20, format: 'Text' },
  { key: 'bankAccount', header: 'Bank Account', width: 24, format: 'Text / IBAN' },
  { key: 'shiftStart', header: 'Shift Start', width: 14, format: '24-hour HH:MM' },
  { key: 'shiftEnd', header: 'Shift End', width: 14, format: '24-hour HH:MM' },
  { key: 'dailyLimitPercent', header: 'Daily Credit Limit (%)', width: 22, format: '0-60; blank defaults to 10' },
  { key: 'rollingSevenDayLimitPercent', header: 'Rolling 7-Day Limit (%)', width: 24, format: '0-60; blank defaults to 25' },
  { key: 'maxOutstandingPercent', header: 'Maximum Outstanding (%)', width: 24, format: '0-60; blank defaults to 60' },
  { key: 'cashAdvanceEnabled', header: 'Cash Advance Enabled', width: 22, format: 'Yes or No; blank defaults to Yes' },
  { key: 'chargeToSalaryEnabled', header: 'Charge to Salary Enabled', width: 24, format: 'Yes or No; blank defaults to Yes' },
  { key: 'deviceEmployeeNo', header: 'Device Employee No.', aliases: ['Device Employee Number', 'Device Employee ID', 'Device Person ID'], width: 22, format: 'Optional face-terminal person ID' },
];

const requiredHeaders = EMPLOYEE_IMPORT_COLUMNS.filter((column) => column.required);
const normalizedHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const columnByHeader = new Map(
  EMPLOYEE_IMPORT_COLUMNS.flatMap((column) => [column.header, column.key, ...(column.aliases || [])]
    .map((header) => [normalizedHeader(header), column])),
);

// These export columns are derived or managed elsewhere. Identify them
// explicitly so the preview never silently drops an unknown Excel column.
const READ_ONLY_EXPORT_COLUMNS = new Map([
  ['Outlet', 'Matched using Outlet Code'],
  ['Face ID Enrolled', 'Managed through face enrollment'],
  ['Status', 'Managed by activating or deactivating the employee'],
].map(([header, reason]) => [normalizedHeader(header), { header, reason }]));

const dateText = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
};

const timeText = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  return value;
};

const plainCellValue = (cell) => {
  const value = cell?.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
  }
  return value ?? '';
};

export const buildEmployeeImportWorkbook = async (outlets = []) => {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cenciss';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Employees', {
    properties: { defaultRowHeight: 20, tabColor: { argb: 'FF4F46E5' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = EMPLOYEE_IMPORT_COLUMNS.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width,
  }));
  sheet.autoFilter = { from: 'A1', to: 'U1' };

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell, columnNumber) => {
    const definition = EMPLOYEE_IMPORT_COLUMNS[columnNumber - 1];
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF3730A3' } } };
    cell.note = `${definition.required ? 'Required. ' : 'Optional. '}${definition.format}`;
  });

  const outletsSheet = workbook.addWorksheet('Outlets', {
    properties: { tabColor: { argb: 'FF06B6D4' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  outletsSheet.columns = [
    { header: 'Outlet Code', key: 'code', width: 20 },
    { header: 'Outlet Name', key: 'name', width: 32 },
  ];
  outletsSheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  outlets
    .filter((outlet) => outlet?.code)
    .forEach((outlet) => outletsSheet.addRow({ code: String(outlet.code), name: String(outlet.name || '') }));

  const instructions = workbook.addWorksheet('Instructions', {
    properties: { tabColor: { argb: 'FF10B981' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  instructions.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Required', key: 'required', width: 12 },
    { header: 'Accepted format', key: 'format', width: 48 },
  ];
  instructions.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  EMPLOYEE_IMPORT_COLUMNS.forEach((column) => instructions.addRow({
    field: column.header,
    required: column.required ? 'Yes' : 'No',
    format: column.format,
  }));
  instructions.addRow({
    field: 'Important',
    required: '',
    format: `Do not rename headers. Add one employee per row. Maximum ${EMPLOYEE_IMPORT_MAX_ROWS} employees per upload. Choose how to update existing CNICs in the import preview. Repeated CNICs within this file are skipped.`,
  });
  instructions.addRow({
    field: 'Updating existing employees',
    required: '',
    format: 'New changes only: blank cells keep existing values; only filled, changed fields are updated. Entire record: blank optional cells clear values or apply the defaults above. Employee IDs and history are preserved.',
  });

  const outletLastRow = Math.max(2, outletsSheet.rowCount);
  for (let rowNumber = 2; rowNumber <= EMPLOYEE_IMPORT_MAX_ROWS + 1; rowNumber += 1) {
    sheet.getCell(`B${rowNumber}`).numFmt = '@';
    sheet.getCell(`C${rowNumber}`).numFmt = '@';
    sheet.getCell(`H${rowNumber}`).numFmt = 'yyyy-mm-dd';
    sheet.getCell(`I${rowNumber}`).numFmt = '#,##0';
    sheet.getCell(`J${rowNumber}`).numFmt = '0';
    sheet.getCell(`K${rowNumber}`).numFmt = '0';
    sheet.getCell(`M${rowNumber}`).numFmt = '@';
    sheet.getCell(`N${rowNumber}`).numFmt = '@';
    sheet.getCell(`O${rowNumber}`).numFmt = '@';
    sheet.getCell(`P${rowNumber}`).numFmt = '0.0';
    sheet.getCell(`Q${rowNumber}`).numFmt = '0.0';
    sheet.getCell(`R${rowNumber}`).numFmt = '0.0';
    sheet.getCell(`U${rowNumber}`).numFmt = '@';
    if (outlets.length) {
      sheet.getCell(`G${rowNumber}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`'Outlets'!$A$2:$A$${outletLastRow}`],
        showErrorMessage: true,
        errorTitle: 'Invalid outlet code',
        error: 'Choose an Outlet Code from the Outlets sheet.',
      };
    }
    sheet.getCell(`J${rowNumber}`).dataValidation = {
      type: 'whole', operator: 'between', allowBlank: false, formulae: [1, 28],
      showErrorMessage: true, errorTitle: 'Invalid salary day', error: 'Enter a whole number from 1 to 28.',
    };
    sheet.getCell(`K${rowNumber}`).dataValidation = {
      type: 'whole', operator: 'between', allowBlank: true, formulae: [0, 15],
      showErrorMessage: true, errorTitle: 'Invalid paid off-duty days', error: 'Enter a whole number from 0 to 15.',
    };
    ['P', 'Q', 'R'].forEach((letter) => {
      sheet.getCell(`${letter}${rowNumber}`).dataValidation = {
        type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 60],
      };
    });
    ['S', 'T'].forEach((letter) => {
      sheet.getCell(`${letter}${rowNumber}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
      };
    });
  }

  return workbook;
};

export const downloadEmployeeImportTemplate = async (outlets = []) => {
  const workbook = await buildEmployeeImportWorkbook(outlets);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'employee-import-template.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const parseEmployeeImportWorkbook = async (fileOrBuffer, { includeMetadata = false } = {}) => {
  const ExcelJS = await loadExcelJS();
  let buffer;
  if (ArrayBuffer.isView(fileOrBuffer)) {
    buffer = fileOrBuffer;
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = new Uint8Array(fileOrBuffer);
  } else {
    buffer = new Uint8Array(await fileOrBuffer.arrayBuffer());
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Employees') || workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook does not contain an Employees sheet.');

  const headerIndexes = new Map();
  const readOnlyColumns = [];
  const unknownHeaders = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = String(plainCellValue(cell)).trim();
    if (!header) return;
    const normalized = normalizedHeader(header);
    const definition = columnByHeader.get(normalized);
    if (definition) {
      if (headerIndexes.has(definition.key)) {
        throw new Error(`More than one column maps to "${definition.header}". Keep one column for each employee field.`);
      }
      headerIndexes.set(definition.key, columnNumber);
    } else if (READ_ONLY_EXPORT_COLUMNS.has(normalized)) {
      readOnlyColumns.push(READ_ONLY_EXPORT_COLUMNS.get(normalized));
    } else {
      unknownHeaders.push(header);
    }
  });
  const missing = requiredHeaders.filter((column) => !headerIndexes.has(column.key));
  if (missing.length) {
    throw new Error(`Missing required header${missing.length === 1 ? '' : 's'}: ${missing.map((column) => column.header).join(', ')}.`);
  }
  if (unknownHeaders.length) {
    throw new Error(`Unrecognized Excel column${unknownHeaders.length === 1 ? '' : 's'}: ${unknownHeaders.join(', ')}. Use the template headers so every employee field can be checked.`);
  }

  const rows = [];
  const lastRow = Math.min(sheet.rowCount, EMPLOYEE_IMPORT_MAX_ROWS + 1);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const parsed = { rowNumber };
    EMPLOYEE_IMPORT_COLUMNS.forEach((column) => {
      const columnNumber = headerIndexes.get(column.key);
      if (!columnNumber) {
        parsed[column.key] = '';
        return;
      }
      let value = plainCellValue(row.getCell(columnNumber));
      // Device IDs are identifiers, including when Excel stores a number with
      // a zero-padding format (e.g. numeric 1 displayed as 0001).
      const cell = row.getCell(columnNumber);
      if (column.key === 'deviceEmployeeNo' && typeof value === 'number' && /^0+$/.test(cell.numFmt || '')) {
        value = String(value).padStart(cell.numFmt.length, '0');
      }
      if (column.key === 'joiningDate') value = dateText(value);
      if (column.key === 'shiftStart' || column.key === 'shiftEnd') value = timeText(value);
      parsed[column.key] = value;
    });
    if (EMPLOYEE_IMPORT_COLUMNS.some((column) => String(parsed[column.key] ?? '').trim() !== '')) {
      rows.push(parsed);
    }
  }

  if (sheet.rowCount > EMPLOYEE_IMPORT_MAX_ROWS + 1) {
    throw new Error(`The file exceeds the ${EMPLOYEE_IMPORT_MAX_ROWS}-employee upload limit.`);
  }
  const columns = EMPLOYEE_IMPORT_COLUMNS.map((column) => ({
    key: column.key,
    header: column.header,
    present: headerIndexes.has(column.key),
    filled: rows.filter((row) => String(row[column.key] ?? '').trim() !== '').length,
  }));
  return includeMetadata ? { rows, columns, readOnlyColumns } : rows;
};
