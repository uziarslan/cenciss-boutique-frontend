// End-of-Day / Shift Summary — thermal 80mm layout (an "X-report").
//
// Reuses the same #receipt-print-container + .print-receipt target as the
// customer bill, so the existing @media print rules (80mm, monospace) apply
// without any CSS changes.

import { getPrinterConfig, printRaw } from './usbPrinter';

const ESC = '\x1b';
const GS = '\x1d';
const EOD_LINE_WIDTH = 42;

const toAscii = (value) => String(value ?? '')
  .normalize('NFKD')
  // eslint-disable-next-line no-control-regex
  .replace(/[^\x00-\x7f]/g, (character) => ({
    '—': '-', '–': '-', '…': '...', '’': "'", '₨': 'Rs.',
  }[character] || '?'));

const escLine = (value = '') => `${toAscii(value)}\n`;
const escDivider = () => escLine('-'.repeat(EOD_LINE_WIDTH));
const escRow = (label, value) => {
  const left = toAscii(label);
  const right = toAscii(value);
  const spaces = Math.max(1, EOD_LINE_WIDTH - left.length - right.length);
  return escLine(`${left}${' '.repeat(spaces)}${right}`);
};

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const formatPKR = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

const fmtDateTime = (d) => {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// opts.raw → value is trusted HTML (e.g. a blank underline span) and is not escaped.
const row = (label, value, opts = {}) => `
  <div style="display:flex;justify-content:space-between;font-size:${opts.size || 11}px;${opts.bold ? 'font-weight:bold;' : ''}margin:${opts.tight ? '1px' : '2px'} 0;">
    <span>${escape(label)}</span>
    <span style="margin-left:8px;white-space:nowrap;">${opts.raw ? value : escape(value)}</span>
  </div>
`;

const dashed = '<div style="border-bottom:1px dashed #000;margin:6px 0;"></div>';
const heading = (t) => `<div style="text-align:center;font-size:10px;font-weight:bold;letter-spacing:1px;margin:4px 0 2px;">${escape(t)}</div>`;

export const buildEndOfDayEscPos = ({
  outletName,
  cashierName,
  session,
  totals,
  generatedAt = new Date(),
} = {}) => {
  const t = totals || {};
  const openingFloat = Number(session?.openingFloat || 0);
  const cashSales = Number(t.cashSales || 0);
  const cardSales = Number(t.cardSales || 0);
  const onlineTransferSales = Number(t.onlineTransferSales || 0);
  const foodPandaSales = Number(t.foodPandaSales || 0);
  const allowanceSales = Number(t.allowanceSales || 0);
  const allowanceOrders = Number(t.allowanceOrders || 0);
  const chargeToSalarySales = Number(t.chargeToSalarySales || 0);
  const chargeToSalaryOrders = Number(t.chargeToSalaryOrders || 0);
  const splitBillOrders = Number(t.splitBillOrders || 0);
  const totalSales = Number(t.totalSales || 0);
  const grossSales = Number(t.grossSales ?? totalSales);
  const serviceCharge = Number(t.serviceCharge || 0);
  const salesTax = Number(t.salesTax || 0);
  const deliveryCharge = Number(t.deliveryCharge || 0);
  const discount = Number(t.discount || 0);
  const netSales = Number(t.netSales ?? totalSales);
  const salesExcludingServiceCharges = Number(t.salesExcludingServiceCharges ?? (netSales - serviceCharge));
  const averageOrderValue = Number(t.averageOrderValue ?? (Number(t.totalTransactions || 0) ? netSales / Number(t.totalTransactions) : 0));
  const totalOrders = Number(t.totalOrders ?? t.totalTransactions ?? 0);
  const foodPandaOrders = Number(t.foodPandaOrders || 0);
  const heldOrdersTotal = Number(t.heldOrdersTotal || 0);
  const heldOrdersCount = Number(t.heldOrdersCount || 0);
  const paidOut = Number(t.paidOut || 0);
  const paidIn = Number(t.paidIn || 0);
  const netCash = t.netCash != null ? Number(t.netCash) : cashSales;
  const drawerNetCash = t.drawerNetCash != null ? Number(t.drawerNetCash) : netCash;
  const expectedCash = openingFloat + drawerNetCash - paidOut + paidIn;
  const pointsEarned = Number(t.pointsEarned || 0);
  const pointsRedeemed = Number(t.pointsRedeemed || 0);
  const pointsRedeemedValue = Number(t.pointsRedeemedValue || 0);

  let data = `${ESC}@${ESC}a\x01${ESC}E\x01${ESC}!\x11`;
  data += escLine(outletName || 'Outlet');
  data += `${ESC}!\x00${escLine('END OF DAY REPORT')}${ESC}E\x00`;
  data += escDivider();
  data += `${ESC}a\x00`;
  data += escRow('Cashier', cashierName || '-');
  data += escRow('Session #', session?.sessionNumber || '-');
  data += escRow('Business Date', t.businessDate || '-');
  data += escRow('Opened', session?.openedAt ? fmtDateTime(session.openedAt) : '-');
  data += escRow('Printed', fmtDateTime(generatedAt));
  data += escDivider();
  data += `${ESC}a\x01${ESC}E\x01${escLine('SALES')}${ESC}E\x00${ESC}a\x00`;
  data += escRow('Paid Invoices', String(Number(t.invoices ?? t.totalTransactions ?? 0)));
  data += escRow('Total Orders', String(totalOrders));
  data += escRow('Gross Sales', formatPKR(grossSales));
  data += escRow('+ Service Charge', formatPKR(serviceCharge));
  data += escRow('+ Sales Tax', formatPKR(salesTax));
  data += escRow('+ Delivery Charge', formatPKR(deliveryCharge));
  data += escRow('- Discounts', formatPKR(discount));
  data += escDivider();
  data += `${ESC}E\x01${escRow('NET SALES', formatPKR(netSales))}${ESC}E\x00`;
  data += escRow('Sales excl. service', formatPKR(salesExcludingServiceCharges));
  data += escRow('Average order value', formatPKR(averageOrderValue));
  data += escRow('Held orders', `${heldOrdersCount} / ${formatPKR(heldOrdersTotal)}`);
  data += escDivider();
  data += `${ESC}a\x01${ESC}E\x01${escLine('PAYMENTS')}${ESC}E\x00${ESC}a\x00`;
  data += escRow('Cash', formatPKR(cashSales));
  data += escRow('Card', formatPKR(cardSales));
  data += escRow('Online Transfer', formatPKR(onlineTransferSales));
  data += escRow(`Food Panda (${foodPandaOrders})`, formatPKR(foodPandaSales));
  data += escRow(`Allowance (${allowanceOrders})`, formatPKR(allowanceSales));
  data += escRow(`Charge to Salary (${chargeToSalaryOrders})`, formatPKR(chargeToSalarySales));
  data += escRow('Split Bill Orders', String(splitBillOrders));
  data += escDivider();
  data += `${ESC}E\x01${escRow('TOTAL COLLECTED', formatPKR(totalSales))}${ESC}E\x00`;
  data += escDivider();
  data += `${ESC}a\x01${ESC}E\x01${escLine('CASH DRAWER')}${ESC}E\x00${ESC}a\x00`;
  data += escRow('Opening Float', formatPKR(openingFloat));
  data += escRow('+ Session Net Cash', formatPKR(drawerNetCash));
  if (paidOut > 0) data += escRow('- Cash Paid Out', formatPKR(paidOut));
  if (paidIn > 0) data += escRow('+ Cash Returned', formatPKR(paidIn));
  data += escDivider();
  data += `${ESC}E\x01${escRow('Expected in Drawer', formatPKR(expectedCash))}${ESC}E\x00`;
  data += escRow('Counted', '________________');
  data += escRow('Variance', '________________');

  if (pointsEarned > 0 || pointsRedeemed > 0) {
    data += escDivider();
    data += `${ESC}a\x01${ESC}E\x01${escLine('MEMBERSHIP REWARDS')}${ESC}E\x00${ESC}a\x00`;
    if (pointsEarned > 0) data += escRow('Points Earned', `+${pointsEarned}`);
    if (pointsRedeemed > 0) data += escRow('Points Redeemed', `-${pointsRedeemed}`);
    if (pointsRedeemedValue > 0) data += escRow('Redeemed Value', formatPKR(pointsRedeemedValue));
  }

  data += escDivider();
  data += escLine('');
  data += escLine('Cashier Sign: ________________________');
  data += escLine('');
  data += escLine('Manager Sign: ________________________');
  data += `${ESC}a\x01${escLine(`Generated ${fmtDateTime(generatedAt)}`)}${ESC}d\x04${GS}V\x01`;
  return data;
};

export const buildEndOfDayHtml = ({
  outletName,
  cashierName,
  session,
  totals,
  generatedAt = new Date(),
} = {}) => {
  const t = totals || {};
  const openingFloat = Number(session?.openingFloat || 0);
  const cashSales = Number(t.cashSales || 0);
  const cardSales = Number(t.cardSales || 0);
  const onlineTransferSales = Number(t.onlineTransferSales || 0);
  const foodPandaSales = Number(t.foodPandaSales || 0);
  const allowanceSales = Number(t.allowanceSales || 0);
  const allowanceOrders = Number(t.allowanceOrders || 0);
  const chargeToSalarySales = Number(t.chargeToSalarySales || 0);
  const chargeToSalaryOrders = Number(t.chargeToSalaryOrders || 0);
  const splitBillOrders = Number(t.splitBillOrders || 0);
  const totalSales = Number(t.totalSales || 0);
  const grossSales = Number(t.grossSales ?? totalSales);
  const totalTransactions = Number(t.totalTransactions || 0);
  const serviceCharge = Number(t.serviceCharge || 0);
  const salesTax = Number(t.salesTax || 0);
  const deliveryCharge = Number(t.deliveryCharge || 0);
  const discount = Number(t.discount || 0);
  const netSales = Number(t.netSales ?? totalSales);
  const salesExcludingServiceCharges = Number(t.salesExcludingServiceCharges ?? (netSales - serviceCharge));
  const averageOrderValue = Number(t.averageOrderValue ?? (totalTransactions ? netSales / totalTransactions : 0));
  const totalOrders = Number(t.totalOrders ?? totalTransactions);
  const foodPandaOrders = Number(t.foodPandaOrders || 0);
  const heldOrdersTotal = Number(t.heldOrdersTotal || 0);
  const heldOrdersCount = Number(t.heldOrdersCount || 0);
  const pointsEarned = Number(t.pointsEarned || 0);
  const pointsRedeemed = Number(t.pointsRedeemed || 0);
  const pointsRedeemedValue = Number(t.pointsRedeemedValue || 0);
  const paidOut = Number(t.paidOut || 0);
  const paidIn = Number(t.paidIn || 0);
  const netCash = t.netCash != null ? Number(t.netCash) : cashSales;
  const drawerNetCash = t.drawerNetCash != null ? Number(t.drawerNetCash) : netCash;
  const expectedCash = openingFloat + drawerNetCash - paidOut + paidIn;
  const hasRewards = pointsEarned > 0 || pointsRedeemed > 0;
  const blankLine = '<span style="display:inline-block;min-width:90px;border-bottom:1px solid #000;">&nbsp;</span>';

  return `
    <div class="print-receipt">
      <div style="text-align:center;font-size:16px;font-weight:bold;letter-spacing:1px;">${escape(outletName || 'Outlet')}</div>
      <div style="text-align:center;font-size:11px;margin-top:2px;font-weight:bold;">END OF DAY REPORT</div>
      ${dashed}

      ${row('Cashier', cashierName || '—', { tight: true })}
      ${row('Session #', session?.sessionNumber || '—', { tight: true })}
      ${row('Business Date', t.businessDate || '—', { tight: true })}
      ${row('Opened', session?.openedAt ? fmtDateTime(session.openedAt) : '—', { tight: true })}
      ${row('Printed', fmtDateTime(generatedAt), { tight: true })}

      ${dashed}
      ${heading('SALES')}
      ${row('Paid Invoices', String(t.invoices ?? totalTransactions), { tight: true })}
      ${row('Total Orders', String(totalOrders), { tight: true })}
      ${row('Gross Sales', formatPKR(grossSales), { tight: true })}
      ${row('+ Service Charge', formatPKR(serviceCharge), { tight: true })}
      ${row('+ Sales Tax', formatPKR(salesTax), { tight: true })}
      ${row('+ Delivery Charge', formatPKR(deliveryCharge), { tight: true })}
      ${row('- Discounts', formatPKR(discount), { tight: true })}
      <div style="border-top:1px solid #000;margin:4px 0 2px;"></div>
      ${row('NET SALES', formatPKR(netSales), { bold: true, size: 14 })}
      ${row('Sales excl. service', formatPKR(salesExcludingServiceCharges), { tight: true })}
      ${row('Average order value', formatPKR(averageOrderValue), { tight: true })}
      ${row('Held orders', `${heldOrdersCount} / ${formatPKR(heldOrdersTotal)}`, { tight: true })}

      ${dashed}
      ${heading('PAYMENTS')}
      ${row('Cash', formatPKR(cashSales), { tight: true })}
      ${row('Card', formatPKR(cardSales), { tight: true })}
      ${row('Online Transfer', formatPKR(onlineTransferSales), { tight: true })}
      ${row(`Food Panda (${foodPandaOrders})`, formatPKR(foodPandaSales), { tight: true })}
      ${row(`Allowance (${allowanceOrders})`, formatPKR(allowanceSales), { tight: true })}
      ${row(`Charge to Salary (${chargeToSalaryOrders})`, formatPKR(chargeToSalarySales), { tight: true })}
      ${row('Split Bill Orders', String(splitBillOrders), { tight: true })}
      <div style="border-top:1px solid #000;margin:4px 0 2px;"></div>
      ${row('TOTAL COLLECTED', formatPKR(totalSales), { bold: true, size: 13 })}

      ${dashed}
      ${heading('CASH DRAWER')}
      ${row('Opening Float', formatPKR(openingFloat), { tight: true })}
      ${row('+ Session Net Cash', formatPKR(drawerNetCash), { tight: true })}
      ${paidOut > 0 ? row('- Cash Paid Out', formatPKR(paidOut), { tight: true }) : ''}
      ${paidIn > 0 ? row('+ Cash Returned', formatPKR(paidIn), { tight: true }) : ''}
      <div style="border-top:1px solid #000;margin:4px 0 2px;"></div>
      ${row('Expected in Drawer', formatPKR(expectedCash), { bold: true, size: 12 })}
      ${row('Counted', blankLine, { tight: true, raw: true })}
      ${row('Variance', blankLine, { tight: true, raw: true })}

      ${hasRewards ? `
        ${dashed}
        ${heading('MEMBERSHIP REWARDS')}
        ${pointsEarned > 0 ? row('Points Earned', `+${pointsEarned}`, { tight: true }) : ''}
        ${pointsRedeemed > 0 ? row('Points Redeemed', `-${pointsRedeemed}`, { tight: true }) : ''}
        ${pointsRedeemedValue > 0 ? row('Redeemed Value', formatPKR(pointsRedeemedValue), { tight: true }) : ''}
      ` : ''}

      ${dashed}
      <div style="font-size:11px;margin-top:10px;">Cashier Sign: ${blankLine}</div>
      <div style="font-size:11px;margin-top:10px;">Manager Sign: ${blankLine}</div>
      <div style="text-align:center;font-size:9px;margin-top:8px;">Generated ${fmtDateTime(generatedAt)}</div>
    </div>
  `;
};

/**
 * Print an end-of-day / shift summary on the counter thermal printer.
 *
 * @param {object}  args
 * @param {string}  args.outletName
 * @param {string}  args.cashierName
 * @param {object}  args.session   { sessionNumber, openingFloat, openedAt }
 * @param {object}  args.totals    summary from /api/pos/sessions/current/summary
 */
export const printEndOfDayReport = async ({
  outletName,
  cashierName,
  session,
  totals,
  generatedAt = new Date(),
  reportHtml,
} = {}) => {
  const cfg = getPrinterConfig();
  if (cfg.enabled && cfg.counterPrinterId) {
    return printRaw(
      cfg.counterPrinterId,
      buildEndOfDayEscPos({ outletName, cashierName, session, totals, generatedAt }),
      { verifyStatus: cfg.verifyPrinterStatus },
    );
  }

  const containerId = 'receipt-print-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
  }
  container.dataset.printer = 'counter';
  container.innerHTML = reportHtml || buildEndOfDayHtml({
    outletName,
    cashierName,
    session,
    totals,
    generatedAt,
  });

  const prevTitle = document.title;
  document.title = `EOD ${session?.sessionNumber || ''}`.trim();

  window.print();

  setTimeout(() => {
    container.innerHTML = '';
    document.title = prevTitle;
  }, 500);

  return { ok: true, confirmation: 'browser-dialog' };
};

