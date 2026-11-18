// Kitchen ticket — thermal 80mm layout.
// Goal: large, scannable from across the line. Items + qty + modifiers only.
// No prices, no payment, no totals.

import { formatInTimeZone } from '../../../../utils/datetime';
import {
  getPrinterConfig,
  getSystemKitchenItems,
  printKitchenViaUsb,
} from './usbPrinter';
import { printKitchenViaWindows } from './windowsPrintConnector';
import { expandClientDealItemsForKitchen } from './dealPricing';

const ORDER_TYPE_LABEL = {
  'dine-in': 'DINE-IN',
  takeaway: 'TAKEAWAY',
  delivery: 'DELIVERY',
  foodpanda: 'FOODPANDA',
};

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const fmtTime = (d, timezone) => formatInTimeZone(d || new Date(), timezone);

/**
 * Build the browser-print KOT. The same HTML string is used in the in-app
 * preview and, for system printing, in the hidden 80mm print container.
 */
export const buildKitchenHtml = (
  order,
  outletName,
  { generatedAt = new Date() } = {},
) => {
  const items = expandClientDealItemsForKitchen(order?.items || []);
  const orderType = ORDER_TYPE_LABEL[order.orderType] || 'DINE-IN';
  const isDineIn = order.orderType === 'dine-in' || !order.orderType;
  const tableNumber = order.tableNumber ? String(order.tableNumber).trim() : '';
  const customer = order.customer || order._customer || null;
  // Show the short server-issued transactionNumber when available; otherwise
  // fall back to the last 8 chars of the client UUID — a full UUID is noisy
  // on an 80mm strip and useless for cashier reference.
  const rawRef = order.transactionNumber || order.clientTransactionId || '';
  const ref = order.transactionNumber
    ? order.transactionNumber
    : rawRef
      ? `...${rawRef.slice(-8).toUpperCase()}`
      : '-';

  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding:4px 6px 4px 0;font-size:18px;font-weight:bold;vertical-align:top;white-space:nowrap;">${escape(item.qty)}×</td>
      <td style="padding:4px 0;font-size:15px;font-weight:bold;line-height:1.25;">
        ${escape(item.name)}${(item.variation?.name || item.variationName) ? ` <span style="font-size:13px;">(${escape(item.variation?.name || item.variationName)})</span>` : ''}
        ${item.notes ? `<div style="font-size:11px;font-weight:normal;font-style:italic;margin-top:2px;">↳ ${escape(item.notes)}</div>` : ''}
      </td>
    </tr>
  `).join('');

  const tableBlock = isDineIn && tableNumber ? `
    <div style="border:2px solid #000;text-align:center;padding:6px 4px;margin:6px 0;">
      <div style="font-size:10px;letter-spacing:2px;">TABLE</div>
      <div style="font-size:28px;font-weight:bold;line-height:1;">${escape(tableNumber)}</div>
    </div>
  ` : '';

  const customerBlock = customer && order.orderType !== 'foodpanda' ? `
    <div style="font-size:11px;margin-top:4px;">
      ${customer.name ? `Cust: <strong>${escape(customer.name)}</strong>` : ''}
    </div>
  ` : '';
  const foodPandaBlock = order.orderType === 'foodpanda' ? `
    <div style="border:2px solid #000;padding:6px;margin-top:6px;font-size:12px;line-height:1.35;">
      <div><strong>FOODPANDA #:</strong> ${escape(order.foodPandaOrderNumber || order.foodPandaReference || '-')}</div>
      <div><strong>CUSTOMER:</strong> ${escape(order.foodPandaCustomerName || '-')}</div>
    </div>
  ` : '';

  const noteBlock = order.notes ? `
    <div style="border:1px solid #000;padding:6px;margin-top:8px;">
      <div style="font-size:11px;font-weight:bold;letter-spacing:1px;">NOTE</div>
      <div style="font-size:13px;font-weight:bold;white-space:pre-wrap;line-height:1.3;">${escape(order.notes)}</div>
    </div>
  ` : '';

  return `
    <div class="print-kitchen">
      <div style="text-align:center;font-size:14px;font-weight:bold;letter-spacing:2px;">*** KITCHEN COPY ***</div>
      ${order.printerName ? `<div style="text-align:center;font-size:11px;font-weight:bold;margin-top:2px;">[${escape(order.printerName)}]</div>` : ''}
      <div style="text-align:center;font-size:14px;font-weight:bold;margin-top:3px;">${escape(ref)}</div>
      <div style="border-bottom:2px solid #000;margin:6px 0;"></div>

      <div style="font-size:11px;">
        <div>
          <div><strong>${orderType}</strong></div>
          <div>${fmtTime(generatedAt, order.timezone)}</div>
        </div>
      </div>

      ${tableBlock}
      ${customerBlock}
      ${foodPandaBlock}

      <div style="border-bottom:1px dashed #000;margin:8px 0 4px;"></div>

      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${itemsHtml || '<tr><td style="font-size:12px;font-style:italic;">No items</td></tr>'}
        </tbody>
      </table>

      <div style="border-bottom:1px dashed #000;margin:6px 0;"></div>
      <div style="font-size:11px;text-align:right;">Total items: <strong>${items.reduce((s, i) => s + Number(i.qty || 0), 0)}</strong></div>

      ${noteBlock}

      <div style="border-bottom:2px solid #000;margin:8px 0 0;"></div>
      <div style="text-align:center;font-size:10px;margin-top:4px;">--- END OF TICKET ---</div>
    </div>
  `;
};

export const printKitchenTicket = async (
  order,
  outletName,
  { generatedAt = new Date(), ticketHtml } = {},
) => {
  const windowsResult = await printKitchenViaWindows(order, outletName, { generatedAt });
  if (windowsResult) return windowsResult;
  // Direct USB is authoritative when configured. Propagate failures so the POS
  // cannot mark a KOT printed after a rejected/partial USB transfer.
  const usbResult = await printKitchenViaUsb(order, outletName, { generatedAt });
  if (usbResult) return usbResult;

  const containerId = 'kitchen-print-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.dataset.printer = 'kitchen';
    document.body.appendChild(container);
  }

  const html = ticketHtml || buildKitchenHtml(
    { ...order, items: getSystemKitchenItems(order, getPrinterConfig()) },
    outletName,
    { generatedAt },
  );
  container.innerHTML = html;

  // Short, useful print-job/preview title.
  const isDineIn = order.orderType === 'dine-in' || !order.orderType;
  const tableNumber = order.tableNumber ? String(order.tableNumber).trim() : '';
  const rawRef = order.transactionNumber || order.clientTransactionId || '';
  const ref = order.transactionNumber
    ? order.transactionNumber
    : rawRef
      ? `...${rawRef.slice(-8).toUpperCase()}`
      : '-';
  const tableTag = isDineIn && tableNumber ? ` T${tableNumber}` : '';
  const prevTitle = document.title;
  document.title = `KOT${tableTag}${ref && ref !== '-' ? ` #${ref.replace(/^\.\.\./, '')}` : ''}`;

  window.print();

  setTimeout(() => {
    container.innerHTML = '';
    document.title = prevTitle;
  }, 500);

  return { ok: true, confirmation: 'browser-dialog' };
};
