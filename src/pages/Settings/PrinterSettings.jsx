import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  Info,
  Link2,
  Monitor,
  Plus,
  Plug,
  Printer,
  RefreshCw,
  TestTube,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { getCategories } from '../../api/menuApi';
import { getOutlets } from '../../api/outletApi';
import {
  listRestaurantDevices,
  updatePrintStationConfig,
} from '../../api/restaurantDeviceApi';
import {
  ALL_CATEGORIES,
  buildKitchenEscPos,
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
import {
  configureCloudPrintStation,
  disconnectCloudPrintStation,
  getConnectorHealth,
  getCloudPrintStationStatus,
  getWindowsPrinters,
  normalizeConnectorKey,
  sendWindowsPrintJob,
} from '../POSTerminal/_legacy/utils/windowsPrintConnector';

const sampleTransaction = {
  transactionNumber: 'USB-TEST-001', createdAt: new Date().toISOString(), orderType: 'dine-in', tableNumber: '5',
  customer: { name: 'Printer Test' },
  items: [{ name: 'Chicken Burger', qty: 2, unitPrice: 450, lineTotal: 900 }, { name: 'Fries', qty: 1, unitPrice: 200, lineTotal: 200 }],
  subtotal: 1100, taxAmount: 176, totalAmount: 1276, paymentMethod: 'cash', cashTendered: 1300,
};

const sampleOrder = {
  transactionNumber: 'USB-KOT-TEST', orderType: 'dine-in', tableNumber: '5',
  items: [{ name: 'Chicken Burger', qty: 2, notes: 'No mayo' }, { name: 'Fries', qty: 1 }],
  notes: 'USB printer test',
};

const PrinterSettings = () => {
  const [cfg, setCfg] = useState(getPrinterConfig);
  const [devices, setDevices] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [testing, setTesting] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [windowsPrinters, setWindowsPrinters] = useState([]);
  const [selectedWindowsPrinter, setSelectedWindowsPrinter] = useState('');
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [connectorOnline, setConnectorOnline] = useState(false);
  const [printStations, setPrintStations] = useState([]);
  const [stationToken, setStationToken] = useState('');
  const [cloudApiBase, setCloudApiBase] = useState(
    String(process.env.REACT_APP_API_URL || window.location.origin).replace(/\/+$/, ''),
  );
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(null);
  const fileRef = useRef(null);
  const support = useMemo(getUsbSupport, []);

  const persist = useCallback((patch) => {
    setCfg((current) => {
      const next = { ...current, ...patch };
      setPrinterConfig(next);
      return next;
    });
  }, []);

  const refreshDevices = useCallback(async ({ quiet = false } = {}) => {
    if (!support.supported) return setLoadingDevices(false);
    if (!quiet) setLoadingDevices(true);
    try {
      setDevices(await listPrinters());
    } catch (error) {
      if (!quiet) toast.error(error?.message || 'Could not read USB printers.');
    } finally {
      setLoadingDevices(false);
    }
  }, [support.supported]);

  useEffect(() => {
    refreshDevices({ quiet: true });
    if (!navigator.usb) return undefined;
    const update = () => refreshDevices({ quiet: true });
    navigator.usb.addEventListener('connect', update);
    navigator.usb.addEventListener('disconnect', update);
    return () => {
      navigator.usb.removeEventListener('connect', update);
      navigator.usb.removeEventListener('disconnect', update);
    };
  }, [refreshDevices]);

  useEffect(() => {
    getOutlets({ limit: 100 }).then((response) => {
      const loaded = response.data?.data?.outlets ?? response.data?.data ?? [];
      setOutlets(loaded);
      if (!cfg.routingOutletId && loaded.length) persist({ routingOutletId: loaded[0]._id });
    }).catch(() => toast.error('Could not load outlets for printer routing.'));
  }, [cfg.routingOutletId, persist]);

  useEffect(() => {
    if (!cfg.routingOutletId) return;
    setLoadingCategories(true);
    getCategories({ outlet: cfg.routingOutletId })
      .then((response) => setCategories(response.data?.data?.categories ?? response.data?.data ?? []))
      .catch(() => toast.error('Could not load menu categories.'))
      .finally(() => setLoadingCategories(false));
  }, [cfg.routingOutletId]);

  useEffect(() => {
    listRestaurantDevices()
      .then(({ data }) => {
        const stations = (data.devices || []).filter((device) => (
          device.type === 'printStation' && !device.revokedAt
        ));
        setPrintStations(stations);
        if (!cfg.cloudPrintStationId && stations.length === 1) {
          persist({ cloudPrintStationId: stations[0].id });
        }
      })
      .catch(() => setPrintStations([]));
  }, [cfg.cloudPrintStationId, persist]);

  const onlineIds = useMemo(() => new Set(devices.map((device) => device.id)), [devices]);

  const updatePrinter = (printerId, patch) => {
    persist({ printers: cfg.printers.map((printer) => printer.id === printerId ? { ...printer, ...patch } : printer) });
  };

  const pairPrinter = async (compatibilityMode = false) => {
    setPairing(true);
    try {
      const device = await connectUsbPrinter({ compatibilityMode });
      const existing = cfg.printers.find((printer) => printer.deviceId === device.id);
      if (existing) {
        updatePrinter(existing.id, { deviceLabel: device.label });
        toast.success(`${existing.customName} reconnected.`);
      } else {
        const entry = {
          id: device.id,
          deviceId: device.id,
          customName: `Printer ${cfg.printers.length + 1}`,
          deviceLabel: device.label,
          categoryIds: [],
        };
        persist({ enabled: true, printers: [...cfg.printers, entry] });
        toast.success(`${entry.customName} added. Assign its categories below.`);
      }
      await refreshDevices({ quiet: true });
    } catch (error) {
      if (error?.name !== 'NotFoundError') toast.error(error?.message || 'Printer pairing was cancelled.');
    } finally {
      setPairing(false);
    }
  };

  const removePrinter = async (printer) => {
    const remaining = cfg.printers.filter((item) => item.id !== printer.id);
    persist({
      printers: remaining,
      counterPrinterId: cfg.counterPrinterId === printer.deviceId ? '' : cfg.counterPrinterId,
      counterPrinterLabel: cfg.counterPrinterId === printer.deviceId ? '' : cfg.counterPrinterLabel,
      kitchenPrinterId: cfg.kitchenPrinterId === printer.deviceId ? '' : cfg.kitchenPrinterId,
    });
    await forgetUsbPrinter(printer.deviceId).catch(() => {});
    refreshDevices({ quiet: true });
  };

  const assignReceiptPrinter = (deviceId) => {
    const printer = cfg.printers.find((item) => item.deviceId === deviceId);
    persist({
      counterPrinterId: deviceId,
      counterPrinterLabel: printer?.customName || '',
      // A counter printer must never receive kitchen tickets. Removing its
      // category routes also makes the distinction clear when roles change.
      printers: cfg.printers.map((item) => (
        item.deviceId === deviceId ? { ...item, categoryIds: [] } : item
      )),
    });
  };

  const setPrintMode = (key, mode) => {
    const otherKey = key === 'kitchenPrintMode' ? 'receiptPrintMode' : 'kitchenPrintMode';
    persist({
      [key]: mode,
      // Retain the legacy flag for older POS bundles during rolling deploys.
      enabled: mode === 'usb' || cfg[otherKey] === 'usb',
    });
  };

  const toggleCategory = (printer, categoryId) => {
    let next;
    if (categoryId === ALL_CATEGORIES) {
      next = printer.categoryIds.includes(ALL_CATEGORIES) ? [] : [ALL_CATEGORIES];
    } else {
      const withoutAll = printer.categoryIds.filter((id) => id !== ALL_CATEGORIES);
      next = withoutAll.includes(categoryId)
        ? withoutAll.filter((id) => id !== categoryId)
        : [...withoutAll, categoryId];
    }
    updatePrinter(printer.id, { categoryIds: next });
  };

  const toggleSystemCategory = (categoryId) => {
    const current = cfg.systemKitchenCategoryIds || [ALL_CATEGORIES];
    let next;
    if (categoryId === ALL_CATEGORIES) {
      next = current.includes(ALL_CATEGORIES) ? [] : [ALL_CATEGORIES];
    } else {
      const withoutAll = current.filter((id) => id !== ALL_CATEGORIES);
      next = withoutAll.includes(categoryId)
        ? withoutAll.filter((id) => id !== categoryId)
        : [...withoutAll, categoryId];
    }
    persist({ systemKitchenCategoryIds: next });
  };

  const connectWindows = async () => {
    const connectorKey = normalizeConnectorKey(cfg.connectorKey);
    if (!connectorKey) return toast.error('Paste the connector key first.');
    if (connectorKey !== cfg.connectorKey) persist({ connectorKey });
    setConnectorBusy(true);
    try {
      const health = await getConnectorHealth();
      const installed = await getWindowsPrinters(connectorKey);
      setWindowsPrinters(installed);
      setConnectorOnline(true);
      let nextCloudStatus = health.cloud || null;
      if (!nextCloudStatus) {
        nextCloudStatus = await getCloudPrintStationStatus(connectorKey)
          .then((result) => result.cloud)
          .catch(() => null);
      }
      setCloudStatus(nextCloudStatus);
      if (!selectedWindowsPrinter && installed.length) setSelectedWindowsPrinter(installed[0].name);
      toast.success(`${installed.length} Windows printer${installed.length === 1 ? '' : 's'} found.`);
    } catch (error) {
      setConnectorOnline(false);
      toast.error(error?.message || 'Could not connect to Cenciss Print Connector.');
    } finally {
      setConnectorBusy(false);
    }
  };

  const linkCloudStation = async () => {
    const connectorKey = normalizeConnectorKey(cfg.connectorKey);
    if (!connectorKey) return toast.error('Connect to the Windows Print Connector first.');
    if (!connectorOnline) {
      return toast.error('Click “Connect & discover” above before linking this reception PC.');
    }
    if (!cfg.cloudPrintStationId) return toast.error('Select the reception print station.');
    if (!stationToken.trim()) return toast.error('Paste the print station token.');
    if (!cloudApiBase.trim()) return toast.error('Enter the Cenciss API URL.');
    setCloudBusy(true);
    try {
      const result = await configureCloudPrintStation(connectorKey, {
        apiBase: cloudApiBase.trim(),
        stationToken: stationToken.trim(),
      });
      if (String(result.station?.id) !== String(cfg.cloudPrintStationId)) {
        await disconnectCloudPrintStation(connectorKey).catch(() => {});
        throw new Error('That token belongs to a different print station than the one selected.');
      }
      setCloudStatus(result.cloud);
      setStationToken('');
      toast.success(`Reception linked as ${result.station?.label || 'Print Station'}.`);
    } catch (error) {
      toast.error(error?.message || 'Could not link the reception print station.');
    } finally {
      setCloudBusy(false);
    }
  };

  const disconnectCloudStation = async () => {
    setCloudBusy(true);
    try {
      const result = await disconnectCloudPrintStation(cfg.connectorKey);
      setCloudStatus(result.cloud);
      toast.success('Reception print station disconnected.');
    } catch (error) {
      toast.error(error?.message || 'Could not disconnect the print station.');
    } finally {
      setCloudBusy(false);
    }
  };

  const saveCloudRouting = async () => {
    if (!cfg.cloudPrintStationId) return toast.error('Select a reception print station.');
    const printers = (cfg.windowsPrinters || [])
      .filter((printer) => (
        printer.printerName
        && (printer.role === 'dispatch' || (printer.categoryIds || []).length)
      ))
      .map((printer) => ({
        printerName: printer.printerName,
        displayName: printer.customName || printer.printerName,
        role: printer.role || 'kitchen',
        categoryIds: (printer.categoryIds || []).filter((id) => id !== ALL_CATEGORIES),
        allCategories: (printer.categoryIds || []).includes(ALL_CATEGORIES),
        copies: 1,
        enabled: true,
      }));
    if (!printers.length) return toast.error('Add a Windows printer and assign its kitchen categories first.');
    setCloudBusy(true);
    try {
      await updatePrintStationConfig(cfg.cloudPrintStationId, printers);
      toast.success('Tablet-order printer routing saved.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save tablet-order printer routing.');
    } finally {
      setCloudBusy(false);
    }
  };

  const addWindowsPrinter = () => {
    if (!selectedWindowsPrinter) return;
    const selectedKey = selectedWindowsPrinter.trim().toLocaleLowerCase();
    if ((cfg.windowsPrinters || []).some((printer) => (
      String(printer.printerName || '').trim().toLocaleLowerCase() === selectedKey
    ))) {
      return toast.error('That Windows printer is already added.');
    }
    const entry = {
      id: `windows:${selectedWindowsPrinter}`,
      printerName: selectedWindowsPrinter,
      customName: selectedWindowsPrinter,
      role: 'kitchen',
      categoryIds: [],
    };
    persist({ windowsPrinters: [...(cfg.windowsPrinters || []), entry] });
    toast.success(`${selectedWindowsPrinter} added to Cenciss.`);
  };

  const updateWindowsPrinter = (id, patch) => persist({
    windowsPrinters: (cfg.windowsPrinters || []).map((printer) => (
      printer.id === id ? { ...printer, ...patch } : printer
    )),
  });

  const toggleWindowsCategory = (printer, categoryId) => {
    const current = printer.categoryIds || [];
    let next;
    if (categoryId === ALL_CATEGORIES) next = current.includes(ALL_CATEGORIES) ? [] : [ALL_CATEGORIES];
    else {
      const withoutAll = current.filter((id) => id !== ALL_CATEGORIES);
      next = withoutAll.includes(categoryId)
        ? withoutAll.filter((id) => id !== categoryId)
        : [...withoutAll, categoryId];
    }
    updateWindowsPrinter(printer.id, { categoryIds: next });
  };

  const testWindowsPrinter = async (printer) => {
    setTesting(`windows:${printer.id}`);
    try {
      await sendWindowsPrintJob(cfg.connectorKey, {
        printerName: printer.printerName,
        jobName: `Cenciss Test - ${printer.customName}`,
        text: `CENCISS PRINTER TEST\r\n==========================================\r\nPrinter: ${printer.customName}\r\nWindows: ${printer.printerName}\r\nRole: ${printer.role}\r\n==========================================`,
      });
      toast.success(`Test sent to ${printer.customName}.`);
    } catch (error) {
      toast.error(error?.message || 'Windows test print failed.');
    } finally {
      setTesting('');
    }
  };

  const testPrinter = async (printer, type) => {
    setTesting(`${printer.id}:${type}`);
    try {
      const logo = type === 'receipt' ? await buildLogoEscPos(cfg.restaurantLogo) : '';
      const data = type === 'receipt'
        ? buildReceiptEscPos(sampleTransaction, 'Cenciss Restaurant', 'Owner', logo)
        : buildKitchenEscPos({ ...sampleOrder, printerName: printer.customName }, 'Cenciss Restaurant');
      await printRaw(printer.deviceId, data, { verifyStatus: cfg.verifyPrinterStatus });
      toast.success(`${type === 'receipt' ? 'Customer copy' : 'KOT'} sent to ${printer.customName}.`);
    } catch (error) {
      toast.error(error?.message || 'Test print failed.');
    } finally {
      setTesting('');
    }
  };

  const handleLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      persist({ restaurantLogo: await resizeLogoForStorage(file) });
      toast.success('Restaurant logo saved for customer receipts.');
    } catch (error) {
      toast.error(error?.message || 'Could not save the logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Printer size={22} /></div>
            <div><h2 className="text-lg font-bold text-gray-900">Thermal printers</h2><p className="text-sm text-gray-500">Add printers, name them, and route menu categories. Every change saves automatically.</p></div>
          </div>
          <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', support.supported ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100')}>
            {support.supported ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}{support.supported ? 'Direct USB available' : 'Browser unsupported'}
          </span>
        </div>
        {!support.supported && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex gap-2"><AlertTriangle size={17} />{support.reason}</div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div><h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Connected printers</h3><p className="text-xs text-gray-500 mt-1">Add as many kitchen or counter printers as this terminal needs.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => refreshDevices()} disabled={loadingDevices} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-700 text-xs font-semibold disabled:opacity-50"><RefreshCw size={13} className={clsx(loadingDevices && 'animate-spin')} />Refresh</button>
            <button type="button" onClick={() => pairPrinter(false)} disabled={!support.supported || pairing} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">{pairing ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}Add printer</button>
          </div>
        </div>

        {!cfg.printers.length && <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center"><Printer className="mx-auto text-gray-300" /><p className="mt-2 text-sm font-semibold text-gray-700">No printers added</p><p className="text-xs text-gray-500">Connect the cashier or kitchen printer to begin.</p></div>}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {cfg.printers.map((printer) => {
            const online = onlineIds.has(printer.deviceId);
            const all = printer.categoryIds.includes(ALL_CATEGORIES);
            const isCounterPrinter = cfg.counterPrinterId === printer.deviceId;
            return (
              <div key={printer.id} className="rounded-2xl border border-gray-200 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Printer size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <input value={printer.customName} onChange={(event) => updatePrinter(printer.id, { customName: event.target.value })} aria-label="Custom printer name" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                    <p className="mt-1 text-[11px] text-gray-400 truncate">{printer.deviceLabel}</p>
                  </div>
                  <span className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold', online ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{online ? <CheckCircle2 size={11} /> : <Unplug size={11} />}{online ? 'Connected' : 'Unplugged'}</span>
                </div>

                {!isCounterPrinter ? <div>
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-gray-600">Kitchen categories</p>{loadingCategories && <RefreshCw size={12} className="animate-spin text-gray-400" />}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => toggleCategory(printer, ALL_CATEGORIES)} className={clsx('px-3 py-1.5 rounded-full border text-xs font-semibold', all ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600')}>All Categories</button>
                    {categories.map((category) => {
                      const selected = !all && printer.categoryIds.includes(String(category._id));
                      return <button key={category._id} type="button" disabled={all} onClick={() => toggleCategory(printer, String(category._id))} className={clsx('px-3 py-1.5 rounded-full border text-xs font-semibold disabled:opacity-40', selected ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600')}>{category.name}</button>;
                    })}
                  </div>
                  {!printer.categoryIds.length && <p className="mt-2 text-[11px] text-amber-700">No kitchen categories assigned; this printer will not receive KOTs.</p>}
                </div> : <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Counter / customer-copy printer</p><p className="mt-1 text-[11px] text-emerald-700">Kitchen category routing is disabled for this printer.</p></div>}

                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {!isCounterPrinter && <button type="button" disabled={!online || !!testing} onClick={() => testPrinter(printer, 'kitchen')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold disabled:opacity-50"><TestTube size={13} />Test KOT</button>}
                  <button type="button" disabled={!online || !!testing} onClick={() => testPrinter(printer, 'receipt')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold disabled:opacity-50"><TestTube size={13} />Test customer copy</button>
                  <button type="button" onClick={() => removePrinter(printer)} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold"><Trash2 size={13} />Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div><h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Receipt & routing setup</h3><p className="text-xs text-gray-500 mt-1">The logo prints only on the customer copy. Category assignments control kitchen KOTs.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5"><span className="text-xs font-semibold text-gray-700">Cashier / customer-copy printer</span><select value={cfg.counterPrinterId} onChange={(event) => assignReceiptPrinter(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white"><option value="">Select printer…</option>{cfg.printers.map((printer) => <option key={printer.id} value={printer.deviceId}>{printer.customName}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-semibold text-gray-700">Outlet categories</span><select value={cfg.routingOutletId} onChange={(event) => persist({ routingOutletId: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white"><option value="">Select outlet…</option>{outlets.map((outlet) => <option key={outlet._id} value={outlet._id}>{outlet.name}</option>)}</select></label>
          <div className="space-y-1.5"><span className="text-xs font-semibold text-gray-700">Restaurant logo</span><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogo} className="hidden" /><div className="flex gap-2"><button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingLogo} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700"><ImageIcon size={14} />{cfg.restaurantLogo ? 'Replace logo' : 'Upload logo'}</button>{cfg.restaurantLogo && <button type="button" onClick={() => persist({ restaurantLogo: '' })} className="rounded-lg border border-rose-100 px-3 text-rose-600"><X size={14} /></button>}</div></div>
        </div>
        {cfg.restaurantLogo && <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-[11px] font-semibold text-gray-500 mb-2">CUSTOMER COPY PREVIEW</p><img src={cfg.restaurantLogo} alt="Restaurant logo preview" className="max-h-28 max-w-full mx-auto object-contain grayscale" /></div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div><h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Printing method</h3><p className="text-xs text-gray-500 mt-1">Choose how this POS terminal prints each document.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            ['kitchenPrintMode', 'Kitchen tickets', 'Choose the installed wireless/network printer from the computer dialog, or send directly to a paired USB printer.'],
            ['receiptPrintMode', 'Customer receipts', 'Use the computer printer dialog or the selected direct USB cashier printer.'],
          ].map(([key, title, detail]) => (
            <label key={key} className="rounded-xl border border-gray-200 p-4 space-y-2">
              <span className="block text-sm font-semibold text-gray-800">{title}</span>
              <select value={cfg[key]} onChange={(event) => setPrintMode(key, event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white">
                <option value="system">Default system print dialog</option>
                {key === 'kitchenPrintMode' && <option value="windows">Cenciss Windows Print Connector</option>}
                <option value="usb">Direct USB printer</option>
              </select>
              <span className="block text-xs leading-relaxed text-gray-500">{detail}</span>
              {cfg[key] === 'usb' && key === 'kitchenPrintMode' && !cfg.printers.some((printer) => printer.categoryIds?.length) && <span className="block text-xs font-medium text-amber-700">No kitchen USB route is configured. The POS will fall back to the system print dialog.</span>}
              {cfg[key] === 'usb' && key === 'receiptPrintMode' && !cfg.counterPrinterId && <span className="block text-xs font-medium text-amber-700">No cashier USB printer is selected. The POS will fall back to the system print dialog.</span>}
              {key === 'kitchenPrintMode' && cfg[key] === 'system' && (
                <span className="block pt-3 mt-3 border-t border-gray-100">
                  <span className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-gray-600">Kitchen categories</span>{loadingCategories && <RefreshCw size={12} className="animate-spin text-gray-400" />}</span>
                  <span className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => toggleSystemCategory(ALL_CATEGORIES)} className={clsx('px-3 py-1.5 rounded-full border text-xs font-semibold', (cfg.systemKitchenCategoryIds || [ALL_CATEGORIES]).includes(ALL_CATEGORIES) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600')}>All Categories</button>
                    {categories.map((category) => {
                      const selectedIds = cfg.systemKitchenCategoryIds || [ALL_CATEGORIES];
                      const allSelected = selectedIds.includes(ALL_CATEGORIES);
                      const selected = !allSelected && selectedIds.includes(String(category._id));
                      return <button key={category._id} type="button" disabled={allSelected} onClick={() => toggleSystemCategory(String(category._id))} className={clsx('px-3 py-1.5 rounded-full border text-xs font-semibold disabled:opacity-40', selected ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600')}>{category.name}</button>;
                    })}
                  </span>
                  <span className="block mt-2 text-[11px] text-gray-500">Only selected-category items will be included before the system printer chooser opens.</span>
                </span>
              )}
            </label>
          ))}
        </div>
      </section>

      {cfg.kitchenPrintMode === 'windows' && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div><h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Windows Print Connector</h3><p className="text-xs text-gray-500 mt-1">Discover printers installed in Windows and assign station categories.</p></div>
            <div className="flex items-center gap-2">
              <a href="/downloads/Cenciss-Print-Connector-Setup-1.4.3.exe" download="Cenciss-Print-Connector-Setup-1.4.3.exe" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"><Download size={12} />Connector 1.4.3</a>
              <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', connectorOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}><Monitor size={12} />{connectorOnline ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-700">Connector key</span>
              <input
                type="password"
                value={cfg.connectorKey || ''}
                onChange={(event) => persist({ connectorKey: event.target.value })}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text');
                  const normalized = normalizeConnectorKey(pasted);
                  if (normalized !== pasted) {
                    event.preventDefault();
                    persist({ connectorKey: normalized });
                  }
                }}
                onBlur={() => {
                  const normalized = normalizeConnectorKey(cfg.connectorKey);
                  if (normalized !== cfg.connectorKey) persist({ connectorKey: normalized });
                }}
                placeholder="Paste the key or the entire key file"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
              />
            </label>
            <button type="button" onClick={connectWindows} disabled={connectorBusy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{connectorBusy ? <RefreshCw size={14} className="animate-spin" /> : <Monitor size={14} />}Connect & discover</button>
          </div>

          {connectorOnline && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end rounded-xl bg-gray-50 border border-gray-100 p-4">
              <label className="space-y-1.5"><span className="text-xs font-semibold text-gray-700">Installed Windows printer</span><select value={selectedWindowsPrinter} onChange={(event) => setSelectedWindowsPrinter(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white"><option value="">Select printer…</option>{windowsPrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.name}</option>)}</select></label>
              <button type="button" onClick={addWindowsPrinter} disabled={!selectedWindowsPrinter} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><Plus size={14} />Add printer</button>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(cfg.windowsPrinters || []).map((printer) => {
              const all = (printer.categoryIds || []).includes(ALL_CATEGORIES);
              return <div key={printer.id} className="rounded-2xl border border-gray-200 p-4 space-y-4">
                <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Monitor size={18} /></div><div className="flex-1 min-w-0"><input value={printer.customName} onChange={(event) => updateWindowsPrinter(printer.id, { customName: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold" /><p className="mt-1 text-[11px] text-gray-400 truncate">Windows printer: {printer.printerName}</p></div><button type="button" onClick={() => persist({ windowsPrinters: cfg.windowsPrinters.filter((item) => item.id !== printer.id) })} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={15} /></button></div>
                <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-gray-600">Printer role</span><select value={printer.role} onChange={(event) => updateWindowsPrinter(printer.id, { role: event.target.value, categoryIds: event.target.value === 'dispatch' ? [ALL_CATEGORIES] : [] })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white"><option value="kitchen">Kitchen station — selected categories</option><option value="dispatch">Dispatch — complete order</option></select></label>
                {printer.role === 'dispatch' ? <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800"><strong>Complete KOT:</strong> this printer receives every order item.</div> : <div><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-gray-600">Kitchen categories</p>{loadingCategories && <RefreshCw size={12} className="animate-spin" />}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => toggleWindowsCategory(printer, ALL_CATEGORIES)} className={clsx('px-3 py-1.5 rounded-full border text-xs font-semibold', all ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600')}>All Categories</button>{categories.map((category) => { const selected = !all && (printer.categoryIds || []).includes(String(category._id)); return <button key={category._id} type="button" disabled={all} onClick={() => toggleWindowsCategory(printer, String(category._id))} className={clsx('px-3 py-1.5 rounded-full border text-xs font-semibold disabled:opacity-40', selected ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600')}>{category.name}</button>; })}</div>{!(printer.categoryIds || []).length && <p className="mt-2 text-[11px] text-amber-700">Select at least one category for this station.</p>}</div>}
                <button type="button" disabled={!!testing || !cfg.connectorKey} onClick={() => testWindowsPrinter(printer)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-800 text-xs font-semibold disabled:opacity-50"><TestTube size={13} />Test print</button>
              </div>;
            })}
          </div>

          <div className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-indigo-950"><Link2 size={16} />Reception printing for order tablets</h4>
                <p className="mt-1 text-xs leading-relaxed text-indigo-700">
                  Link this PC once. Tablet orders are then queued by Cenciss and printed through the Windows printers configured above.
                </p>
              </div>
              <span className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
                cloudStatus?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-indigo-700',
              )}>
                <span className={clsx('h-2 w-2 rounded-full', cloudStatus?.configured ? 'bg-emerald-500' : 'bg-slate-300')} />
                {cloudStatus?.configured ? 'Tablet printing linked' : 'Not linked'}
              </span>
            </div>

            {printStations.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Create a <strong>Reception print station</strong> in <a className="font-bold underline" href="/settings/restaurant-devices">Order & Print Devices</a>, then return here with its one-time token.
              </div>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-gray-700">Reception print station</span>
                    <select
                      value={cfg.cloudPrintStationId || ''}
                      onChange={(event) => persist({ cloudPrintStationId: event.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Select print station…</option>
                      {printStations.map((station) => (
                        <option key={station.id} value={station.id}>{station.label || 'Reception PC'} · {station.outletName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-gray-700">Cenciss API URL</span>
                    <input value={cloudApiBase} onChange={(event) => setCloudApiBase(event.target.value)} placeholder="https://your-cenciss-domain.com" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm" />
                  </label>
                </div>

                {!cloudStatus?.configured && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-gray-700">One-time print station token</span>
                    <input type="password" value={stationToken} onChange={(event) => setStationToken(event.target.value)} placeholder="Paste the token from Order & Print Devices" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm" />
                  </label>
                )}

                {!connectorOnline && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <strong>One step is still required:</strong> enter the local Connector Key above and click <strong>Connect &amp; discover</strong>. Saving routing alone does not link this PC.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {!cloudStatus?.configured ? (
                    <button type="button" onClick={linkCloudStation} disabled={cloudBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                      {cloudBusy ? <RefreshCw size={13} className="animate-spin" /> : <Link2 size={13} />} Link reception to tablet orders
                    </button>
                  ) : (
                    <button type="button" onClick={disconnectCloudStation} disabled={cloudBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50">
                      Disconnect station
                    </button>
                  )}
                  <button type="button" onClick={saveCloudRouting} disabled={cloudBusy || !(cfg.windowsPrinters || []).length} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                    {cloudBusy ? <RefreshCw size={13} className="animate-spin" /> : <Printer size={13} />} Save tablet-order routing
                  </button>
                </div>

                {cloudStatus?.lastError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    Connector error: {cloudStatus.lastError}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Automatic printing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['autoPrintKitchen', 'Print KOT when sent to kitchen', 'Uses the category routes assigned above.'],
            ['autoPrintReceipt', 'Print customer copy after payment', 'Uses the selected cashier printer and optional logo.'],
          ].map(([key, title, detail]) => (
            <label key={key} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 cursor-pointer">
              <input type="checkbox" checked={cfg[key]} onChange={(event) => persist({ [key]: event.target.checked })} className="mt-0.5 h-4 w-4 rounded" />
              <span><strong className="block text-sm text-gray-800">{title}</strong><span className="block text-xs text-gray-500 mt-0.5">{detail}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="w-full flex items-center justify-between p-5 text-left"><div><p className="text-sm font-semibold text-gray-800">Compatibility & confirmation</p><p className="text-xs text-gray-500">Status checks and unusual clone printers.</p></div>{showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
        {showAdvanced && <div className="border-t border-gray-100 p-5 space-y-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={cfg.verifyPrinterStatus} onChange={(event) => persist({ verifyPrinterStatus: event.target.checked })} className="mt-0.5 h-4 w-4 rounded" /><span><strong>Check paper/error status</strong><span className="block text-xs text-gray-500">Unsupported printers still use complete USB-byte confirmation.</span></span></label><div className="rounded-xl border border-amber-100 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Printer missing from the normal chooser?</p><p className="text-xs text-amber-800 mt-1">Some older clones identify as vendor-specific USB devices.</p><button type="button" onClick={() => pairPrinter(true)} disabled={!support.supported || pairing} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-900 text-xs font-semibold"><Plug size={13} />Add unusual USB printer</button></div><div className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800 flex gap-2"><Info size={14} className="shrink-0" />All settings on this page save immediately on this POS terminal.</div></div>}
      </section>
    </div>
  );
};

export default PrinterSettings;
