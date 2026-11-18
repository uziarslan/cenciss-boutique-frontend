/**
 * Driver-free USB thermal printing.
 *
 * Chromium's WebUSB API sends
 * ESC/POS bytes straight to a USB printer's bulk OUT endpoint. This bypasses
 * CUPS and vendor drivers and works well with older ESC/POS printers on macOS.
 */

import { formatInTimeZone } from '../../../../utils/datetime';
import { expandClientDealItemsForKitchen } from './dealPricing';
import { praVerificationUrl } from './praQr';

const STORAGE_KEY = 'pos_printer_config_v2';
const LEGACY_STORAGE_KEY = 'pos_printer_config_v1';
const USB_PRINTER_CLASS = 0x07;
const TRANSFER_CHUNK_SIZE = 16 * 1024;
export const ALL_CATEGORIES = '__all__';
export const RECEIPT_LINE_WIDTH = 42;

const loadConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveConfig = (cfg) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
};

export const getPrinterConfig = () => {
  const cfg = loadConfig();
  const hasSavedRegistry = Array.isArray(cfg.printers);
  const registry = hasSavedRegistry
    ? cfg.printers.map((printer) => ({
        id: printer.id || printer.deviceId,
        deviceId: printer.deviceId || printer.id,
        customName: printer.customName || printer.name || printer.deviceLabel || 'Thermal Printer',
        deviceLabel: printer.deviceLabel || printer.label || printer.customName || 'USB thermal printer',
        categoryIds: Array.isArray(printer.categoryIds) ? printer.categoryIds : [],
      })).filter((printer) => printer.id && printer.deviceId)
    : [];

  const addLegacyPrinter = (deviceId, label, categoryIds = []) => {
    if (!deviceId) return;
    const existing = registry.find((printer) => printer.deviceId === deviceId);
    if (existing) {
      if (categoryIds.includes(ALL_CATEGORIES) && !existing.categoryIds.length) existing.categoryIds = categoryIds;
      return;
    }
    registry.push({
      id: deviceId,
      deviceId,
      customName: label || 'Thermal Printer',
      deviceLabel: label || 'USB thermal printer',
      categoryIds,
    });
  };
  if (!hasSavedRegistry) {
    addLegacyPrinter(cfg.kitchenPrinterId, cfg.kitchenPrinterLabel, [ALL_CATEGORIES]);
    addLegacyPrinter(cfg.counterPrinterId, cfg.counterPrinterLabel);
  }

  return {
    enabled: cfg.enabled ?? false,
    // Per-output modes supersede the old global `enabled` switch. Preserve the
    // old behaviour for terminals that already saved USB settings.
    kitchenPrintMode: cfg.kitchenPrintMode || ((cfg.enabled ?? false) ? 'usb' : 'system'),
    receiptPrintMode: cfg.receiptPrintMode || ((cfg.enabled ?? false) ? 'usb' : 'system'),
    printers: registry,
    kitchenPrinterId: cfg.kitchenPrinterId || '',
    counterPrinterId: cfg.counterPrinterId || '',
    kitchenPrinterLabel: cfg.kitchenPrinterLabel || '',
    counterPrinterLabel: cfg.counterPrinterLabel || '',
    autoPrintKitchen: cfg.autoPrintKitchen ?? true,
    autoPrintReceipt: cfg.autoPrintReceipt ?? true,
    paperWidth: cfg.paperWidth || '80mm',
    verifyPrinterStatus: cfg.verifyPrinterStatus ?? true,
    restaurantLogo: cfg.restaurantLogo || '',
    routingOutletId: cfg.routingOutletId || '',
    systemKitchenCategoryIds: Array.isArray(cfg.systemKitchenCategoryIds)
      ? cfg.systemKitchenCategoryIds
      : [ALL_CATEGORIES],
    connectorKey: cfg.connectorKey || '',
    windowsPrinters: Array.isArray(cfg.windowsPrinters) ? cfg.windowsPrinters : [],
  };
};

export const setPrinterConfig = (patch) => {
  const next = { ...loadConfig(), ...patch };
  saveConfig(next);
  return next;
};

const usbApi = () => (typeof navigator !== 'undefined' ? navigator.usb : null);

export const getUsbSupport = () => {
  if (!usbApi()) return { supported: false, reason: 'Use Google Chrome or Microsoft Edge. Safari and Firefox do not support direct USB printing.' };
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { supported: false, reason: 'Direct USB printing requires HTTPS (localhost is also allowed).' };
  }
  return { supported: true, reason: '' };
};

