import { formatInTimeZone } from '../../../../utils/datetime';
import { ALL_CATEGORIES, getPrinterConfig } from './usbPrinter';
import { expandClientDealItemsForKitchen } from './dealPricing';

export const CONNECTOR_URL = 'http://127.0.0.1:17873';
const CONNECTOR_TIMEOUT_MS = 8000;

// The installer now writes only the secret, but older key files also contain
// headings and instructions. Accept either format so users can safely paste
// the whole file instead of having to identify the exact line.
export const normalizeConnectorKey = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const collapsedLegacyFile = text.match(/Cenciss Print Connector Key\s*([A-Za-z0-9+/]{32})/i);
  if (collapsedLegacyFile) return collapsedLegacyFile[1];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyLine = lines.find((line) => /^[A-Za-z0-9+/]{32}$/.test(line));
  return keyLine || text;
};

const headers = (key, json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(key ? { 'X-Cenciss-Connector-Key': key } : {}),
});

const readResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Print Connector returned ${response.status}.`);
  return body;
};

const connectorFetch = async (path, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECTOR_TIMEOUT_MS);
  try {
    return await fetch(`${CONNECTOR_URL}${path}`, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The Print Connector did not respond. Make sure it is installed and running, then try again.');
    }
    throw new Error('Could not reach the Print Connector on this PC. Make sure it is installed and running.');
  } finally {
    clearTimeout(timer);
  }
};

export const getConnectorHealth = async () => readResponse(await connectorFetch('/health'));

export const getWindowsPrinters = async (key) => {
  const body = await readResponse(await connectorFetch('/printers', {
    headers: headers(normalizeConnectorKey(key)),
  }));
  return body.printers || [];
};

export const sendWindowsPrintJob = async (key, job) => readResponse(await connectorFetch('/print', {
  method: 'POST',
  headers: headers(normalizeConnectorKey(key), true),
  body: JSON.stringify(job),
}));

export const getCloudPrintStationStatus = async (key) =>
  readResponse(await connectorFetch('/cloud-config', {
    headers: headers(normalizeConnectorKey(key)),
  }));

export const configureCloudPrintStation = async (key, { apiBase, stationToken }) =>
  readResponse(await connectorFetch('/cloud-config', {
    method: 'POST',
    headers: headers(normalizeConnectorKey(key), true),
    body: JSON.stringify({ apiBase, stationToken }),
  }));

export const disconnectCloudPrintStation = async (key) =>
  readResponse(await connectorFetch('/cloud-config', {
    method: 'DELETE',
    headers: headers(normalizeConnectorKey(key)),
  }));

const categoryIdOf = (item) => String(
  item.categoryId?._id || item.categoryId || item.category?._id || item.category || ''
);

const center = (value, width = 42) => {
  const text = String(value || '');
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(left)}${text}`;
};

export const buildWindowsKotText = (
  order,
  outletName,
  items,
  stationName,
  { generatedAt = new Date() } = {},
) => {
  const type = (order.orderType || 'dine-in').toUpperCase();
  const ref = order.transactionNumber
    || (order.clientTransactionId ? `...${order.clientTransactionId.slice(-8).toUpperCase()}` : '-');
  const customer = order.customer || order._customer || null;
  const lines = [
    center('*** KITCHEN COPY ***'),
    ...(stationName ? [center(`[${stationName}]`)] : []),
    center(ref),
    '='.repeat(42),
    `${type}${order.tableNumber ? `  TABLE ${order.tableNumber}` : ''}`,
    `TIME: ${formatInTimeZone(generatedAt, order.timezone)}`,
    ...(customer?.name && order.orderType !== 'foodpanda' ? [`CUSTOMER: ${customer.name}`] : []),
    ...(order.orderType === 'foodpanda'
      ? [
          `FOODPANDA #: ${order.foodPandaOrderNumber || order.foodPandaReference || '-'}`,
          `CUSTOMER: ${order.foodPandaCustomerName || '-'}`,
        ]
      : []),
    '-'.repeat(42),
  ];
  (items || []).forEach((item) => {
    lines.push(`${item.qty || 0}x  ${item.name || 'Item'}${item.variation?.name || item.variationName ? ` (${item.variation?.name || item.variationName})` : ''}`);
    if (item.notes) lines.push(`    > ${item.notes}`);
  });
  lines.push('-'.repeat(42));
  lines.push(`TOTAL ITEMS: ${(items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)}`);
  if (order.notes) lines.push('', 'ORDER NOTE:', order.notes);
  lines.push('='.repeat(42), center('END OF TICKET'));
  return lines.join('\r\n');
};

export const getWindowsKitchenRoutes = (order, config = getPrinterConfig()) => {
  const items = expandClientDealItemsForKitchen(order?.items || []);
  const routesByPrinter = new Map();

  (config.windowsPrinters || []).forEach((printer) => {
    const physicalName = String(printer.printerName || '').trim();
    if (!physicalName) return;
    let routedItems;
    if (printer.role === 'dispatch') {
      routedItems = items;
    } else {
      const assigned = printer.categoryIds || [];
      routedItems = assigned.includes(ALL_CATEGORIES)
        ? items
        : items.filter((item) => assigned.map(String).includes(categoryIdOf(item)));
    }
    if (!routedItems.length) return;

    // Windows printer names are case-insensitive. Merge stale/duplicate saved
    // entries into one job per physical spooler queue and retain every item
    // covered by any of those entries.
    const key = physicalName.toLocaleLowerCase();
    const existing = routesByPrinter.get(key);
    if (!existing) {
      routesByPrinter.set(key, {
        printer: { ...printer, printerName: physicalName },
        items: [...routedItems],
      });
      return;
    }
    routedItems.forEach((item) => {
      if (!existing.items.includes(item)) existing.items.push(item);
    });
  });

  return [...routesByPrinter.values()];
};

export const getWindowsKitchenJobs = (
  order,
  outletName,
  config = getPrinterConfig(),
  { generatedAt = new Date() } = {},
) => (
  getWindowsKitchenRoutes(order, config).map(({ printer, items }) => ({
    printerName: printer.printerName,
    jobName: `Cenciss KOT - ${printer.customName || printer.printerName}`,
    text: buildWindowsKotText(order, outletName, items, printer.customName, { generatedAt }),
    copies: 1,
  }))
);

export const printKitchenViaWindows = async (
  order,
  outletName,
  { generatedAt = new Date() } = {},
) => {
  const config = getPrinterConfig();
  if (config.kitchenPrintMode !== 'windows') return false;
  if (!config.connectorKey) throw new Error('Windows Print Connector key is not configured.');
  const jobs = getWindowsKitchenJobs(order, outletName, config, { generatedAt });
  if (!jobs.length) throw new Error('No Windows kitchen printer matched this order.');
  const results = await Promise.allSettled(jobs.map((job) => sendWindowsPrintJob(config.connectorKey, job)));
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new Error(`${failures.length} Windows printer job${failures.length === 1 ? '' : 's'} failed: ${failures.map((failure) => failure.reason?.message || 'Unknown error').join('; ')}`);
  }
  return { ok: true, confirmation: 'windows-connector-complete', jobs: results.map((result) => result.value) };
};
