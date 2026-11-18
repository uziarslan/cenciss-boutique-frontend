import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Loader2, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { signupTenant } from '../../api/signupApi';
import logo from '../../assets/logo.png';
import { setUser, setAccessToken } from '../../store/slices/authSlice';
import { scheduleTokenRefresh } from '../../api/axios';

const Signup = () => {
  const [outletName, setOutletName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await signupTenant({ outletName, ownerName, email, password });
      dispatch(setAccessToken(data.accessToken));
      dispatch(setUser(data.user));
      scheduleTokenRefresh(data.accessToken);
      toast.success("Welcome! Let's set up your outlet.");
      navigate('/onboarding/outlet', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Signup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-950 text-white">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_-10%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(120%_80%_at_120%_110%,rgba(20,184,166,0.28),transparent_55%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
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

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link to="/" className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 shadow-glow ring-1 ring-white/10 overflow-hidden">
            <img src={logo} alt="Cenciss" className="h-7 w-7 object-contain" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Cenciss</p>
            <p className="text-[11px] text-surface-400">Boutique operations</p>
          </div>
        </Link>
        <Link
          to="/login"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-surface-200 backdrop-blur-md hover:bg-white/10 transition"
        >
          Log in
        </Link>
      </header>

      {/* Card */}
      <section className="relative z-10 mx-auto flex max-w-xl flex-col px-6 pb-12 pt-6 md:pt-10">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-200 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Free trial · 14 days
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight md:text-4xl">
            Create your{' '}
            <span className="bg-gradient-to-r from-brand-300 via-cyan-200 to-emerald-200 bg-clip-text text-transparent">
              outlet
            </span>
          </h1>
          <p className="mt-3 text-sm text-surface-300">
            We'll spin up an isolated database and drop you into onboarding.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-md shadow-[0_40px_80px_-30px_rgba(15,23,42,0.6)]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />

          <form onSubmit={submit} className="relative space-y-4">
            <Field label="Outlet name" value={outletName} onChange={setOutletName} placeholder="The Smash Ove" autoFocus />
            <Field label="Your name" value={ownerName} onChange={setOwnerName} placeholder="Uzair Arslan" />
            <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-surface-300">Password</label>
                <span className="text-[10px] text-surface-500">8+ characters</span>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-surface-500 backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-[0_30px_60px_-20px_rgba(79,70,229,0.6)] ring-1 ring-white/15 transition-all hover:-translate-y-0.5 hover:shadow-[0_40px_80px_-20px_rgba(79,70,229,0.7)] disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Create outlet
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-surface-500">
              <ShieldCheck size={12} className="text-emerald-400/80" />
              Your outlet gets its own isolated database
            </div>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-surface-300">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-200 hover:text-white transition">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
};

const Field = ({ label, value, onChange, type = 'text', placeholder, autoFocus }) => (
  <label className="block">
    <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-surface-300">{label}</div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      required
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-surface-500 backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/40"
    />
  </label>
);

export default Signup;