export const isUsbAvailable = () => getUsbSupport().supported;

const hex = (value) => Number(value || 0).toString(16).padStart(4, '0');

export const getUsbPrinterId = (device) => [
  hex(device.vendorId),
  hex(device.productId),
  device.serialNumber || device.productName || 'usb-printer',
].join(':');

const getPrinterLabel = (device) => {
  const name = device.productName || 'USB thermal printer';
  const maker = device.manufacturerName && !name.toLowerCase().includes(device.manufacturerName.toLowerCase())
    ? `${device.manufacturerName} `
    : '';
  return `${maker}${name} (${hex(device.vendorId)}:${hex(device.productId)})`;
};

const describeDevice = (device, id = getUsbPrinterId(device)) => ({
  id,
  label: getPrinterLabel(device),
  vendorId: device.vendorId,
  productId: device.productId,
  serialNumber: device.serialNumber || '',
});

const describeDeviceInstances = (devices) => {
  const counts = new Map();
  return devices.map((device) => {
    const baseId = getUsbPrinterId(device);
    const occurrence = (counts.get(baseId) || 0) + 1;
    counts.set(baseId, occurrence);
    const id = occurrence === 1 ? baseId : `${baseId}#${occurrence}`;
    return { device, descriptor: describeDevice(device, id) };
  });
};

const alternatesFor = (device, selectedConfiguration = null) => (device.configurations || [])
  .filter((configuration) => !selectedConfiguration || configuration.configurationValue === selectedConfiguration.configurationValue)
  .flatMap((configuration) =>
  (configuration.interfaces || []).flatMap((iface) =>
    (iface.alternates || []).map((alternate) => ({ configuration, iface, alternate }))
  )
);

const findWritableInterface = (device, selectedConfiguration = null) => {
  const choices = alternatesFor(device, selectedConfiguration)
    .map((entry) => ({
      ...entry,
      outEndpoint: (entry.alternate.endpoints || []).find((endpoint) => endpoint.direction === 'out'),
    }))
    .filter((entry) => entry.outEndpoint);
  return choices.find((entry) => entry.alternate.interfaceClass === USB_PRINTER_CLASS) || choices[0] || null;
};

export const listPrinters = async () => {
  const support = getUsbSupport();
  if (!support.supported) throw new Error(support.reason);
  const devices = await usbApi().getDevices();
  return describeDeviceInstances(devices.filter(findWritableInterface)).map((entry) => entry.descriptor);
};

/** Must be called from a user click because the browser opens its USB chooser. */
export const connectUsbPrinter = async ({ compatibilityMode = false } = {}) => {
  const support = getUsbSupport();
  if (!support.supported) throw new Error(support.reason);
  // Most ESC/POS clones that do not declare the standard printer class expose
  // a vendor-specific (0xff) interface instead. A class filter keeps Chrome's
  // chooser useful while still covering those devices.
  const filters = [{ classCode: compatibilityMode ? 0xff : USB_PRINTER_CLASS }];
  const device = await usbApi().requestDevice({ filters });
  if (!findWritableInterface(device)) {
    if (typeof device.forget === 'function') await device.forget().catch(() => {});
    throw new Error('That USB device has no writable printer endpoint. Choose the thermal printer, not a keyboard, hub, or storage device.');
  }
  const devices = (await usbApi().getDevices()).filter(findWritableInterface);
  return describeDeviceInstances(devices).find((entry) => entry.device === device)?.descriptor || describeDevice(device);
};

export const forgetUsbPrinter = async (printerId) => {
  if (!usbApi()) return;
  const devices = await usbApi().getDevices();
  const device = describeDeviceInstances(devices.filter(findWritableInterface))
    .find((entry) => entry.descriptor.id === printerId)?.device;
  if (device?.opened) await device.close().catch(() => {});
  if (device && typeof device.forget === 'function') await device.forget();
};

const resolveDevice = async (printerId) => {
  const devices = await usbApi().getDevices();
  const device = describeDeviceInstances(devices.filter(findWritableInterface))
    .find((entry) => entry.descriptor.id === printerId)?.device;
  if (!device) throw new Error('The printer is not paired with this browser. Open Printer Settings and connect it again.');
  return device;
};

