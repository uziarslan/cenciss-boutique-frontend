import { Link } from 'react-router';
import {
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Boxes,
  Receipt,
  Users,
  ClipboardCheck,
  LogIn,
  ScanFace,
  Wallet,
  Building2,
  CheckCircle2,
  Clock,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShoppingCart,
  CreditCard,
  Banknote,
  Calculator,
  Zap,
  PlayCircle,
  ChevronDown,
  MapPin,
  ShoppingBag,
  Factory,
} from 'lucide-react';
import logo from '../../assets/logo.png';

// ─────────────────────────────────────────────────────────────────────────────
// Atom helpers
// ─────────────────────────────────────────────────────────────────────────────

const Pill = ({ children, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-white/5 text-surface-200 border-white/10',
    emerald: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/20',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-400/20',
    rose: 'bg-rose-500/10 text-rose-200 border-rose-400/20',
    indigo: 'bg-indigo-500/10 text-indigo-200 border-indigo-400/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${tones[tone]}`}>
      {children}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock product UIs — these are pure CSS approximations of the real screens
// in the management app. They give the marketing page real-looking visuals
// without screenshots.
// ─────────────────────────────────────────────────────────────────────────────

const PurchaseOrderMock = () => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-[0_30px_60px_-25px_rgba(15,23,42,0.7)]">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Purchase</p>
        <p className="mt-0.5 font-mono text-sm font-bold text-white">PUR-20260427-0042</p>
      </div>
      <Pill tone="emerald"><CheckCircle2 size={9} /> Approved</Pill>
    </div>
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/20 text-brand-200">
        <Building2 size={15} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white">Metro Cash &amp; Carry</p>
        <p className="text-[11px] text-surface-400">Net 30 · 7 line items</p>
      </div>
    </div>
    <div className="mt-3 space-y-1.5 text-xs">
      <div className="flex items-center justify-between text-surface-300">
        <span className="truncate">Beef mince — 25 kg</span>
        <span className="tabular-nums text-white">PKR 31,250</span>
      </div>
      <div className="flex items-center justify-between text-surface-300">
        <span className="truncate">Brioche buns — 200 ea</span>
        <span className="tabular-nums text-white">PKR 9,000</span>
      </div>
      <div className="flex items-center justify-between text-surface-300">
        <span className="truncate">Cheddar slices — 8 kg</span>
        <span className="tabular-nums text-white">PKR 14,400</span>
      </div>
      <div className="flex items-center justify-between text-surface-500 italic">
        <span>+ 4 more lines</span>
        <span>—</span>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 pt-2 text-sm font-bold">
        <span className="text-white">Total</span>
        <span className="tabular-nums text-emerald-300">PKR 87,420</span>
      </div>
    </div>
  </div>
);

const InventoryMock = () => {
  const items = [
    { name: 'Beef mince', stock: 12, par: 30, tone: 'rose' },
    { name: 'Brioche buns', stock: 142, par: 200, tone: 'amber' },
    { name: 'Cheddar slices', stock: 6, par: 8, tone: 'emerald' },
    { name: 'Tomato sauce', stock: 4, par: 12, tone: 'rose' },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-[0_30px_60px_-25px_rgba(15,23,42,0.7)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Live Stock</p>
          <p className="mt-0.5 text-sm font-bold text-white">Branch 02 · 4 items below par</p>
        </div>
        <Pill tone="amber"><AlertTriangle size={9} /> Reorder</Pill>
      </div>
      <div className="mt-4 space-y-2.5">
        {items.map((it) => {
          const pct = Math.min(100, Math.round((it.stock / it.par) * 100));
          const bar = it.tone === 'rose' ? 'bg-rose-400' : it.tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400';
          return (
            <div key={it.name}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white font-medium">{it.name}</span>
                <span className="tabular-nums text-surface-300">
                  {it.stock} / {it.par}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InvoiceMock = () => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-[0_30px_60px_-25px_rgba(15,23,42,0.7)]">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Aging Report</p>
      <Pill tone="indigo">As of today</Pill>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      {[
        { label: '0–30 days', value: 'PKR 184k', tone: 'text-emerald-300' },
        { label: '31–60', value: 'PKR 92k', tone: 'text-amber-300' },
        { label: '61–90', value: 'PKR 31k', tone: 'text-orange-300' },
        { label: '90+', value: 'PKR 14k', tone: 'text-rose-300' },
      ].map((b) => (
        <div key={b.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500">{b.label}</p>
          <p className={`mt-1 text-base font-extrabold tabular-nums ${b.tone}`}>{b.value}</p>
        </div>
      ))}
    </div>
    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
      <span className="text-surface-400">Total outstanding</span>
      <span className="font-bold tabular-nums text-white">PKR 321,400</span>
    </div>
  </div>
);

const POSMock = () => {
  const items = [
    { name: 'Smash Burger', qty: 2, price: 850 },
    { name: 'Truffle Fries', qty: 1, price: 450 },
    { name: 'Cola 330ml', qty: 2, price: 180 },
  ];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-[0_30px_60px_-25px_rgba(15,23,42,0.7)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
            <ShoppingCart size={13} />
          </div>
          <p className="text-sm font-bold text-white">Cart · 5 items</p>
        </div>
        <Pill tone="emerald">Shift open</Pill>
      </div>
      <div className="mt-4 space-y-2 text-xs">
        {items.map((i) => (
          <div key={i.name} className="flex items-center justify-between">
            <span className="text-surface-200">
              <span className="font-mono text-surface-500 mr-1.5">×{i.qty}</span>
              {i.name}
            </span>
            <span className="font-bold tabular-nums text-white">PKR {(i.qty * i.price).toLocaleString()}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-white/10 pt-2">
          <span className="text-surface-400">Subtotal</span>
          <span className="font-bold tabular-nums text-white">PKR {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-white">Total</span>
          <span className="font-extrabold tabular-nums text-emerald-300">PKR {subtotal.toLocaleString()}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-bold text-white">
          <Banknote size={11} className="text-emerald-300" /> Cash
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-700 px-2 py-1.5 text-[11px] font-bold text-white">
          <CreditCard size={11} /> Charge
        </div>
      </div>
    </div>
  );
};

const FaceIdMock = () => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-[0_30px_60px_-25px_rgba(15,23,42,0.7)]">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Face ID Attendance</p>
      <Pill tone="emerald"><span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" /> Live</Pill>
    </div>
    <div className="mt-5 flex items-center justify-center">
      <div className="relative h-44 w-44">
        <div className="absolute inset-0 rounded-full border border-cyan-300/20" />
        <div className="absolute -inset-3 rounded-full border border-cyan-300/10" />
        <div className="absolute inset-2 overflow-hidden rounded-full bg-gradient-to-br from-slate-800 via-slate-900 to-black ring-1 ring-white/10" />
        {/* Sweep arc */}
        <div
          className="absolute inset-0 rounded-full opacity-90"
          style={{
            background: 'conic-gradient(from 0deg, rgba(56,189,248,0) 0deg, rgba(56,189,248,0.55) 60deg, rgba(56,189,248,0) 120deg)',
            mask: 'radial-gradient(circle, transparent 76px, #000 78px, #000 84px, transparent 86px)',
            WebkitMask: 'radial-gradient(circle, transparent 76px, #000 78px, #000 84px, transparent 86px)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <ScanFace size={42} className="text-cyan-300/80" />
        </div>
      </div>
    </div>
    <div className="mt-4 flex items-center justify-center gap-2 text-xs">
      <CheckCircle2 size={13} className="text-emerald-400" />
      <span className="text-surface-200 font-bold">Matched · Sara K. (98% confidence)</span>
    </div>
  </div>
);

const AccountingMock = () => {
  const rows = [
    { l: 'Sales Revenue', v: '+PKR 4,820,300', tone: 'text-emerald-300' },
    { l: 'COGS', v: '−PKR 1,930,000', tone: 'text-rose-300' },
    { l: 'Gross Profit', v: 'PKR 2,890,300', bold: true, tone: 'text-white' },
    { l: 'Operating Expenses', v: '−PKR 920,400', tone: 'text-rose-300' },
    { l: 'Net Profit', v: 'PKR 1,969,900', bold: true, tone: 'text-emerald-300' },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-[0_30px_60px_-25px_rgba(15,23,42,0.7)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Profit &amp; Loss</p>
          <p className="mt-0.5 text-sm font-bold text-white">April 2026 · Branch 02</p>
        </div>
        <Pill tone="indigo"><BarChart3 size={9} /> Auto-posted</Pill>
      </div>
      <div className="mt-4 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.l}
            className={`flex items-center justify-between text-xs ${r.bold ? 'border-t border-white/10 pt-2 font-extrabold text-sm' : 'text-surface-300'}`}
          >
            <span>{r.l}</span>
            <span className={`tabular-nums ${r.tone}`}>{r.v}</span>
          </div>
        ))}
      </div>
      {/* Tiny sparkline */}
      <div className="mt-4 flex h-12 items-end gap-1">
        {[35, 48, 42, 60, 55, 72, 68, 80, 78, 92, 88, 96].map((h, i) => (
          <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-brand-500/40 to-cyan-300/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Reusable section atoms
// ─────────────────────────────────────────────────────────────────────────────

const SectionEyebrow = ({ children }) => (
  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300/90">{children}</span>
);

const FeatureBlock = ({
  eyebrow,
  title,
  description,
  bullets = [],
  mockup,
  reverse = false,
}) => (
  <section className="relative z-10 px-6 py-16 md:px-10 md:py-24">
    <div className="mx-auto max-w-6xl">
      <div className={`grid gap-12 md:grid-cols-2 md:items-center ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h3 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h3>
          <p className="mt-4 text-sm text-surface-300 md:text-base leading-relaxed">{description}</p>
          <ul className="mt-6 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-surface-200">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-500/10 via-cyan-400/5 to-transparent blur-2xl" />
          {mockup}
        </div>
      </div>
    </div>
  </section>
);

const features = [
  { icon: Boxes, title: 'Materials & Purchasing', body: 'Track fabric, trims, purchase costs, vendors, and raw material stock.', accent: 'from-brand-500/30 to-cyan-400/20' },
  { icon: Receipt, title: 'Bills & Payments', body: 'Vendor balances, aging, and payments — reconciled automatically.', accent: 'from-cyan-400/25 to-emerald-400/20' },
  { icon: BarChart3, title: 'Reports & Accounting', body: 'P&L, balance sheet, inventory value, returns, and sales visibility.', accent: 'from-fuchsia-400/25 to-brand-400/20' },
  { icon: Users, title: 'Roles & Permissions', body: 'Owner, finance, purchase, receiving, cashier — granular control.', accent: 'from-emerald-400/25 to-cyan-400/20' },
  { icon: ClipboardCheck, title: 'Attendance & Payroll', body: 'Salaries, advances, allowances, attendance — all handled.', accent: 'from-amber-400/25 to-fuchsia-400/20' },
  { icon: ShieldCheck, title: 'Private & Secure', body: 'Separate business data with role-based access for owners, managers, and cashiers.', accent: 'from-brand-400/25 to-emerald-400/20' },
  { icon: ShoppingBag, title: 'Shopify & POS', body: 'Keep online inventory, paid orders, and in-store sales connected.', accent: 'from-cyan-400/25 to-indigo-400/20' },
  { icon: Factory, title: 'Boutique Manufacturing', body: 'Issue raw materials to production and receive finished variants by size and color.', accent: 'from-amber-400/25 to-fuchsia-400/20' },
];

const HOW_STEPS = [
  { icon: PlayCircle, title: 'Sign up', body: 'Create your account in under a minute. No credit card.' },
  { icon: Building2, title: 'Configure outlet', body: 'Set up your outlet and connect its Shopify inventory location.' },
  { icon: Users, title: 'Invite your team', body: 'Email invites with role-based access. Cashiers get the POS only.' },
  { icon: Zap, title: 'Start operating', body: 'Set up material BOMs, receive stock, and sell at the POS.' },
];

const FAQS = [
  {
    q: 'Do I need a credit card to start?',
    a: 'No. The 14-day trial is fully featured and unlocks every module from day one. Add billing only when you decide to keep it.',
  },
  {
    q: 'Is my business data isolated from other customers?',
    a: "Yes. Your vendors, sales, inventory, and reports live in your business's private data space and are not visible to another customer.",
  },
  {
    q: 'Can I run multiple outlets on one account?',
    a: 'Absolutely. Outlets, employees, attendance terminals, and reports all scope by outlet. The owner sees everything; staff see only their assigned outlet.',
  },
  {
    q: 'How does the Face ID attendance terminal work?',
    a: 'You generate a one-time pairing token from Settings, paste it into the attendance app on a tablet, and it locks to your outlet. Employees enroll their face once; clock-ins after that are passive.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'You keep read-only access to your data. Sign up for a paid plan and everything turns back on instantly — nothing is deleted.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const Landing = () => (
  <main className="relative min-h-screen overflow-hidden bg-surface-950 text-white">
    {/* Ambient gradient backdrop */}
    <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_-10%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(120%_80%_at_120%_110%,rgba(20,184,166,0.28),transparent_55%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]" />
    <div className="pointer-events-none absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-40 -right-20 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />

    {/* Subtle grid texture */}
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.06]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
      }}
    />

    {/* ── Header ─────────────────────────────────────────────────────────── */}
    <header className="relative z-20 sticky top-0 backdrop-blur-md flex items-center justify-between px-6 py-5 md:px-10 md:py-6 border-b border-white/[0.04] bg-surface-950/70">
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-glow ring-1 ring-white/10 overflow-hidden">
          <img src={logo} alt="Cenciss" className="h-8 w-8 object-contain" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Cenciss</p>
          <p className="text-[11px] text-surface-400">Boutique operations</p>
        </div>
      </div>
      <nav className="flex items-center gap-2 md:gap-3">
        <a
          href="#features"
          className="hidden md:inline-flex items-center text-xs font-semibold text-surface-300 hover:text-white transition px-3"
        >
          Features
        </a>
        <a
          href="#how-it-works"
          className="hidden md:inline-flex items-center text-xs font-semibold text-surface-300 hover:text-white transition px-3"
        >
          How it works
        </a>
        <a
          href="#faq"
          className="hidden md:inline-flex items-center text-xs font-semibold text-surface-300 hover:text-white transition px-3"
        >
          FAQ
        </a>
        <Link
          to="/login"
          className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-surface-200 backdrop-blur-md hover:bg-white/10 transition"
        >
          <LogIn size={13} />
          Log in
        </Link>
        <Link
          to="/signup"
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-glow transition"
        >
          Start free trial
          <ArrowRight size={13} />
        </Link>
      </nav>
    </header>

    {/* ── Hero ───────────────────────────────────────────────────────────── */}
    <section className="relative z-10 px-6 pt-12 pb-6 md:px-10 md:pt-20">
      <div className="mx-auto max-w-5xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-200 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Now in beta
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl">
          The complete back-office
          <span className="block bg-gradient-to-r from-brand-300 via-cyan-200 to-emerald-200 bg-clip-text text-transparent">
            for your boutique.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm text-surface-300 md:text-base">
          Shopify stock and online sales, boutique POS, raw material purchasing,
          manufacturing, accounting, and team operations — connected in one
          system, with room to add outlets.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/signup"
            className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-[0_30px_60px_-20px_rgba(79,70,229,0.6)] ring-1 ring-white/15 transition-all hover:-translate-y-0.5 hover:shadow-[0_40px_80px_-20px_rgba(79,70,229,0.7)]"
          >
            Create your outlet
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-surface-100 backdrop-blur-md hover:bg-white/10 transition"
          >
            Log in
          </Link>
        </div>
        <p className="mt-4 text-[11px] text-surface-500">14-day free trial · no credit card required</p>
      </div>

      {/* Trust strip */}
      <div className="mx-auto mt-12 max-w-4xl">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { v: '< 1 min', l: 'Outlet setup' },
            { v: 'Isolated', l: 'Per-outlet privacy' },
            { v: '14 days', l: 'Free trial' },
            { v: '24/7', l: 'Real-time sync' },
          ].map((t) => (
            <div key={t.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center backdrop-blur-md">
              <p className="text-xl font-extrabold text-white md:text-2xl">{t.v}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-surface-400">{t.l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── Problem statement ────────────────────────────────────────────── */}
    <section className="relative z-10 px-6 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <SectionEyebrow>Why Cenciss</SectionEyebrow>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">
          One system instead of seven spreadsheets.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-surface-300 md:text-base leading-relaxed">
          Boutique teams often split Shopify, a counter POS, material stock sheets,
          vendor messages, payroll, and the ledger across different tools. Cenciss
          brings those daily workflows together with role-scoped access.
        </p>
      </div>
      <div className="mx-auto mt-12 max-w-5xl grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { i: AlertTriangle, t: 'Data scattered across tools', b: "POS doesn't know stock. Stock doesn't know spend. Spend doesn't know P&L. You stitch the report manually every month." },
          { i: ShieldCheck, t: 'No clear control over staff', b: "Cashiers see what owners see. Managers can't approve POs. Permissions are an honor system rather than a system." },
          { i: TrendingDown, t: 'Discovering problems too late', b: 'You find material shortages, stock conflicts, and unexplained cost changes after they have already affected sales.' },
        ].map((p) => (
          <div key={p.t} className="rounded-2xl border border-rose-300/15 bg-rose-500/[0.06] p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
              <p.i size={15} />
            </div>
            <p className="mt-3 font-extrabold text-white">{p.t}</p>
            <p className="mt-1 text-sm text-surface-300 leading-relaxed">{p.b}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ── What's inside (existing 6-card grid) ─────────────────────────── */}
    <section id="features" className="relative z-10 px-6 pb-20 pt-4 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <SectionEyebrow>What's inside</SectionEyebrow>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
            Everything you need, nothing you don't.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body, accent }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-[0_30px_60px_-30px_rgba(99,102,241,0.4)]"
            >
              <div className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${accent} blur-3xl opacity-60 transition-opacity group-hover:opacity-100`} />
              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md">
                  <Icon size={18} className="text-brand-200" />
                </div>
                <div className="mt-4 text-base font-extrabold text-white">{title}</div>
                <p className="mt-1.5 text-sm text-surface-300">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── Deep-dive feature blocks ─────────────────────────────────────── */}

    <FeatureBlock
      eyebrow="Purchasing"
      title="Record goods, costs, and payables in one clear purchase."
      description="Create a draft, review the exact items received, then post stock and accounting together. Every correction is explicit and traceable, without passing the same delivery through multiple documents."
      bullets={[
        'Stock and expense purchases in one practical form',
        'Draft review before inventory or accounting changes',
        'Clear item summaries in every journal entry',
        'Correction workflow with an explicit inventory choice',
      ]}
      mockup={<PurchaseOrderMock />}
    />

    <FeatureBlock
      reverse
      eyebrow="Inventory"
      title="Track raw materials and finished goods in the right place."
      description="Purchase fabrics and supplies into Store, issue them to a manufacturing batch, and track sellable size/color variants from Shopify. POS and production movements are sent back to the mapped Shopify location."
      bullets={[
        'Shopify variant stock by location',
        'Size, color, SKU, and barcode search at the POS',
        'Raw material quantities and manufacturing BOMs',
        'Visible sync conflicts for manager review',
      ]}
      mockup={<InventoryMock />}
    />

    <FeatureBlock
      eyebrow="Bills & Payments"
      title="Get paid (and pay) on time, every time."
      description="Each vendor bill number lives on the purchase that created the payable. Aging shows what is overdue, while partial payments and reversals retain a complete audit trail."
      bullets={[
        'Aging buckets (0–30, 31–60, 61–90, 90+)',
        'Open the original purchase from every payment or journal entry',
        'Partial payments with running balance',
        'Email reminders to slow vendors (or your own customers)',
      ]}
      mockup={<InvoiceMock />}
    />

    <FeatureBlock
      reverse
      eyebrow="Modern POS"
      title="A point-of-sale for the boutique counter."
      description="Scan barcodes or find product variants, accept cash, card, transfer, store credit, and split payments, and keep selling from a saved catalog during an internet outage."
      bullets={[
        'Variant, SKU, and barcode checkout',
        'Cash, card, transfer, split tender, and store credit',
        'Receipt preview and thermal printer support',
        'Offline queue with visible stock-conflict review',
      ]}
      mockup={<POSMock />}
    />

    <FeatureBlock
      eyebrow="Face ID Attendance"
      title="Clock in with a glance. No PINs, no buddy-punching."
      description="Pair a tablet to your outlet once with a one-time token, then enroll each employee's face during onboarding. Employees walk up, the camera matches, attendance is logged with a confidence score and a timestamp. End of story."
      bullets={[
        'Per-outlet device pairing (multi-outlet safe)',
        'Vote-based matching tolerates motion blur',
        'Employee enrollment in 5 head poses, 30 seconds',
        'Per-tenant employee roster — never mixed across customers',
      ]}
      mockup={<FaceIdMock />}
    />

    <FeatureBlock
      reverse
      eyebrow="Accounting"
      title="A real ledger, posted automatically by the system."
      description="Sales, COGS, expenses, payroll, salary advances — every operational event posts a journal entry. Run trial balance, P&L, and balance sheet at any moment without exporting to Excel."
      bullets={[
        'Automated journal entries for sales, purchases, payments',
        'Chart of accounts for sales, inventory, returns, and store credit',
        'Profit & loss, balance sheet, trial balance, ledger views',
        'Period close + audit log of who did what',
      ]}
      mockup={<AccountingMock />}
    />

    {/* ── Multi-outlet ──────────────────────────────────────────────────── */}
    <section className="relative z-10 px-6 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <SectionEyebrow>Multi-outlet</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            Run two outlets — or twenty — from one account.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-surface-300 md:text-base">
            Every employee, vendor, attendance terminal, and report scopes by outlet. Owners
            see consolidated rollups; managers see only the outlet they belong to.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { code: 'BTQ-1015', name: 'Boutique · Branch 02', revenue: 'PKR 4.82M', staff: 12 },
            { code: 'BTQ-2031', name: 'Boutique · Downtown', revenue: 'PKR 6.31M', staff: 18 },
            { code: 'BTQ-3002', name: 'Boutique · Airport', revenue: 'PKR 3.14M', staff: 9 },
          ].map((o) => (
            <div
              key={o.code}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md transition hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between">
                <Pill tone="indigo"><MapPin size={9} /> {o.code}</Pill>
                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Active</span>
              </div>
              <p className="mt-3 text-base font-extrabold text-white">{o.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">Revenue MTD</p>
                  <p className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-300">{o.revenue}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">Staff</p>
                  <p className="mt-0.5 text-sm font-extrabold tabular-nums text-white">{o.staff}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── How it works ─────────────────────────────────────────────────── */}
    <section id="how-it-works" className="relative z-10 px-6 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            Live in four steps.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-surface-300 md:text-base">
            From signup to your first sale, it's a single afternoon — not a month-long migration project.
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-4">
          {HOW_STEPS.map(({ icon: Icon, title, body }, idx) => (
            <li
              key={title}
              className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md"
            >
              <div className="absolute -top-3 -left-3 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-700 text-xs font-extrabold text-white shadow-glow ring-2 ring-surface-950">
                {idx + 1}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-200 ring-1 ring-white/15">
                <Icon size={16} />
              </div>
              <p className="mt-3 text-sm font-extrabold text-white">{title}</p>
              <p className="mt-1 text-[13px] text-surface-300 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* ── FAQ ──────────────────────────────────────────────────────────── */}
    <section id="faq" className="relative z-10 px-6 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            Questions, answered.
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <span className="text-sm font-extrabold text-white">{q}</span>
                <ChevronDown size={16} className="text-surface-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-white/5 px-5 py-4 text-sm text-surface-300 leading-relaxed">
                {a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA strip ────────────────────────────────────────────────────── */}
    <section className="relative z-10 px-6 pb-16 md:px-10">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-700/40 via-brand-900/40 to-slate-950 p-8 backdrop-blur-md md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h3 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              Ready to set up your outlet?
            </h3>
            <p className="mt-2 text-sm text-surface-300">
              Sign up takes under a minute. We'll walk you through outlet setup so you can start operating right away.
            </p>
          </div>
          <Link
            to="/signup"
            className="group inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-surface-900 shadow-glow-lg transition hover:-translate-y-0.5"
          >
            Start free trial
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>

    {/* ── Footer ───────────────────────────────────────────────────────── */}
    <footer className="relative z-10 border-t border-white/5 px-6 pt-10 pb-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-glow ring-1 ring-white/10 overflow-hidden">
                <img src={logo} alt="Cenciss" className="h-6 w-6 object-contain" />
              </div>
              <p className="text-sm font-bold">Cenciss</p>
            </div>
            <p className="mt-3 max-w-xs text-[13px] text-surface-400">
              Boutique stock, sales, manufacturing, and finance operations. Built in Pakistan, made for the world.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Product</p>
            <ul className="mt-3 space-y-2 text-xs text-surface-300">
              <li><a href="#features" className="hover:text-white transition">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-white transition">How it works</a></li>
              <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
              <li><Link to="/signup" className="hover:text-white transition">Start free trial</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Account</p>
            <ul className="mt-3 space-y-2 text-xs text-surface-300">
              <li><Link to="/login" className="hover:text-white transition">Log in</Link></li>
              <li><Link to="/signup" className="hover:text-white transition">Sign up</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-[11px] text-surface-500 md:flex-row">
          <p>© {new Date().getFullYear()} Cenciss · Boutique operations</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <Wallet size={11} className="text-emerald-400/80" /> PKR &amp; multi-currency
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} className="text-cyan-400/80" /> Real-time sync
            </span>
            <span className="inline-flex items-center gap-1">
              <Calculator size={11} className="text-fuchsia-400/80" /> Auto accounting
            </span>
            <span className="inline-flex items-center gap-1">
              <Package size={11} className="text-amber-400/80" /> Inventory aware
            </span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp size={11} className="text-brand-300/80" /> Multi-outlet
            </span>
          </div>
        </div>
      </div>
    </footer>
  </main>
);

export default Landing;
