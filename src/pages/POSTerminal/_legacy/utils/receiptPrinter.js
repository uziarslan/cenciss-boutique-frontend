// Customer bill — thermal 80mm layout.
// Full detail: outlet header, txn meta, dine-in table / customer / delivery
// address, itemised lines with prices, subtotal/tax/discount/total, payment
// breakdown, optional notes, footer.

import { formatInTimeZone } from '../../../../utils/datetime';
import { praQrSvg } from './praQr';
import { getPrinterConfig, printReceiptViaUsb } from './usbPrinter';

const ORDER_TYPE_LABEL = {
  'dine-in': 'Dine-In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  foodpanda: 'Foodpanda',
  retail: 'Retail sale',
};

const PAYMENT_LABEL = {
  cash: 'Cash',
  card: 'Card',
  'online-transfer': 'Online Transfer',
  split: 'Split (Cash + Card)',
  allowance: 'Staff Allowance',
  'charge-to-salary': 'Charge to Salary',
  foodpanda: 'Food Panda',
  'store-credit': 'Store credit',
};

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const formatPKR = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

// Render in the outlet's timezone (passed via transaction.timezone). Falls back
// to the browser zone when tz is missing/invalid. Plain string for the receipt.
const fmtDateTime = (d, tz) => formatInTimeZone(d || new Date(), tz);

const row = (label, value, opts = {}) => `
  <div style="display:flex;justify-content:space-between;font-size:${opts.size || 11}px;${opts.bold ? 'font-weight:bold;' : ''}margin:${opts.tight ? '1px' : '2px'} 0;">
    <span>${escape(label)}</span>
    <span style="margin-left:8px;white-space:nowrap;">${escape(value)}</span>
  </div>
`;