const openPrinter = async (device) => {
  if (!device.opened) await device.open();
  let writable = device.configuration ? findWritableInterface(device, device.configuration) : null;
  if (!writable) {
    const available = findWritableInterface(device);
    if (!available) throw new Error('No writable USB endpoint was found on this printer.');
    await device.selectConfiguration(available.configuration.configurationValue);
    writable = findWritableInterface(device, device.configuration) || available;
  }
  const interfaceNumber = writable.iface.interfaceNumber;
  if (!writable.iface.claimed) await device.claimInterface(interfaceNumber);
  if (writable.alternate.alternateSetting !== writable.iface.alternate?.alternateSetting) {
    await device.selectAlternateInterface(interfaceNumber, writable.alternate.alternateSetting);
  }
  return {
    interfaceNumber,
    endpointNumber: writable.outEndpoint.endpointNumber,
    isPrinterClass: writable.alternate.interfaceClass === USB_PRINTER_CLASS,
  };
};

// USB Printer Class GET_PORT_STATUS. Clone printers often stall this request;
// that means "unknown", not a failed print, so transfer completion remains the
// baseline confirmation.
const readPortStatus = async (device, interfaceNumber, isPrinterClass) => {
  if (!isPrinterClass) return null;
  try {
    const result = await device.controlTransferIn({
      requestType: 'class',
      recipient: 'interface',
      request: 1,
      value: 0,
      index: interfaceNumber,
    }, 1);
    if (result.status !== 'ok' || !result.data?.byteLength) return null;
    const raw = result.data.getUint8(0);
    if (raw === 0) return null; // several inexpensive ESC/POS clones return a meaningless zero
    return {
      raw,
      paperEmpty: (raw & 0x20) !== 0,
      selected: (raw & 0x10) !== 0,
      noError: (raw & 0x08) !== 0,
    };
  } catch {
    return null;
  }
};

const assertPrinterReady = (status) => {
  if (!status) return;
  if (status.paperEmpty) throw new Error('Printer is out of paper. Load paper and try again.');
  if (!status.selected) throw new Error('Printer reports offline or not selected. Check its power and USB cable.');
  if (!status.noError) throw new Error('Printer reports a hardware error. Check the cover, cutter, and paper.');
};

// ESC/POS is a byte protocol, not UTF-8. Builders above transliterate receipt
// text to ASCII; preserving each JS code unit as one byte keeps command values
// such as ESC (0x1b) and GS (0x1d) exact.
const toRawBytes = (data) => data instanceof Uint8Array
  ? data
  : Uint8Array.from(String(data ?? ''), (character) => character.charCodeAt(0) & 0xff);

// ── ESC/POS helpers ─────────────────────────────────────────────────────────

const ESC = '\x1B';
const GS = '\x1D';
const INIT = `${ESC}@`;
const CUT = `${GS}V\x01`; // partial cut
const FEED = (n = 4) => `${ESC}d${String.fromCharCode(n)}`;
const ALIGN = {
  left: `${ESC}a\x00`,
  center: `${ESC}a\x01`,
  right: `${ESC}a\x02`,
};
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const SIZE_NORMAL = `${ESC}!\x00`;
// ESC ! uses separate bits for double height (0x10) and double width (0x20).
// 0x11 also selects the printer's narrow Font B, which makes headings look
// tall and horizontally squeezed. Keep Font A and enable both size bits.
const SIZE_DOUBLE = `${ESC}!\x30`; // Font A, 2x width & height
const toAscii = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, (c) => {
      // Common Latin-1 fallback for thermal printers
      const map = {
        '₨': 'Rs.', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
        '“': '"', '”': '"', '‘': "'", '’': "'",
        '–': '-', '—': '-', '…': '...',
      };
      return map[c] || '?';
    });

const line = (text = '') => `${toAscii(text)}\n`;
const divider = () => line('-'.repeat(RECEIPT_LINE_WIDTH));

// Native ESC/POS QR sequence. The QR contains PRA's complete verification URL,
// as required by the eIMS specification.
const qrCode = (value) => {
  const qrData = toAscii(value);
  if (!qrData) return '';
  const bytes = (...values) => String.fromCharCode(...values);
  const storeLength = qrData.length + 3;
  return `${GS}(k${bytes(4, 0, 49, 65, 50, 0)}`
    + `${GS}(k${bytes(3, 0, 49, 67, 5)}`
    + `${GS}(k${bytes(3, 0, 49, 69, 49)}`
    + `${GS}(k${bytes(storeLength & 0xff, (storeLength >> 8) & 0xff, 49, 80, 48)}${qrData}`
    + `${GS}(k${bytes(3, 0, 49, 81, 48)}`;
};
const columns = (left, right, width = RECEIPT_LINE_WIDTH) => {
  const lhs = toAscii(left);
  const rhs = toAscii(right);
  if (lhs.length + rhs.length + 1 > width) return line(lhs) + line(rhs.padStart(width));
  return line(`${lhs}${' '.repeat(width - lhs.length - rhs.length)}${rhs}`);
};

