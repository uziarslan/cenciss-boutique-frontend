import { useEffect } from 'react';
import { ExternalLink, FileCheck2, Percent, ShieldAlert, Store } from 'lucide-react';
import { useGetOutletsQuery } from '../../store/baseApi';
import HeroBanner from '../../components/UI/HeroBanner';
import Card from '../../components/UI/Card';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useQueryState from '../../hooks/useQueryState';

const SetupStatus = ({ children }) => (
  <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
    {children}
  </span>
);

const TaxSettings = () => {
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');

  useEffect(() => {
    if (outlets.length && !selectedOutlet) setSelectedOutlet(outlets[0]._id);
  }, [outlets, selectedOutlet, setSelectedOutlet]);

  const outletName = outlets.find((outlet) => outlet._id === selectedOutlet)?.name || 'this outlet';

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={FileCheck2}
        eyebrow="Retail compliance"
        title="Tax & FBR"
        subtitle="Retail tax setup and federal digital-invoice readiness for the boutique."
        accent="indigo"
        compact
      />

      {outlets.length === 0 ? (
        <Card title="Choose an outlet first" subtitle="Tax and invoice setup is managed separately for each outlet." icon={Store}>
          <p className="text-sm text-gray-500">Create an outlet before reviewing its tax and FBR setup.</p>
        </Card>
      ) : (
        <>
          {outlets.length > 1 && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <Store size={16} className="shrink-0 text-indigo-500" />
            <span className="text-sm font-semibold text-gray-700">Outlet</span>
            <div className="ml-auto w-full sm:w-72"><SearchableSelect options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code || '' }))} value={selectedOutlet} onChange={setSelectedOutlet} searchPlaceholder="Search outlets…" /></div>
          </div>}

          <Card title="Retail sales tax" subtitle={`Tax treatment for finished goods sold at ${outletName}`} icon={Percent}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-gray-900">Product tax rules need confirmation</p><p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-600">The boutique POS currently records retail sales with no calculated sales tax. Clothing tax treatment can depend on registration and product classification, so restaurant cash/card rates have been removed from this screen.</p></div><SetupStatus>Needs tax setup</SetupStatus></div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Registration', 'Confirm the outlet’s applicable sales-tax registration.'],
                  ['Product classification', 'Confirm the HS code and tax treatment for each product group.'],
                  ['Price display', 'Decide whether Shopify prices include or exclude tax.'],
                ].map(([title, description]) => <div key={title} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5"><p className="text-sm font-semibold text-gray-800">{title}</p><p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p></div>)}
              </div>
            </div>
          </Card>

          <Card title="FBR digital invoicing" subtitle={`Federal invoice reporting readiness for ${outletName}`} icon={FileCheck2} iconAccent="emerald" action={<SetupStatus>Not connected</SetupStatus>}>
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700" /><p>This boutique build does not currently submit invoices to FBR. Before connecting, confirm whether this business is required to integrate and arrange a supported integration with an FBR-licensed provider.</p></div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">Setup will require the correct seller registration, product classifications, invoice rules, and integration credentials.</p>
                <a href="https://www.fbr.gov.pk/faqs/173967/173969" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">FBR digital invoicing guidance <ExternalLink size={14} /></a>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default TaxSettings;