export const buildReceiptHtml = (
  transaction,
  outletName,
  cashierName,
  { generatedAt = new Date() } = {},
) => {
  const items = transaction.items || [];
  const orderType = transaction.orderType || 'dine-in';
  const orderTypeLabel = ORDER_TYPE_LABEL[orderType] || 'Dine-In';
  const isDineIn = orderType === 'dine-in';
  const isDelivery = orderType === 'delivery';
  const tableNumber = transaction.tableNumber ? String(transaction.tableNumber).trim() : '';
  const customer = transaction.customer || null;
  const deliveryAddress = transaction.deliveryAddress || null;

  const subtotal = Number(transaction.subtotal || 0);
  const taxAmount = Number(transaction.taxAmount || 0);
  const serviceChargeAmount = Number(transaction.serviceChargeAmount || 0);
  const discountAmount = Number(transaction.discountAmount || 0);
  const totalAmount = Number(transaction.totalAmount || 0);
  const discountMode = transaction.discountMode;
  const discountPercent = Number(transaction.discountPercent || 0);

  const paymentMethod = transaction.paymentMethod || 'cash';
  const cashTendered = Number(transaction.cashTendered || 0);
  const cardAmount = Number(transaction.cardAmount || 0);
  const changeGiven = paymentMethod === 'cash'
    ? Number(transaction.changeGiven ?? Math.max(0, cashTendered - totalAmount))
    : Number(transaction.changeGiven || 0);

  const itemsHtml = items.map((item) => {
    const qty = Number(item.qty ?? item.quantity ?? 1);
    const unit = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.lineTotal ?? qty * unit);
    return `
      <tr>
        <td colspan="2" style="padding-top:3px;font-size:12px;">${escape((item.name || item.menuItemName || '—') + ((item.variation?.name || item.variationName) ? ` (${item.variation?.name || item.variationName})` : ''))}</td>
      </tr>
      <tr>
        <td style="padding-bottom:3px;font-size:11px;color:#000;">
          &nbsp;&nbsp;${qty} × ${formatPKR(unit)}
        </td>
        <td style="padding-bottom:3px;font-size:11px;text-align:right;white-space:nowrap;">
          ${formatPKR(lineTotal)}
        </td>
      </tr>
    `;
  }).join('');

  const itemCount = items.reduce((s, i) => s + Number(i.qty ?? i.quantity ?? 0), 0);

  const tableBlock = isDineIn && tableNumber ? `
    <div style="text-align:center;border:1px solid #000;padding:4px;margin:4px 0;font-size:12px;">
      <strong>TABLE ${escape(tableNumber)}</strong>
    </div>
  ` : '';

  const customerBlock = customer && orderType !== 'foodpanda' ? `
    ${customer.name ? row('Customer', customer.name, { tight: true }) : ''}
    ${customer.phone ? row('Phone', customer.phone, { tight: true }) : ''}
  ` : '';

  const foodPandaBlock = orderType === 'foodpanda' ? `
    ${row('Foodpanda Order #', transaction.foodPandaOrderNumber || transaction.foodPandaReference || '—', { tight: true })}
    ${row('Foodpanda Customer', transaction.foodPandaCustomerName || '—', { tight: true })}
  ` : '';

  const deliveryBlock = isDelivery && deliveryAddress ? `
    <div style="font-size:11px;margin-top:3px;line-height:1.3;">
      <strong>Delivery Address:</strong><br/>
      ${escape([deliveryAddress.label, deliveryAddress.street, deliveryAddress.area, deliveryAddress.city].filter(Boolean).join(', '))}
    </div>
  ` : '';

  // Render rates as clean numbers (10, 12.5 — no trailing zeros).
  const fmtRate = (r) => String(+Number(r || 0).toFixed(2));

  // Discount label includes percent when applicable on every customer copy.
  const appliedDiscountPercent = discountMode === 'percent'
    ? (discountPercent > 0
      ? discountPercent
      : (subtotal > 0 ? (discountAmount / subtotal) * 100 : 0))
    : 0;
  const discountLabel = appliedDiscountPercent > 0
    ? `Discount (${fmtRate(appliedDiscountPercent)}%)`
    : 'Discount';

  // Tax rate: prefer the stored effective rate (16% cash / 5% card / blended for
  // split). Fall back to deriving it from the taxable base for legacy receipts.
  const taxBase = items.reduce(
    (s, i) => s + ((Number(i.taxRate) || 0) > 0
      ? Number(i.lineTotal ?? (Number(i.qty ?? i.quantity ?? 0) * Number(i.unitPrice ?? i.price ?? 0)))
      : 0),
    0
  );
  const taxRate = transaction.effectiveTaxRate != null && transaction.effectiveTaxRate !== ''
    ? Number(transaction.effectiveTaxRate)
    : (taxBase > 0 ? (taxAmount / taxBase) * 100 : 0);
  const taxLabel = taxRate > 0 ? `Tax (${fmtRate(taxRate)}%)` : 'Tax';
  const billTaxBasisLabel = transaction.billTaxBasis === 'card'
    ? 'Card'
    : transaction.billTaxBasis === 'cash'
      ? 'Cash'
      : '';

  // Service charge rate, derived from the lines it applies to. DB sub-docs carry
  // `serviceChargeRate`; offline/cart payload items carry `serviceCharge` — accept
  // either so the offline receipt shows the % too.
  const scBase = items.reduce(
    (s, i) => s + ((Number(i.serviceChargeRate ?? i.serviceCharge) || 0) > 0
      ? Number(i.lineTotal ?? (Number(i.qty ?? i.quantity ?? 0) * Number(i.unitPrice ?? i.price ?? 0)))
      : 0),
    0
  );
  const storedServiceChargeRate = Number(transaction.serviceChargeRate || 0);
  const scRate = storedServiceChargeRate > 0
    ? storedServiceChargeRate
    : (scBase > 0 ? (serviceChargeAmount / scBase) * 100 : 0);
  const serviceChargeLabel = scRate > 0 ? `Service Charge (${fmtRate(scRate)}%)` : 'Service Charge';

  // Payment-specific details. A held order has no payment method yet, so its
  // table bill must show only the outstanding amount. A dispatched delivery
  // remains explicitly cash-on-delivery until settlement.
  let paymentDetailsHtml;
  if (transaction.status === 'held') {
    paymentDetailsHtml = row('Amount Due', formatPKR(totalAmount), { bold: true });
  } else if (transaction.status === 'out-for-delivery') {
    paymentDetailsHtml = row('Payment', 'Cash on Delivery', { bold: true })
      + row('Amount Due', formatPKR(totalAmount), { bold: true });
  } else {
    paymentDetailsHtml = row('Payment', PAYMENT_LABEL[paymentMethod] || paymentMethod, { bold: true });
    if (paymentMethod === 'cash') {
      paymentDetailsHtml += row('Cash Tendered', formatPKR(cashTendered));
      paymentDetailsHtml += row('Change', formatPKR(changeGiven));
    } else if (paymentMethod === 'card') {
      paymentDetailsHtml += row('Card', formatPKR(totalAmount));
      if (transaction.cardLast4) {
        paymentDetailsHtml += row('Card No.', `****${transaction.cardLast4}`);
      } else if (transaction.cardReference) {
        paymentDetailsHtml += row('Card No.', `****${transaction.cardReference}`);
      }
    } else if (paymentMethod === 'online-transfer') {
      paymentDetailsHtml += row('Transfer', formatPKR(transaction.onlineTransferAmount || totalAmount));
      paymentDetailsHtml += row('Reference', escape(transaction.onlineTransferReference || '—'));
    } else if (paymentMethod === 'split') {
      paymentDetailsHtml += row('Cash', formatPKR(transaction.cashAmount ?? cashTendered));
      paymentDetailsHtml += row('Card', formatPKR(cardAmount));
    } else if (paymentMethod === 'allowance') {
      paymentDetailsHtml += row('Charged To', 'Staff Allowance');
    } else if (paymentMethod === 'charge-to-salary') {
      paymentDetailsHtml += row(
        'Employee',
        escape(transaction.chargeToSalaryEmployeeName || transaction.chargeToSalaryEmployee?.name || 'Employee'),
      );
    } else if (paymentMethod === 'foodpanda') {
      paymentDetailsHtml += row('Platform', 'Food Panda (receivable)');
      if (transaction.foodPandaReference
        && transaction.foodPandaReference !== transaction.foodPandaOrderNumber) {
        paymentDetailsHtml += row('Reference', escape(transaction.foodPandaReference));
      }
    }
  }
  if (Number(transaction.storeCreditRedeemed || 0) > 0) {
    paymentDetailsHtml += row('Store Credit', formatPKR(transaction.storeCreditRedeemed));
  }

  const html = `
    <div class="print-receipt" style="box-sizing:border-box;width:100%;max-width:100%;">
      ${getPrinterConfig().restaurantLogo ? `<div style="text-align:center;margin:0 auto 6px;"><img src="${getPrinterConfig().restaurantLogo}" alt="Boutique logo" style="display:inline-block;max-width:100%;max-height:32mm;object-fit:contain;filter:grayscale(1);" /></div>` : ''}
      <div class="receipt-restaurant-name" style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;line-height:1.15;letter-spacing:0;">${escape(outletName || 'Receipt')}</div>
      <div class="receipt-customer-bill-title" style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1.2;letter-spacing:0.4px;margin-top:7px;margin-bottom:3px;">Customer Bill</div>
      <div style="border-bottom:1px dashed #000;margin:6px 0;"></div>

      ${row('Date', fmtDateTime(transaction.createdAt, transaction.timezone), { tight: true })}
      ${row('Receipt #', transaction.transactionNumber || (transaction.clientTransactionId ? `…${transaction.clientTransactionId.slice(-8).toUpperCase()}` : '—'), { tight: true })}
      ${row('Cashier', cashierName || 'Unknown', { tight: true })}
      ${row('Order Type', orderTypeLabel, { tight: true })}
      ${transaction.offline ? row('Status', 'OFFLINE · Pending sync', { tight: true, bold: true }) : ''}
      ${billTaxBasisLabel ? row('Bill Type', `${billTaxBasisLabel} Tax`, { tight: true, bold: true }) : ''}
      ${transaction.assignedRider?.name ? row('Rider', transaction.assignedRider.name, { tight: true }) : ''}
      ${customerBlock}
      ${foodPandaBlock}

      ${tableBlock}
      ${deliveryBlock}

      <div style="border-bottom:1px dashed #000;margin:6px 0;"></div>

      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th style="text-align:left;font-size:10px;padding-bottom:3px;letter-spacing:1px;">ITEM / QTY × PRICE</th>
            <th style="text-align:right;font-size:10px;padding-bottom:3px;letter-spacing:1px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml || '<tr><td colspan="2" style="font-size:11px;font-style:italic;padding:6px 0;">No items</td></tr>'}
        </tbody>
      </table>

      <div style="border-bottom:1px dashed #000;margin:6px 0;"></div>

      ${row('Items', String(itemCount), { tight: true })}
      ${row('Subtotal', formatPKR(subtotal), { tight: true })}
      ${taxAmount > 0 ? row(taxLabel, formatPKR(taxAmount), { tight: true }) : ''}
      ${serviceChargeAmount > 0 ? row(serviceChargeLabel, formatPKR(serviceChargeAmount), { tight: true }) : ''}
      ${Number(transaction.deliveryChargeAmount) > 0 ? row('Delivery Charge', formatPKR(transaction.deliveryChargeAmount), { tight: true }) : ''}
      ${orderType !== 'foodpanda' && paymentMethod !== 'foodpanda' && discountAmount > 0
        ? row(discountLabel, `- ${formatPKR(discountAmount)}`, { tight: true })
        : ''}
      ${orderType !== 'foodpanda' && paymentMethod !== 'foodpanda' && transaction.pointsRedeemed > 0
        ? row(`Points Redeemed (${transaction.pointsRedeemed})`, `- ${formatPKR(transaction.pointsRedeemedValue || 0)}`, { tight: true })
        : ''}

      <div style="border-top:1px solid #000;margin:4px 0 2px;"></div>
      ${row('TOTAL', formatPKR(totalAmount), { bold: true, size: 14 })}
      <div style="border-bottom:1px dashed #000;margin:6px 0;"></div>

      ${paymentDetailsHtml}

      ${transaction.splitBill && Array.isArray(transaction.splitBill.parts) && transaction.splitBill.parts.length > 0 ? `
        <div style="border-top:1px dashed #000;margin:6px 0 4px;"></div>
        <div style="font-size:11px;font-weight:bold;text-align:center;margin-bottom:2px;">★ SPLIT ${transaction.splitBill.ways} WAYS ★</div>
        ${transaction.splitBill.parts.map((p, i) => {
          const label = `Person ${i + 1}` + (p.method === 'covered' && typeof p.coveredBy === 'number' ? ` (covered by P${p.coveredBy + 1})` : '');
          const methodTxt = p.method === 'cash' ? 'Cash' : p.method === 'card' ? `Card${p.cardReference ? ` ${escape(p.cardReference)}` : ''}` : '—';
          const value = p.method === 'covered' ? '—' : `${formatPKR(p.share || 0)} (${methodTxt})`;
          return row(label, value, { tight: true });
        }).join('')}
      ` : ''}

      ${orderType !== 'foodpanda' && paymentMethod !== 'foodpanda'
        && (transaction.pointsEarned > 0 || transaction.pointsEarnedPending > 0 || transaction.pointsBalanceAfter != null) ? `
        <div style="border-top:1px dashed #000;margin:6px 0 4px;"></div>
        <div style="font-size:11px;font-weight:bold;text-align:center;margin-bottom:2px;">★ MEMBERSHIP REWARDS ★</div>
        ${transaction.pointsEarned > 0 ? row('Points Earned', `+${transaction.pointsEarned}`, { tight: true }) : ''}
        ${!transaction.pointsEarned && transaction.pointsEarnedPending > 0 ? row('Points Earned (est.)', `+${transaction.pointsEarnedPending}`, { tight: true }) : ''}
        ${transaction.pointsBalanceAfter != null
          ? row('New Balance', `${transaction.pointsBalanceAfter} pts`, { tight: true })
          : ((transaction.pointsEarnedPending > 0 || transaction.pointsRedeemed > 0)
              ? '<div style="font-size:10px;text-align:center;font-style:italic;margin-top:2px;">Final balance pending sync</div>'
              : '')}
      ` : ''}

      ${transaction.notes ? `
        <div style="border-top:1px dashed #000;margin:6px 0;"></div>
        <div style="font-size:11px;"><strong>Note:</strong></div>
        <div style="font-size:11px;white-space:pre-wrap;line-height:1.3;">${escape(transaction.notes)}</div>
      ` : ''}

      ${(() => {
        const praNo = transaction.pra?.invoiceNumber || transaction.praInvoiceNumber || '';
        if (!praNo) return '';
        return `
        <div style="border-top:1px dashed #000;margin:8px 0 4px;"></div>
        <div style="text-align:center;">
          <div style="font-size:10px;font-weight:bold;letter-spacing:1px;">PRA eIMS FISCAL INVOICE</div>
          <div style="margin:4px auto 2px;width:132px;height:132px;">${praQrSvg(praNo, 132)}</div>
          <div style="font-size:9px;">PRA Invoice Number</div>
          <div style="font-size:11px;font-weight:bold;word-break:break-all;">${escape(praNo)}</div>
          <div style="font-size:8px;margin-top:2px;">Scan to verify on the PRA fiscal report</div>
        </div>`;
      })()}

      <div style="border-bottom:1px dashed #000;margin:8px 0 4px;"></div>
      <div style="text-align:center;font-size:11px;font-weight:bold;">Thank you — please come again!</div>
      <div style="text-align:center;font-size:9px;margin-top:4px;">Bill generated ${fmtDateTime(generatedAt, transaction.timezone)}</div>
      <div style="text-align:center;font-size:9px;font-weight:bold;margin-top:6px;">Powered by Cenciss</div>
      <div style="text-align:center;font-size:9px;">www.cenciss.com</div>
    </div>
  `;

  return html;
};