// ── Receipt builders ────────────────────────────────────────────────────────

const fmtPKR = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;
const fmtRate = (value) => String(+Number(value || 0).toFixed(2));
const fmtTime = (d, timezone) => formatInTimeZone(d || new Date(), timezone);

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

/** Build ESC/POS bytes for a customer receipt. */
export const buildReceiptEscPos = (
  transaction,
  outletName,
  cashierName,
  logoCommand = '',
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

  const itemCount = items.reduce((s, i) => s + Number(i.qty ?? i.quantity ?? 0), 0);

  const appliedDiscountPercent = discountMode === 'percent'
    ? (discountPercent > 0
      ? discountPercent
      : (subtotal > 0 ? (discountAmount / subtotal) * 100 : 0))
    : 0;
  const discountLabel = appliedDiscountPercent > 0
    ? `Discount (${fmtRate(appliedDiscountPercent)}%)`
    : 'Discount';
  const taxBase = items.reduce(
    (sum, item) => sum + (Number(item.taxRate || 0) > 0
      ? Number(item.lineTotal ?? (Number(item.qty || 0) * Number(item.unitPrice || 0)))
      : 0),
    0,
  );
  const effectiveTaxRate = transaction.effectiveTaxRate != null
    && transaction.effectiveTaxRate !== ''
    ? Number(transaction.effectiveTaxRate)
    : (taxBase > 0 ? (taxAmount / taxBase) * 100 : 0);
  const taxLabel = effectiveTaxRate > 0
    ? `Tax (${fmtRate(effectiveTaxRate)}%)`
    : 'Tax';
  const serviceChargeBase = items.reduce(
    (sum, item) => sum + ((Number(item.serviceChargeRate ?? item.serviceCharge) || 0) > 0
      ? Number(item.lineTotal ?? (Number(item.qty ?? item.quantity ?? 0) * Number(item.unitPrice ?? item.price ?? 0)))
      : 0),
    0,
  );
  const storedServiceChargeRate = Number(transaction.serviceChargeRate || 0);
  const serviceChargeRate = storedServiceChargeRate > 0
    ? storedServiceChargeRate
    : (serviceChargeBase > 0 ? (serviceChargeAmount / serviceChargeBase) * 100 : 0);
  const serviceChargeLabel = serviceChargeRate > 0
    ? `Service Charge (${fmtRate(serviceChargeRate)}%)`
    : 'Service Charge';
  const billTaxBasisLabel = transaction.billTaxBasis === 'card'
    ? 'Card Tax'
    : transaction.billTaxBasis === 'cash'
      ? 'Cash Tax'
      : '';

  let data = INIT;
  data += ALIGN.center;
  if (logoCommand) data += logoCommand;
  data += BOLD_ON;
  data += SIZE_DOUBLE;
  data += line(toAscii(outletName || 'Receipt'));
  data += SIZE_NORMAL;
  data += BOLD_OFF;
  data += line('');
  data += BOLD_ON;
  data += line('CUSTOMER BILL');
  data += BOLD_OFF;
  data += line('');
  data += divider();
  data += ALIGN.left;

  data += line(`Date: ${fmtTime(transaction.createdAt, transaction.timezone)}`);
  data += line(`Receipt #: ${transaction.transactionNumber || (transaction.clientTransactionId ? `...${transaction.clientTransactionId.slice(-8).toUpperCase()}` : '-')}`);
  data += line(`Cashier: ${cashierName || 'Unknown'}`);
  data += line(`Order Type: ${orderTypeLabel}`);
  if (transaction.offline) data += line('Status: OFFLINE - Pending sync');
  if (billTaxBasisLabel) data += line(`Bill Type: ${billTaxBasisLabel}`);
  if (transaction.assignedRider?.name) data += line(`Rider: ${transaction.assignedRider.name}`);
  if (orderType !== 'foodpanda' && customer?.name) data += line(`Customer: ${customer.name}`);
  if (orderType !== 'foodpanda' && customer?.phone) data += line(`Phone: ${customer.phone}`);
  if (orderType === 'foodpanda') {
    data += line(`Foodpanda Order #: ${transaction.foodPandaOrderNumber || transaction.foodPandaReference || '-'}`);
    data += line(`Foodpanda Customer: ${transaction.foodPandaCustomerName || '-'}`);
  }
  if (isDineIn && tableNumber) {
    data += ALIGN.center;
    data += SIZE_DOUBLE;
    data += line(`TABLE ${tableNumber}`);
    data += SIZE_NORMAL;
    data += ALIGN.left;
  }
  if (isDelivery && deliveryAddress) {
    data += line('Delivery Address:');
    data += line([deliveryAddress.label, deliveryAddress.street, deliveryAddress.area, deliveryAddress.city].filter(Boolean).join(', '));
  }
  data += divider();

  // Items header
  data += BOLD_ON;
  data += columns('ITEM / QTY x PRICE', 'AMOUNT');
  data += BOLD_OFF;

  items.forEach((item) => {
    const qty = Number(item.qty ?? item.quantity ?? 1);
    const unit = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.lineTotal ?? qty * unit);
    const name = (item.name || item.menuItemName || '-') + ((item.variation?.name || item.variationName) ? ` (${item.variation?.name || item.variationName})` : '');
    data += line(`${toAscii(name)}`);
    data += columns(`  ${qty} x ${fmtPKR(unit)}`, fmtPKR(lineTotal));
  });

  if (!items.length) data += line('No items');
  data += divider();

  data += columns('Items', itemCount);
  data += columns('Subtotal', fmtPKR(subtotal));
  if (taxAmount > 0) data += columns(taxLabel, fmtPKR(taxAmount));
  if (serviceChargeAmount > 0) data += columns(serviceChargeLabel, fmtPKR(serviceChargeAmount));
  if (Number(transaction.deliveryChargeAmount) > 0) data += columns('Delivery', fmtPKR(transaction.deliveryChargeAmount));
  if (orderType !== 'foodpanda' && paymentMethod !== 'foodpanda' && discountAmount > 0) {
    data += columns(discountLabel, `-${fmtPKR(discountAmount)}`);
  }
  if (orderType !== 'foodpanda' && paymentMethod !== 'foodpanda' && transaction.pointsRedeemed > 0) {
    data += columns('Points', `-${fmtPKR(transaction.pointsRedeemedValue || 0)}`);
  }

  data += divider();
  data += BOLD_ON;
  data += columns('TOTAL', fmtPKR(totalAmount));
  data += BOLD_OFF;
  data += divider();

  // Payment block. Held table bills deliberately omit the payment method because
  // the guest has not selected one yet.
  if (transaction.status === 'held') {
    data += columns('Amount Due', fmtPKR(totalAmount));
  } else if (transaction.status === 'out-for-delivery') {
    data += line(`Payment: Cash on Delivery`);
    data += columns('Amount Due', fmtPKR(totalAmount));
  } else {
    data += line(`Payment: ${PAYMENT_LABEL[paymentMethod] || paymentMethod}`);
    if (paymentMethod === 'cash') {
      data += columns('Cash Tendered', fmtPKR(cashTendered));
      data += columns('Change', fmtPKR(changeGiven));
    } else if (paymentMethod === 'card') {
      data += columns('Card', fmtPKR(totalAmount));
      if (transaction.cardLast4 || transaction.cardReference) {
        data += line(`Card No.: ****${transaction.cardLast4 || transaction.cardReference}`);
      }
    } else if (paymentMethod === 'online-transfer') {
      data += columns('Transfer', fmtPKR(transaction.onlineTransferAmount || totalAmount));
      data += line(`Reference: ${transaction.onlineTransferReference || '—'}`);
    } else if (paymentMethod === 'split') {
      data += columns('Cash', fmtPKR(transaction.cashAmount ?? cashTendered));
      data += columns('Card', fmtPKR(cardAmount));
    } else if (paymentMethod === 'allowance') {
      data += line('Charged To: Staff Allowance');
    } else if (paymentMethod === 'charge-to-salary') {
      data += line(`Employee: ${transaction.chargeToSalaryEmployeeName || transaction.chargeToSalaryEmployee?.name || 'Employee'}`);
    } else if (paymentMethod === 'foodpanda') {
      data += line('Platform: Food Panda (receivable)');
      if (transaction.foodPandaReference
        && transaction.foodPandaReference !== transaction.foodPandaOrderNumber) {
        data += line(`Reference: ${transaction.foodPandaReference}`);
      }
    }
  }

  if (Number(transaction.storeCreditRedeemed || 0) > 0) {
    data += columns('Store Credit', fmtPKR(transaction.storeCreditRedeemed));
  }

  if (transaction.notes) {
    data += divider();
    data += line('Note:');
    data += line(transaction.notes);
  }

  const praNo = transaction.pra?.invoiceNumber || transaction.praInvoiceNumber || '';
  if (praNo) {
    data += divider();
    data += ALIGN.center;
    data += line('PRA eIMS FISCAL INVOICE');
    data += qrCode(praVerificationUrl(praNo));
    data += line(`PRA No: ${praNo}`);
    data += ALIGN.left;
  }

  data += divider();
  data += ALIGN.center;
  data += line('Thank you — please come again!');
  data += line(`Bill generated ${fmtTime(generatedAt, transaction.timezone)}`);
  data += line('Powered by Cenciss');
  data += line('www.cenciss.com');
  // Leave enough paper after the final line for printers whose cutter sits
  // several millimetres below the print head.
  data += FEED(8);
  data += CUT;
  return data;
};