export const buildDrawerReportEscPos = ({
  outletName,
  cashierName,
  session,
  totals,
  generatedAt = new Date(),
} = {}) => {
  const t = totals || {};
  const openingFloat = Number(session?.openingFloat || 0);
  const cashSales = Number(t.cashSales || 0);
  const netCash = t.drawerNetCash != null
    ? Number(t.drawerNetCash)
    : (t.netCash != null ? Number(t.netCash) : cashSales);
  const paidOut = Number(t.paidOut || 0);
  const paidIn = Number(t.paidIn || 0);
  const expected = openingFloat + netCash - paidOut + paidIn;
  const movements = Array.isArray(t.drawerMovements) ? t.drawerMovements : [];

  let data = `${ESC}@${ESC}a\x01${ESC}E\x01${ESC}!\x11`;
  data += escLine(outletName || 'Outlet');
  data += `${ESC}!\x00${escLine('CASH DRAWER REPORT')}${ESC}E\x00${ESC}a\x00`;
  data += escDivider();
  data += escRow('Cashier', cashierName || '-');
  data += escRow('Session #', session?.sessionNumber || '-');
  data += escRow('Opened', session?.openedAt ? fmtDateTime(session.openedAt) : '-');
  data += escRow('Printed', fmtDateTime(generatedAt));
  data += escDivider();
  data += escRow('Opening Float', formatPKR(openingFloat));
  data += escRow('+ Net Cash Sales', formatPKR(netCash));
  data += escRow('- Cash Paid Out', formatPKR(paidOut));
  data += escRow('+ Added to Drawer', formatPKR(paidIn));
  data += escDivider();
  data += `${ESC}E\x01${escRow('EXPECTED IN DRAWER', formatPKR(expected))}${ESC}E\x00`;

  data += escDivider();
  data += `${ESC}a\x01${ESC}E\x01${escLine('DRAWER MOVEMENTS')}${ESC}E\x00${ESC}a\x00`;
  if (movements.length === 0) {
    data += escLine('No payouts or additions.');
  } else {
    movements.forEach((movement, index) => {
      const sign = movement.type === 'payout' ? '-' : '+';
      const label = movement.type === 'payout' ? 'Payout' : 'Added';
      data += escRow(`${index + 1}. ${label}`, `${sign}${formatPKR(movement.amount)}`);
      if (movement.reason) data += escLine(`   ${movement.reason}`);
      if (movement.at) data += escLine(`   ${fmtDateTime(movement.at)}`);
    });
  }
  data += escDivider();
  data += escRow('Counted', '________________');
  data += escRow('Variance', '________________');
  data += escLine('');
  data += escLine('Cashier Sign: ________________________');
  data += `${ESC}a\x01${escLine(`Generated ${fmtDateTime(generatedAt)}`)}${ESC}d\x04${GS}V\x01`;
  return data;
};