export const printReceipt = async (
  transaction,
  outletName,
  cashierName,
  {
    receiptHtml,
    generatedAt = new Date(),
  } = {},
) => {
  // Direct USB is authoritative when configured: do not hide a cable/paper
  // failure by opening a browser dialog and risking a duplicate receipt.
  const usbResult = await printReceiptViaUsb(transaction, outletName, cashierName, { generatedAt });
  if (usbResult) return usbResult;

  const containerId = 'receipt-print-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.dataset.printer = 'counter';
    document.body.appendChild(container);
  }

  const orderType = transaction.orderType || 'dine-in';
  const isDineIn = orderType === 'dine-in';
  const tableNumber = transaction.tableNumber ? String(transaction.tableNumber).trim() : '';

  container.innerHTML = receiptHtml || buildReceiptHtml(
    transaction,
    outletName,
    cashierName,
    { generatedAt },
  );

  // Swap document.title so the browser print dialog / job name shows a short
  // label instead of the full app title or URL.
  const shortRef = (transaction.transactionNumber || transaction.clientTransactionId || '')
    .toString()
    .slice(-6)
    .toUpperCase();
  const tableTag = isDineIn && tableNumber ? ` T${tableNumber}` : '';
  const prevTitle = document.title;
  document.title = `Bill${tableTag}${shortRef ? ` #${shortRef}` : ''}`;

  window.print();

  setTimeout(() => {
    container.innerHTML = '';
    document.title = prevTitle;
  }, 500);

  return { ok: true, confirmation: 'browser-dialog' };
};

// TODO: Replace this browser-based print helper with an ESC/POS thermal printer
// integration (direct USB or a dedicated native bridge) so the kitchen and
// counter printers are addressed directly without the browser print dialog.