/** Build ESC/POS bytes for a kitchen ticket. */
export const buildKitchenEscPos = (
  order,
  outletName,
  { generatedAt = new Date() } = {},
) => {
  const items = order.items || [];
  const orderType = ORDER_TYPE_LABEL[order.orderType] || 'Dine-In';
  const isDineIn = order.orderType === 'dine-in' || !order.orderType;
  const tableNumber = order.tableNumber ? String(order.tableNumber).trim() : '';
  const customer = order.customer || order._customer || null;
  const rawRef = order.transactionNumber || order.clientTransactionId || '';
  const ref = order.transactionNumber
    ? order.transactionNumber
    : rawRef
      ? `...${rawRef.slice(-8).toUpperCase()}`
      : '-';

  let data = INIT;
  data += ALIGN.center;
  data += BOLD_ON;
  data += SIZE_DOUBLE;
  data += line('*** KITCHEN COPY ***');
  data += SIZE_NORMAL;
  if (order.printerName) data += line(`[${order.printerName}]`);
  data += SIZE_DOUBLE;
  data += line(toAscii(ref));
  data += SIZE_NORMAL;
  data += BOLD_OFF;
  data += divider();
  data += ALIGN.left;

  data += line(orderType.toUpperCase());
  data += line(`Time: ${fmtTime(generatedAt, order.timezone)}`);
  if (isDineIn && tableNumber) {
    data += ALIGN.center;
    data += SIZE_DOUBLE;
    data += line(`TABLE ${tableNumber}`);
    data += SIZE_NORMAL;
    data += ALIGN.left;
  }
  if (order.orderType !== 'foodpanda' && customer?.name) data += line(`Cust: ${customer.name}`);
  if (order.orderType === 'foodpanda') {
    data += BOLD_ON;
    data += line(`FOODPANDA #: ${order.foodPandaOrderNumber || order.foodPandaReference || '-'}`);
    data += line(`CUSTOMER: ${order.foodPandaCustomerName || '-'}`);
    data += BOLD_OFF;
  }
  data += divider();

  items.forEach((item) => {
    const qty = Number(item.qty ?? item.quantity ?? 1);
    const name = (item.name || item.menuItemName || '-') + ((item.variation?.name || item.variationName) ? ` (${item.variation?.name || item.variationName})` : '');
    data += SIZE_DOUBLE;
    data += line(`${qty}x ${toAscii(name)}`);
    data += SIZE_NORMAL;
    if (item.notes) data += line(`  -> ${item.notes}`);
  });

  if (!items.length) data += line('No items');
  data += divider();
  data += line(`Total items: ${items.reduce((s, i) => s + Number(i.qty || 0), 0)}`);

  if (order.notes) {
    data += divider();
    data += BOLD_ON;
    data += line('NOTE');
    data += BOLD_OFF;
    data += line(order.notes);
  }

  data += divider();
  data += ALIGN.center;
  data += line('--- END OF TICKET ---');
  data += FEED(4);
  data += CUT;
  return data;
};

