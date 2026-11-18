import { useEffect, useState } from 'react';
import { Image as ImageIcon, Monitor, Printer, RefreshCw, Trash2, Usb } from 'lucide-react';
import toast from 'react-hot-toast';
import FloatingSelect from '../../components/UI/FloatingSelect';
import {
  buildLogoEscPos,
  buildReceiptEscPos,
  connectUsbPrinter,
  forgetUsbPrinter,
  getPrinterConfig,
  getUsbSupport,
  listPrinters,
  printRaw,
  resizeLogoForStorage,
  setPrinterConfig,
} from '../POSTerminal/_legacy/utils/usbPrinter';

const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const sampleReceipt = {
  transactionNumber: 'SAMPLE-001',
  createdAt: new Date().toISOString(),
  orderType: 'retail',
  status: 'completed',
  paymentMethod: 'cash',
  subtotal: 2500,
  totalAmount: 2500,
  cashTendered: 3000,
  changeGiven: 500,
  items: [{ name: 'Boutique sample item · Size M', sku: 'SAMPLE-M', qty: 1, unitPrice: 2500, lineTotal: 2500 }],
};

const BoutiquePrinterSettings = () => {
  const [config, setConfig] = useState(getPrinterConfig);
  const [connectedPrinters, setConnectedPrinters] = useState([]);
  const [working, setWorking] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const support = getUsbSupport();

  const save = (patch) => {
    setPrinterConfig(patch);
    setConfig(getPrinterConfig());
  };

  const refresh = async () => {
    if (!support.supported) return;
    try { setConnectedPrinters(await listPrinters()); }
    catch (error) { toast.error(error?.message || 'Could not find connected USB printers.'); }
  };

  useEffect(() => {
    refresh();
    if (!navigator.usb) return undefined;
    const onUsbChange = () => refresh();
    navigator.usb.addEventListener('connect', onUsbChange);
    navigator.usb.addEventListener('disconnect', onUsbChange);
    return () => {
      navigator.usb.removeEventListener('connect', onUsbChange);
      navigator.usb.removeEventListener('disconnect', onUsbChange);
    };
  }, []);

  const pair = async (compatibilityMode = false) => {
    setWorking('pair');
    try {
      const device = await connectUsbPrinter({ compatibilityMode });
      const existing = config.printers.find((printer) => printer.deviceId === device.id);
      const printers = existing
        ? config.printers.map((printer) => printer.deviceId === device.id ? { ...printer, deviceLabel: device.label } : printer)
        : [...config.printers, { id: device.id, deviceId: device.id, customName: `Receipt printer ${config.printers.length + 1}`, deviceLabel: device.label, categoryIds: [] }];
      save({ printers, counterPrinterId: device.id, counterPrinterLabel: existing?.customName || device.label, receiptPrintMode: 'usb' });
      await refresh();
      toast.success(`${device.label} is paired for receipts.`);
    } catch (error) {
      if (error?.name !== 'NotFoundError') toast.error(error?.message || 'Printer pairing was cancelled.');
    } finally { setWorking(''); }
  };

  const choosePrinter = (deviceId) => {
    const selected = config.printers.find((printer) => printer.deviceId === deviceId);
    save({ counterPrinterId: deviceId, counterPrinterLabel: selected?.customName || '' });
  };

  const renamePrinter = (deviceId, customName) => {
    const printers = config.printers.map((printer) => printer.deviceId === deviceId ? { ...printer, customName } : printer);
    const label = printers.find((printer) => printer.deviceId === deviceId)?.customName || '';
    save({ printers, ...(config.counterPrinterId === deviceId ? { counterPrinterLabel: label } : {}) });
  };

  const removePrinter = async (deviceId) => {
    const printers = config.printers.filter((printer) => printer.deviceId !== deviceId);
    save({
      printers,
      ...(config.counterPrinterId === deviceId ? { counterPrinterId: '', counterPrinterLabel: '', receiptPrintMode: 'system' } : {}),
    });
    await forgetUsbPrinter(deviceId).catch(() => {});
    await refresh();
  };

  const printSample = async () => {
    if (!config.counterPrinterId) return toast.error('Pair and select a receipt printer first.');
    setWorking('print');
    try {
      const logo = await buildLogoEscPos(config.restaurantLogo);
      await printRaw(config.counterPrinterId, buildReceiptEscPos(sampleReceipt, 'Boutique outlet', 'Printer test', logo), { verifyStatus: config.verifyPrinterStatus });
      toast.success('Sample receipt sent directly to the USB printer.');
    } catch (error) { toast.error(error?.message || 'Could not print the sample receipt.'); }
    finally { setWorking(''); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      save({ restaurantLogo: await resizeLogoForStorage(file) });
      toast.success('Boutique logo saved for receipts.');
    } catch (error) { toast.error(error?.message || 'Could not save this image.'); }
    finally { setUploadingLogo(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-4">
      <header><h1 className="text-xl font-extrabold text-gray-900">Receipt printing</h1><p className="mt-1 text-sm text-gray-500">Choose the receipt printer used by the boutique POS. Receipt preview and browser printing work without a USB printer.</p></header>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Usb size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">USB receipt printer</h2></div><button onClick={refresh} disabled={!support.supported || !!working} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"><RefreshCw size={13} className={working === 'pair' ? 'animate-spin' : ''} />Refresh</button></div>
        {!support.supported && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{support.reason} You can still use the browser print dialog.</p>}
        <div className="flex flex-wrap gap-2"><button onClick={() => pair(false)} disabled={!support.supported || !!working} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Usb size={15} />Pair USB printer</button><button onClick={() => pair(true)} disabled={!support.supported || !!working} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50"><Usb size={15} />Pair compatible model</button></div>
        {config.printers.map((printer) => <div key={printer.deviceId} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><input className={inputClass} value={printer.customName} onChange={(event) => renamePrinter(printer.deviceId, event.target.value)} aria-label="Receipt printer name" /><p className="mt-1 truncate text-[11px] text-gray-500">{printer.deviceLabel}</p><p className="mt-1 text-[11px] text-gray-400">{connectedPrinters.some((device) => device.id === printer.deviceId) ? 'Connected to this browser' : 'Paired; reconnect printer to print'}</p></div><FloatingSelect label="Use as receipt printer" options={[{ value: '', label: 'Not selected' }, ...config.printers.map((item) => ({ value: item.deviceId, label: item.customName }))]} value={config.counterPrinterId} onChange={choosePrinter} placeholder="Choose printer" /><button onClick={() => removePrinter(printer.deviceId)} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={14} />Remove</button></div>)}
        {!config.printers.length && <p className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">No USB printers are paired yet.</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><FloatingSelect label="Receipt output" options={[{ value: 'system', label: 'Browser / system print dialog' }, { value: 'usb', label: 'Direct USB printer' }]} value={config.receiptPrintMode} onChange={(value) => save({ receiptPrintMode: value })} searchable={false} /><button onClick={printSample} disabled={!!working || config.receiptPrintMode !== 'usb'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50"><Printer size={15} />{working === 'print' ? 'Printing…' : 'Print sample receipt'}</button></div>
        {config.receiptPrintMode === 'usb' && !config.counterPrinterId && <p className="text-xs font-semibold text-amber-700">Select a paired printer. Until then, the POS uses the browser print dialog.</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div><h2 className="font-bold text-gray-900">Boutique logo</h2><p className="mt-1 text-sm text-gray-500">Optional grayscale logo printed at the top of the customer receipt.</p></div>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadLogo(event.target.files?.[0])} disabled={uploadingLogo} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" />
        {uploadingLogo && <p className="text-xs text-gray-500">Saving logo…</p>}
        {config.restaurantLogo && <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"><img src={config.restaurantLogo} alt="Boutique logo preview" className="max-h-20 max-w-[70%] object-contain" /><button onClick={() => save({ restaurantLogo: '' })} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remove logo</button></div>}
        <p className="flex items-center gap-2 text-xs text-gray-500"><Monitor size={14} />The receipt dialog will also work with the computer's default printer.</p>
      </section>
    </div>
  );
};

export default BoutiquePrinterSettings;