export const buildDrawerReportHtml = ({
  outletName,
  cashierName,
  session,
  totals,
  generatedAt = new Date(),
} = {}) => {
  const t = totals || {};
  const openingFloat = Number(session?.openingFloat || 0);
  const netCash = t.drawerNetCash != null
    ? Number(t.drawerNetCash)
    : (t.netCash != null ? Number(t.netCash) : Number(t.cashSales || 0));
  const paidOut = Number(t.paidOut || 0);
  const paidIn = Number(t.paidIn || 0);
  const expected = openingFloat + netCash - paidOut + paidIn;
  const movements = Array.isArray(t.drawerMovements) ? t.drawerMovements : [];
  const blankLine = '<span style="display:inline-block;min-width:90px;border-bottom:1px solid #000;">&nbsp;</span>';

  return `
    <div class="print-receipt">
      <div style="text-align:center;font-size:16px;font-weight:bold;">${escape(outletName || 'Outlet')}</div>
      <div style="text-align:center;font-size:11px;font-weight:bold;margin-top:2px;">CASH DRAWER REPORT</div>
      ${dashed}
      ${row('Cashier', cashierName || '—', { tight: true })}
      ${row('Session #', session?.sessionNumber || '—', { tight: true })}
      ${row('Opened', session?.openedAt ? fmtDateTime(session.openedAt) : '—', { tight: true })}
      ${row('Printed', fmtDateTime(generatedAt), { tight: true })}
      ${dashed}
      ${row('Opening Float', formatPKR(openingFloat))}
      ${row('+ Net Cash Sales', formatPKR(netCash))}
      ${row('- Cash Paid Out', formatPKR(paidOut))}
      ${row('+ Added to Drawer', formatPKR(paidIn))}
      <div style="border-top:1px solid #000;margin:4px 0 2px;"></div>
      ${row('EXPECTED IN DRAWER', formatPKR(expected), { bold: true, size: 13 })}
      ${dashed}
      ${heading('DRAWER MOVEMENTS')}
      ${movements.length ? movements.map((movement, index) => `
        ${row(`${index + 1}. ${movement.type === 'payout' ? 'Payout' : 'Added'}`, `${movement.type === 'payout' ? '-' : '+'}${formatPKR(movement.amount)}`, { tight: true })}
        ${movement.reason ? `<div style="font-size:10px;margin:0 0 3px 8px;">${escape(movement.reason)}</div>` : ''}
        ${movement.at ? `<div style="font-size:9px;margin:0 0 4px 8px;">${escape(fmtDateTime(movement.at))}</div>` : ''}
      `).join('') : '<div style="font-size:10px;text-align:center;">No payouts or additions.</div>'}
      ${dashed}
      ${row('Counted', blankLine, { raw: true })}
      ${row('Variance', blankLine, { raw: true })}
      <div style="font-size:11px;margin-top:12px;">Cashier Sign: ${blankLine}</div>
      <div style="text-align:center;font-size:9px;margin-top:8px;">Generated ${fmtDateTime(generatedAt)}</div>
    </div>
  `;
};

export const printDrawerReport = async ({
  outletName,
  cashierName,
  session,
  totals,
  generatedAt = new Date(),
  reportHtml,
} = {}) => {
  const cfg = getPrinterConfig();
  if (cfg.enabled && cfg.counterPrinterId) {
    return printRaw(
      cfg.counterPrinterId,
      buildDrawerReportEscPos({ outletName, cashierName, session, totals, generatedAt }),
      { verifyStatus: cfg.verifyPrinterStatus },
    );
  }

  const containerId = 'receipt-print-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
  }
  container.dataset.printer = 'counter';
  container.innerHTML = reportHtml || buildDrawerReportHtml({
    outletName,
    cashierName,
    session,
    totals,
    generatedAt,
  });
  const previousTitle = document.title;
  document.title = `Drawer ${session?.sessionNumber || ''}`.trim();
  window.print();
  setTimeout(() => { container.innerHTML = ''; document.title = previousTitle; }, 500);
  return { ok: true, confirmation: 'browser-dialog' };
};