const loadImage = (source) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The restaurant logo could not be read. Upload a PNG or JPG image.'));
  image.src = source;
});

export const resizeLogoForStorage = async (file) => {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a PNG or JPG image file.');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The logo file could not be read.'));
    reader.readAsDataURL(file);
  });
  const image = await loadImage(source);
  const scale = Math.min(1, 512 / image.width, 180 / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};

const bytesToBinaryString = (bytes) => {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    result += String.fromCharCode(...bytes.slice(offset, offset + 4096));
  }
  return result;
};

/** Convert a stored logo to the classic ESC/POS 24-dot bit-image command. */
export const buildLogoEscPos = async (dataUrl) => {
  if (!dataUrl) return '';
  const image = await loadImage(dataUrl);
  // 384 dots fits common 58 mm printers as well as wider receipt printers.
  const scale = Math.min(1, 384 / image.width, 160 / image.height);
  const width = Math.max(8, Math.ceil((image.width * scale) / 8) * 8);
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, Math.round(image.width * scale), height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const command = [];
  // ESC * mode 33 is the traditional 24-dot double-density image command.
  // It is supported by older ESC/POS printers that treat GS v 0 data as text.
  for (let bandY = 0; bandY < height; bandY += 24) {
    command.push(0x1b, 0x2a, 33, width & 0xff, (width >> 8) & 0xff);
    for (let x = 0; x < width; x += 1) {
      for (let plane = 0; plane < 3; plane += 1) {
        let column = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          const y = bandY + (plane * 8) + bit;
          if (y >= height) continue;
          const pixel = (y * width + x) * 4;
          const alpha = pixels[pixel + 3] / 255;
          const luminance = (pixels[pixel] * 0.299) + (pixels[pixel + 1] * 0.587) + (pixels[pixel + 2] * 0.114);
          if (alpha > 0.15 && luminance < 170) column |= (0x80 >> bit);
        }
        command.push(column);
      }
    }
    // Line feed advances exactly one 24-dot image band before the next one.
    command.push(0x0a);
  }
  return `${ALIGN.center}${bytesToBinaryString(Uint8Array.from(command))}`;
};

/**
 * Send ESC/POS bytes directly to a paired USB printer.
 * Resolves only after every byte was accepted by the USB endpoint. When the
 * printer implements USB Printer Class status, it is checked before and after.
 */
export const printRaw = async (printerId, data, { verifyStatus = true } = {}) => {
  const support = getUsbSupport();
  if (!support.supported) throw new Error(support.reason);
  if (!printerId) throw new Error('No USB printer is assigned. Open Printer Settings and connect one.');

  const device = await resolveDevice(printerId);
  let connection;
  let preStatus = null;
  let postStatus = null;
  let bytesWritten = 0;

  try {
    connection = await openPrinter(device);
    if (verifyStatus) {
      preStatus = await readPortStatus(device, connection.interfaceNumber, connection.isPrinterClass);
      assertPrinterReady(preStatus);
    }

    const payload = toRawBytes(data);
    for (let offset = 0; offset < payload.byteLength; offset += TRANSFER_CHUNK_SIZE) {
      const chunk = payload.slice(offset, offset + TRANSFER_CHUNK_SIZE);
      const result = await device.transferOut(connection.endpointNumber, chunk);
      if (result.status !== 'ok' || result.bytesWritten !== chunk.byteLength) {
        throw new Error(`USB transfer stopped after ${bytesWritten} of ${payload.byteLength} bytes.`);
      }
      bytesWritten += result.bytesWritten;
    }

    // USB transfer completion means the endpoint accepted the bytes; many
    // thermal printers still need time to render the final lines and cut.
    // Keep the interface open so closing it cannot truncate the customer copy.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (verifyStatus) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      postStatus = await readPortStatus(device, connection.interfaceNumber, connection.isPrinterClass);
      assertPrinterReady(postStatus);
    }

    return {
      ok: true,
      bytesWritten,
      confirmation: postStatus || preStatus ? 'printer-status-verified' : 'usb-transfer-complete',
      printer: describeDevice(device),
      status: postStatus || preStatus,
    };
  } catch (error) {
    if (error?.name === 'NetworkError' || error?.name === 'NotFoundError') {
      throw new Error('Could not open the USB printer. Check its power and cable, close other printer apps, then try again.');
    }
    throw error;
  } finally {
    if (device?.opened && connection) {
      await device.releaseInterface(connection.interfaceNumber).catch(() => {});
      await device.close().catch(() => {});
    }
  }
};

/** Print a customer receipt through direct USB, or return false for browser fallback. */
export const printReceiptViaUsb = async (
  transaction,
  outletName,
  cashierName,
  { generatedAt = new Date() } = {},
) => {
  const cfg = getPrinterConfig();
  if (cfg.receiptPrintMode !== 'usb' || !cfg.counterPrinterId) return false;
  const logo = await buildLogoEscPos(cfg.restaurantLogo);
  const data = buildReceiptEscPos(transaction, outletName, cashierName, logo, { generatedAt });
  return printRaw(cfg.counterPrinterId, data, { verifyStatus: cfg.verifyPrinterStatus });
};

const categoryIdOf = (item) => String(
  item.categoryId?._id || item.categoryId || item.category?._id || item.category || ''
);

/** Filter a browser/system-dialog KOT using this terminal's category route. */
export const getSystemKitchenItems = (order, config = getPrinterConfig()) => {
  const items = expandClientDealItemsForKitchen(order?.items || []);
  const assigned = config.systemKitchenCategoryIds || [ALL_CATEGORIES];
  if (!assigned.length || assigned.includes(ALL_CATEGORIES)) return items;
  const ids = new Set(assigned.map(String));
  return items.filter((item) => ids.has(categoryIdOf(item)));
};

export const getKitchenPrinterRoutes = (order, config = getPrinterConfig()) => {
  const items = expandClientDealItemsForKitchen(order?.items || []);
  const routesByDevice = new Map();

  (config.printers || []).filter((printer) => (
    printer.deviceId && printer.deviceId !== config.counterPrinterId
  )).forEach((printer) => {
    const assigned = printer.categoryIds || [];
    if (!assigned.length) return;
    const routedItems = assigned.includes(ALL_CATEGORIES)
      ? items
      : items.filter((item) => assigned.map(String).includes(categoryIdOf(item)));
    if (!routedItems.length) return;

    // Old/local settings can contain the same physical USB device more than
    // once. Merge those routes so one Send action writes exactly one KOT job
    // to that device while preserving all items assigned across its entries.
    const key = String(printer.deviceId);
    const existing = routesByDevice.get(key);
    if (!existing) {
      routesByDevice.set(key, { printer, items: [...routedItems] });
      return;
    }
    routedItems.forEach((item) => {
      if (!existing.items.includes(item)) existing.items.push(item);
    });
  });

  return [...routesByDevice.values()];
};

/** Print category-filtered kitchen tickets to every matching USB printer. */
export const printKitchenViaUsb = async (
  order,
  outletName,
  { generatedAt = new Date() } = {},
) => {
  const cfg = getPrinterConfig();
  if (cfg.kitchenPrintMode !== 'usb') return false;
  const kitchenPrinters = (cfg.printers || []).filter((printer) => (
    printer.deviceId !== cfg.counterPrinterId && printer.categoryIds?.length
  ));
  if (!kitchenPrinters.length) return false;

  const hasAllCategoriesPrinter = kitchenPrinters.some((printer) => (
    printer.categoryIds.includes(ALL_CATEGORIES)
  ));
  if (!hasAllCategoriesPrinter) {
    const assignedCategoryIds = new Set(kitchenPrinters.flatMap((printer) => printer.categoryIds.map(String)));
    const unroutedItems = expandClientDealItemsForKitchen(order?.items || []).filter((item) => (
      !categoryIdOf(item) || !assignedCategoryIds.has(categoryIdOf(item))
    ));
    if (unroutedItems.length) {
      const categoryNames = [...new Set(unroutedItems.map((item) => (
        item.categoryName || 'Uncategorised items'
      )))];
      throw new Error(
        `No kitchen printer is assigned to: ${categoryNames.join(', ')}. `
        + 'Assign those categories or select All Categories on a backup printer.',
      );
    }
  }

  const routes = getKitchenPrinterRoutes(order, cfg);
  if (!routes.length) {
    throw new Error('No kitchen printer matched the categories in this order.');
  }
  const results = await Promise.allSettled(routes.map(({ printer, items }) => printRaw(
    printer.deviceId,
    buildKitchenEscPos(
      { ...order, items, printerName: printer.customName },
      outletName,
      { generatedAt },
    ),
    { verifyStatus: cfg.verifyPrinterStatus },
  )));
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    const messages = failures.map((failure) => failure.reason?.message || 'Unknown printer error');
    throw new Error(`${failures.length} kitchen printer${failures.length === 1 ? '' : 's'} failed: ${messages.join('; ')}`);
  }
  return { ok: true, confirmation: 'multi-printer-complete', jobs: results.map((result) => result.value) };
};

const usbPrinter = {
  getUsbSupport,
  isUsbAvailable,
  getUsbPrinterId,
  connectUsbPrinter,
  forgetUsbPrinter,
  listPrinters,
  getPrinterConfig,
  setPrinterConfig,
  buildReceiptEscPos,
  buildKitchenEscPos,
  buildLogoEscPos,
  resizeLogoForStorage,
  getKitchenPrinterRoutes,
  printRaw,
  printReceiptViaUsb,
  printKitchenViaUsb,
};

export default usbPrinter;
