import { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  Users, Plus, Edit2, UserX, UserCheck, X, Camera, ScanFace, CheckCircle2,
  User as UserIcon, Briefcase, Wallet, Landmark, Clock, MapPin, ShieldCheck,
  Download, Upload,
} from 'lucide-react';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import ConfirmModal from '../../components/UI/ConfirmModal';
import Portal from '../../components/UI/Portal';
import toast from 'react-hot-toast';
import {
  createEmployee, updateEmployee, deactivateEmployee, enrollEmployeeFace,
} from '../../api/salaryApi';
import { baseApi, useGetOutletsQuery, useGetEmployeesQuery, listQueryOpts } from '../../store/baseApi';
import usePermissions from '../../hooks/usePermissions';
import useFeatures from '../../hooks/useFeatures';
import { ensureFaceModelsLoaded, detectFaceFromVideo, estimateFacePose, averageDescriptors } from '../../utils/faceId';
import AmountInput from '../../components/UI/AmountInput';
import useQueryState from '../../hooks/useQueryState';
import EmployeeBulkImportModal from './EmployeeBulkImportModal';
import EmployeeRoster from './EmployeeRoster';
import { calculatePayrollBreakdown } from '../Salaries/payrollCalculation';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
  `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtRate = (v) =>
  `PKR ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const currentPayrollPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const excelXmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const excelCell = (value, type = 'String', style = 'Body') =>
  `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${excelXmlEscape(value)}</Data></Cell>`;

const FACE_GUIDE_STEPS = [
  { key: 'straight', title: 'Look straight', hint: 'Keep your face centered and neutral.' },
  { key: 'left', title: 'Turn slightly left', hint: 'Rotate your head a little to the left.' },
  { key: 'right', title: 'Turn slightly right', hint: 'Rotate your head a little to the right.' },
  { key: 'up', title: 'Look slightly up', hint: 'Lift your chin slightly upward.' },
  { key: 'down', title: 'Look slightly down', hint: 'Lower your chin slightly downward.' },
];

const stepLabel = (key) => {
  if (key === 'straight') return 'Center';
  if (key === 'left') return 'Left';
  if (key === 'right') return 'Right';
  if (key === 'up') return 'Up';
  if (key === 'down') return 'Down';
  return key;
};

const formatMissing = (keys = []) => keys.map(stepLabel).join(', ');

const stepMatchesPose = (stepKey, pose, baselinePose) => {
  if (!pose) return false;
  const { yaw, pitch } = pose;
  const baselineYaw = baselinePose?.yaw || 0;
  const baselinePitch = baselinePose?.pitch || 0;

  if (stepKey === 'straight') return Math.abs(yaw - baselineYaw) < 0.08 && Math.abs(pitch - baselinePitch) < 0.08;
  if (stepKey === 'left') return yaw < (baselineYaw - 0.1);
  if (stepKey === 'right') return yaw > (baselineYaw + 0.1);
  if (stepKey === 'up') return pitch < (baselinePitch - 0.035);
  if (stepKey === 'down') return pitch > (baselinePitch + 0.035);
  return false;
};

const FaceEnrollmentModal = ({ onClose, onComplete, employee = null }) => {
  const [captures, setCaptures] = useState([]);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState('Position your face in the frame. Press Start scanning to begin.');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const stableFramesRef = useRef(0);
  const detectingRef = useRef(false);
  const targetKeyRef = useRef(null);
  const baselinePoseRef = useRef(null);
  const faceCropRef = useRef(null);
  // While the user holds a pose we accumulate a small burst of descriptors
  // (3 frames). The mean of that burst is what gets stored — denoising the
  // pose vs. the previous "single frame per pose" approach.
  const poseSamplesRef = useRef([]);
  const POSE_SAMPLE_TARGET = 3;

  useEffect(() => {
    let mounted = true;
    const videoEl = videoRef.current;

    const openCamera = async () => {
      try {
        await ensureFaceModelsLoaded();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            const p = videoRef.current.play();
            if (p && p.then) p.catch(() => {});
          } catch (e) {}
          if (videoRef.current.readyState >= 2) setCameraReady(true);
        }
        stream.getTracks().forEach((track) => { track.onended = () => setCameraReady(false); });
        setCameraError('');
      } catch (error) {
        setCameraError('Unable to access camera. Please allow permission and retry.');
      }
    };

    openCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoEl) {
        try { videoEl.pause(); } catch (e) {}
        try { videoEl.srcObject = null; } catch (e) {}
      }
    };
  }, []);

  // Canvas draw loop. Detection is throttled to ~6Hz (separate from the
  // 60fps render loop) so the camera preview stays smooth and the CPU isn't
  // pegged running TinyFaceDetector on every frame.
  useEffect(() => {
    let rafId = null;
    let lastDetectAt = 0;
    let lastDetection = null;
    const DETECT_INTERVAL_MS = 1000 / 6;
    const dpr = window.devicePixelRatio || 1;
    const smooth = (a, b, t = 0.18) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });

    const drawLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafId = requestAnimationFrame(drawLoop);
        return;
      }

      const ctx = canvas.getContext('2d');
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      // Kick off detection asynchronously without blocking frame draws.
      const now = performance.now();
      if (now - lastDetectAt >= DETECT_INTERVAL_MS) {
        lastDetectAt = now;
        detectFaceFromVideo(video).then((d) => { lastDetection = d || null; }).catch(() => { lastDetection = null; });
      }
      const detection = lastDetection;

      if (detection?.detection?.box) {
        const b = detection.detection.box;
        const pad = Math.max(b.width, b.height) * 0.5;
        let sx = Math.max(0, b.x - pad * 0.25);
        let sy = Math.max(0, b.y - pad * 0.25);
        let sw = Math.min(vw - sx, b.width + pad);
        let sh = Math.min(vh - sy, b.height + pad);
        const size = Math.max(sw, sh);
        sw = sh = size;
        if (sx + sw > vw) sx = vw - sw;
        if (sy + sh > vh) sy = vh - sh;
        const target = { x: sx, y: sy, w: sw, h: sh };
        if (!faceCropRef.current) faceCropRef.current = target;
        faceCropRef.current = smooth(faceCropRef.current, target);
      } else {
        const size = Math.min(vw, vh) * 0.7;
        const sx = Math.max(0, (vw - size) / 2);
        const sy = Math.max(0, (vh - size) / 2);
        const target = { x: sx, y: sy, w: size, h: size };
        if (!faceCropRef.current) faceCropRef.current = target;
        faceCropRef.current = smooth(faceCropRef.current, target, 0.12);
      }

      const outW = canvas.clientWidth;
      const outH = canvas.clientHeight;
      canvas.width = Math.round(outW * dpr);
      canvas.height = Math.round(outH * dpr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const crop = faceCropRef.current;
      if (crop) {
        ctx.save();
        ctx.imageSmoothingQuality = 'high';
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      rafId = requestAnimationFrame(drawLoop);
    };

    rafId = requestAnimationFrame(drawLoop);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [cameraReady]);

  // iPhone-style circular Face ID styles
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('face-enroll-animations')) return;
    const s = document.createElement('style');
    s.id = 'face-enroll-animations';
    s.textContent = `
      .faceid-stage { position:relative; width:300px; height:300px; display:flex; align-items:center; justify-content:center; }
      .faceid-circle { position:relative; width:260px; height:260px; border-radius:50%; overflow:hidden; background:radial-gradient(120% 120% at 50% 0%, #1e293b 0%, #0f172a 60%, #020617 100%); box-shadow: 0 30px 70px -20px rgba(15,23,42,0.45), inset 0 0 0 1px rgba(255,255,255,0.06); }
      .faceid-canvas { width:100%; height:100%; display:block; object-fit:cover; }
      .faceid-video { display:none; }
      .faceid-ring { position:absolute; inset:0; pointer-events:none; transform: rotate(-90deg); }
      .faceid-tick { stroke:#cbd5e1; stroke-width:3; stroke-linecap:round; opacity:0.35; transition: opacity 0.25s ease, stroke 0.25s ease; }
      .faceid-tick.captured { stroke:#10b981; opacity:1; filter: drop-shadow(0 0 6px rgba(16,185,129,0.6)); }
      .faceid-tick.scanning { stroke:#38bdf8; opacity:1; animation: tickPulse 1.1s ease-in-out infinite; }
      @keyframes tickPulse { 0%,100% { opacity:0.4; } 50% { opacity:1; filter: drop-shadow(0 0 6px rgba(56,189,248,0.7)); } }
      .faceid-sweep { position:absolute; inset:0; border-radius:50%; pointer-events:none; background: conic-gradient(from 0deg, rgba(56,189,248,0) 0deg, rgba(56,189,248,0.55) 30deg, rgba(56,189,248,0) 60deg, rgba(56,189,248,0) 360deg); -webkit-mask: radial-gradient(circle, transparent 122px, #000 124px, #000 130px, transparent 132px); mask: radial-gradient(circle, transparent 122px, #000 124px, #000 130px, transparent 132px); animation: sweepRotate 2.4s linear infinite; opacity:0; transition: opacity 0.3s ease; }
      .faceid-sweep.active { opacity:1; }
      @keyframes sweepRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .faceid-vignette { position:absolute; inset:0; border-radius:50%; pointer-events:none; box-shadow: inset 0 0 40px rgba(0,0,0,0.45); }
      .faceid-glow { position:absolute; inset:-24px; border-radius:50%; pointer-events:none; background: radial-gradient(circle, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0) 70%); opacity:0; transition: opacity 0.4s ease; }
      .faceid-glow.active { opacity:1; }
      .faceid-success-overlay { position:absolute; inset:0; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:#ecfdf5; background: radial-gradient(120% 120% at 50% 0%, #064e3b 0%, #022c22 70%, #021410 100%); animation: successPulse 0.6s ease-out; }
      @keyframes successPulse { 0% { transform: scale(0.92); opacity:0; } 100% { transform: scale(1); opacity:1; } }
      .faceid-initials { width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; color:#022c22; background:linear-gradient(180deg,#a7f3d0,#34d399); box-shadow: 0 10px 24px rgba(16,185,129,0.35); }
    `;
    document.head.appendChild(s);
    return () => { try { s.remove(); } catch (e) {} };
  }, []);

  const capturedKeys = captures.map((item) => item.angle);
  const missingKeys = FACE_GUIDE_STEPS.map((item) => item.key).filter((key) => !capturedKeys.includes(key));
  const complete = missingKeys.length === 0;
  const currentStepHint = FACE_GUIDE_STEPS.find((s) => s.key === missingKeys[0])?.hint;

  useEffect(() => {
    if (!scanning || !cameraReady || complete || cameraError) return undefined;

    const timer = window.setInterval(async () => {
      if (detectingRef.current) return;
      if (!videoRef.current) return;

      detectingRef.current = true;
      try {
        const result = await detectFaceFromVideo(videoRef.current);
        if (!result?.descriptor) {
          stableFramesRef.current = 0;
          targetKeyRef.current = null;
          setStatusText('Face not detected. Keep your face in camera frame.');
          return;
        }

        const pose = estimateFacePose(result);
        if (!baselinePoseRef.current) {
          baselinePoseRef.current = pose;
        }

        const requiredKeys = missingKeys.includes('straight') ? ['straight'] : missingKeys;
        const matchedKey = requiredKeys.find((key) => stepMatchesPose(key, pose, baselinePoseRef.current)) || null;

        if (!matchedKey) {
          stableFramesRef.current = 0;
          targetKeyRef.current = null;
          if (requiredKeys.length === 1 && requiredKeys[0] === 'straight') {
            setStatusText('Align your face naturally in the center.');
          } else {
            setStatusText(`Still missing: ${formatMissing(missingKeys)}.`);
          }
          return;
        }

        if (targetKeyRef.current !== matchedKey) {
          targetKeyRef.current = matchedKey;
          stableFramesRef.current = 0;
          poseSamplesRef.current = [];
        }

        stableFramesRef.current += 1;
        // Once the pose is stable, accumulate a burst of descriptors. Each
        // tick adds one; we average them once we have POSE_SAMPLE_TARGET.
        if (stableFramesRef.current >= 1) {
          poseSamplesRef.current.push(Array.from(result.descriptor));
        }
        setStatusText(`Scanning ${stepLabel(matchedKey)}… hold still (${poseSamplesRef.current.length}/${POSE_SAMPLE_TARGET}).`);

        if (poseSamplesRef.current.length < POSE_SAMPLE_TARGET) return;

        const descriptor = averageDescriptors(poseSamplesRef.current);
        setCaptures((prev) => [...prev, { angle: matchedKey, descriptor }]);
        stableFramesRef.current = 0;
        targetKeyRef.current = null;
        poseSamplesRef.current = [];
        toast.success(`${stepLabel(matchedKey)} captured.`);
      } finally {
        detectingRef.current = false;
      }
    }, 280);

    return () => window.clearInterval(timer);
  }, [cameraError, cameraReady, complete, missingKeys, scanning]);

  useEffect(() => {
    if (complete) {
      setScanning(false);
      setStatusText('All angles captured successfully.');
    }
  }, [complete]);

  // if camera error occurs, ensure scanning is turned off
  useEffect(() => {
    if (cameraError) {
      setScanning(false);
      setStatusText(cameraError);
    }
  }, [cameraError]);

  useEffect(() => {
    if (cameraReady && !cameraError && !complete) {
      setScanning(true);
      setStatusText(`Still missing: ${formatMissing(missingKeys)}.`);
    }
  }, [cameraError, cameraReady, complete, missingKeys]);

  // Build tick marks evenly spaced around the ring (32 ticks).
  // Each FACE_GUIDE_STEPS index lights a contiguous block of ticks as it's captured.
  const TICK_COUNT = 32;
  const ticks = useMemo(() => {
    const arr = [];
    const segPerStep = TICK_COUNT / FACE_GUIDE_STEPS.length;
    for (let i = 0; i < TICK_COUNT; i++) {
      const angle = (i / TICK_COUNT) * 2 * Math.PI;
      const stepIdx = Math.floor(i / segPerStep);
      const stepKey = FACE_GUIDE_STEPS[stepIdx]?.key;
      const isCaptured = capturedKeys.includes(stepKey);
      const isCurrent = !isCaptured && stepKey === missingKeys[0] && scanning;
      const inner = 124;
      const outer = 138;
      const cx = 150 + Math.cos(angle) * inner;
      const cy = 150 + Math.sin(angle) * inner;
      const ex = 150 + Math.cos(angle) * outer;
      const ey = 150 + Math.sin(angle) * outer;
      arr.push({ x1: cx, y1: cy, x2: ex, y2: ey, captured: isCaptured, current: isCurrent });
    }
    return arr;
  }, [capturedKeys, missingKeys, scanning]);

  const initials = (() => {
    const name = employee?.name || '';
    if (!name) return 'ID';
    const parts = name.trim().split(/\s+/);
    const a = (parts[0] || '').charAt(0) || '';
    const b = (parts[1] || parts[0] || '').charAt(0) || '';
    return (a + b).toUpperCase();
  })();

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl ring-1 ring-slate-100 overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-indigo-500/20 blur-2xl" />
          <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-cyan-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2.5 ring-1 ring-white/20">
                <ScanFace size={22} className="text-cyan-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">Face ID Enrollment</h2>
                <p className="text-xs text-slate-300 mt-0.5">{employee?.name ? `For ${employee.name}` : 'New employee'}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col items-center">
          <div className="faceid-stage">
            <div className={`faceid-glow ${scanning && !complete ? 'active' : ''}`} />
            <div className="faceid-circle">
              {complete ? (
                <div className="faceid-success-overlay">
                  <div className="faceid-initials">{initials}</div>
                  <p className="text-sm font-bold text-emerald-50 mt-2">All angles captured</p>
                  <p className="text-[11px] text-emerald-200/80">Ready to save Face ID</p>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => setCameraReady(true)} className="faceid-video" />
                  <canvas ref={canvasRef} className="faceid-canvas" />
                  <div className="faceid-vignette" />
                </>
              )}
            </div>

            {!complete && (
              <>
                <div className={`faceid-sweep ${scanning && !cameraError ? 'active' : ''}`} />
                <svg className="faceid-ring" viewBox="0 0 300 300" width="300" height="300">
                  {ticks.map((t, i) => (
                    <line
                      key={i}
                      x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                      className={`faceid-tick ${t.captured ? 'captured' : ''} ${t.current ? 'scanning' : ''}`}
                    />
                  ))}
                </svg>
              </>
            )}
          </div>

          {/* Step indicators */}
          <div className="mt-5 flex items-center gap-1.5">
            {FACE_GUIDE_STEPS.map((step) => {
              const done = capturedKeys.includes(step.key);
              const current = !done && step.key === missingKeys[0];
              return (
                <div
                  key={step.key}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    done ? 'bg-emerald-500 w-8' : current ? 'bg-cyan-500 w-8' : 'bg-slate-200 w-5'
                  }`}
                />
              );
            })}
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm font-semibold text-slate-800">
              {complete ? 'Complete' : `Step: ${stepLabel(missingKeys[0] || 'straight')}`}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              {complete ? 'All angles captured successfully.' : (currentStepHint || 'Keep your face centered and look at the camera')}
            </p>
          </div>

          {/* Status pill */}
          <div className="mt-3 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200">
            <p className="text-[11px] text-slate-600 font-medium">{statusText}</p>
          </div>

          {/* Actions */}
          <div className="mt-6 w-full flex gap-2.5">
            <button
              type="button"
              onClick={() => onClose && onClose()}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            {!cameraError ? (
              complete ? (
                <button
                  type="button"
                  onClick={() => onComplete && onComplete(captures)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/30 hover:brightness-110 transition"
                >
                  <CheckCircle2 size={16} className="inline mr-1.5 -mt-0.5" />
                  Save Face ID
                </button>
              ) : !scanning ? (
                <button
                  type="button"
                  onClick={() => { setScanning(true); setStatusText('Scanning...'); }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/30 hover:brightness-110 transition"
                >
                  Start Scanning
                </button>
              ) : (
                <button type="button" disabled className="flex-1 py-2.5 px-4 rounded-xl bg-slate-200 text-slate-500 font-semibold text-sm">
                  Scanning…
                </button>
              )
            ) : (
              <div className="flex-1 py-2.5 px-4 rounded-xl bg-rose-50 text-rose-700 font-semibold text-sm flex items-center justify-center border border-rose-200">
                Camera unavailable
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};

// ── Employee Form Modal ───────────────────────────────────────────────────────

const EmployeeModal = ({ employee, outlets, onClose, onSaved, onRequestFaceEnroll, faceCapturesFromParent = [], formState, setFormState }) => {
  const dispatch = useDispatch();
  const { hasFeature } = useFeatures();
  const editing = Boolean(employee?._id);
  const { data: allEmployees } = useGetEmployeesQuery({}, listQueryOpts);
  const deviceId = String(formState.deviceEmployeeNo || '').trim();
  const conflictingEmployee = (Array.isArray(allEmployees) ? allEmployees : []).find((row) =>
    row._id !== employee?._id && deviceId && String(row.deviceEmployeeNo || '').trim() === deviceId);
  const deviceIdError = conflictingEmployee ? 'Device Person ID is already assigned to another employee. Choose a unique ID.' : '';
  const form = formState;
  const setForm = setFormState;
  const [saving, setSaving] = useState(false);
  const faceCaptures = faceCapturesFromParent || [];
  const alreadyEnrolled = Boolean(employee?.isFaceEnrolled) || (faceCaptures.length >= FACE_GUIDE_STEPS.length);
  const ratePreview = useMemo(() => calculatePayrollBreakdown({
    period: currentPayrollPeriod(),
    monthlySalary: form.salary,
    paidOffDutyDays: form.paidOffDutyDays,
    shiftStart: form.shiftStart,
    shiftEnd: form.shiftEnd,
  }), [form.salary, form.paidOffDutyDays, form.shiftStart, form.shiftEnd]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCreditLimit = (key, value) => setForm((current) => ({
    ...current,
    salaryCreditLimits: {
      ...current.salaryCreditLimits,
      [key]: value,
    },
  }));

  const handleSave = async () => {
    if (deviceIdError) return toast.error(deviceIdError);
    if (!form.name.trim()) return toast.error('Name is required.');
    if (!form.cnic.trim()) return toast.error('CNIC is required.');
    // Outlet is required so attendance terminals (which scope to a specific
    // outlet via device pairing) can find this employee. Without an outlet
    // the employee is invisible to any per-outlet attendance device.
    if (!form.outlet) return toast.error('Outlet is required so attendance can match this employee.');
    if (!form.salary || isNaN(form.salary) || Number(form.salary) < 0)
      return toast.error('Valid salary is required.');
    if (!form.salaryDate || form.salaryDate < 1 || form.salaryDate > 28)
      return toast.error('Salary date must be between 1 and 28.');
    const paidOffDutyDays = Number(form.paidOffDutyDays);
    if (!Number.isInteger(paidOffDutyDays) || paidOffDutyDays < 0 || paidOffDutyDays > 15)
      return toast.error('Paid off-duty days must be a whole number between 0 and 15.');
    const creditLimits = form.salaryCreditLimits || {};
    const maxOutstandingPercent = Number(creditLimits.maxOutstandingPercent);
    const dailyLimitPercent = Number(creditLimits.dailyLimitPercent);
    const rollingSevenDayLimitPercent = Number(creditLimits.rollingSevenDayLimitPercent);
    if ([
      creditLimits.maxOutstandingPercent,
      creditLimits.dailyLimitPercent,
      creditLimits.rollingSevenDayLimitPercent,
    ].some((value) => value === '' || value === null)
      || [maxOutstandingPercent, dailyLimitPercent, rollingSevenDayLimitPercent]
      .some((value) => !Number.isFinite(value) || value < 0 || value > 60)) {
      return toast.error('Employee credit limits must be between 0% and 60%.');
    }
    if (dailyLimitPercent > rollingSevenDayLimitPercent) {
      return toast.error('Daily credit limit cannot be greater than the rolling seven-day limit.');
    }
    if (rollingSevenDayLimitPercent > maxOutstandingPercent) {
      return toast.error('Rolling seven-day limit cannot be greater than the maximum outstanding limit.');
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        deviceEmployeeNo: deviceId,
        salary: parseFloat(form.salary),
        salaryDate: parseInt(form.salaryDate, 10),
        paidOffDutyDays,
        joiningDate: form.joiningDate || undefined,
        salaryCreditLimits: {
          cashAdvanceEnabled: creditLimits.cashAdvanceEnabled !== false,
          chargeToSalaryEnabled: creditLimits.chargeToSalaryEnabled !== false,
          maxOutstandingPercent,
          dailyLimitPercent,
          rollingSevenDayLimitPercent,
        },
      };
      let employeeId = employee?._id;

      if (editing) {
        const updateRes = await updateEmployee(employee._id, payload);
        employeeId = updateRes?.data?.data?._id || employeeId;
        toast.success('Employee updated.');
      } else {
        const createRes = await createEmployee(payload);
        employeeId = createRes?.data?.data?._id;
        toast.success('Employee added.');
      }

      if (!employeeId) {
        throw new Error('Employee save succeeded but employee id is missing.');
      }

      const hasNewFacePayload = faceCaptures.length >= FACE_GUIDE_STEPS.length;

      if (hasNewFacePayload) {
        await enrollEmployeeFace(employeeId, {
          descriptors: faceCaptures.map((item) => item.descriptor),
          angles: faceCaptures.map((item) => item.angle),
        });
        toast.success('Face enrolled successfully.');
      }

      dispatch(baseApi.util.invalidateTags(['Employee']));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Failed to save employee.');
    } finally {
      setSaving(false);
    }
  };

  

  const initials = (() => {
    const n = (form.name || '').trim();
    if (!n) return editing ? 'EM' : '+';
    const parts = n.split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts[1] || parts[0] || '').charAt(0)).toUpperCase();
  })();

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5';
  const SectionHeader = ({ icon: Icon, title, subtitle }) => (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
        <Icon size={15} className="text-indigo-600" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-800 leading-tight">{title}</h4>
        {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );

  const faceState = faceCaptures.length >= FACE_GUIDE_STEPS.length
    ? { label: 'Face ID ready to save', tone: 'emerald' }
    : alreadyEnrolled
      ? { label: 'Already enrolled', tone: 'emerald' }
      : { label: 'Not enrolled', tone: 'slate' };

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-slate-100 w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Premium gradient header */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white overflow-hidden shrink-0">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-12 w-48 h-48 rounded-full bg-cyan-300/15 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 flex items-center justify-center text-xl font-bold shadow-inner">
                {initials}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-100/90">{editing ? 'Edit Employee' : 'New Employee'}</p>
                <h3 className="text-xl font-bold leading-tight mt-0.5">{form.name || (editing ? employee?.name : 'Add a team member')}</h3>
                <p className="text-xs text-indigo-100/80 mt-0.5">{form.designation || form.department || 'Capture profile, salary & Face ID'}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 bg-slate-50/40">
          {/* Identity */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <SectionHeader icon={UserIcon} title="Identity" subtitle="Personal & contact details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Full Name <span className="text-rose-500">*</span></label>
                <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Muhammad Ali" />
              </div>
              <div>
                <label className={labelCls}>CNIC <span className="text-rose-500">*</span></label>
                <input
                  className={inputCls}
                  value={form.cnic}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
                    let formatted = digits;
                    if (digits.length > 5 && digits.length <= 12) formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
                    else if (digits.length > 12) formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
                    set('cnic', formatted);
                  }}
                  placeholder="42101-1234567-1"
                  inputMode="numeric"
                  maxLength={15}
                />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03XX-XXXXXXX" />
              </div>
            </div>
          </section>

          {/* Role & Outlet */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <SectionHeader icon={Briefcase} title="Role & Outlet" subtitle="Where & what this employee does" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>
                  Outlet <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))}
                  value={form.outlet}
                  onChange={(v) => set('outlet', v)}
                  placeholder="Select an outlet…"
                  searchPlaceholder="Search outlets…"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Required — attendance terminals match employees by outlet.
                </p>
              </div>
              <div>
                <label className={labelCls}>Designation</label>
                <input className={inputCls} value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="Chef, Waiter…" />
              </div>
              <div>
                <label className={labelCls}>Department</label>
                <input className={inputCls} value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="Production, Sales…" />
              </div>
              <div>
                <label className={labelCls}>Joining Date</label>
                <input type="date" className={inputCls} value={form.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Compensation */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <SectionHeader icon={Wallet} title="Compensation" subtitle="Salary, paid off-duty allowance & hourly wage" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Monthly Salary (PKR) <span className="text-rose-500">*</span></label>
                <AmountInput className={inputCls} value={form.salary} onChange={(raw) => set('salary', raw)} placeholder="25,000" />
              </div>
              <div>
                <label className={labelCls}>Salary Day <span className="text-rose-500">*</span></label>
                <input type="number" min="1" max="28" className={inputCls} value={form.salaryDate} onChange={(e) => set('salaryDate', e.target.value)} placeholder="1–28" />
              </div>
              <div>
                <label className={labelCls}>Maximum Paid Off-Duty Days / Month <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  step="1"
                  className={inputCls}
                  value={form.paidOffDutyDays}
                  onChange={(e) => set('paidOffDutyDays', e.target.value)}
                  placeholder="4"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Maximum allowance. Payroll only includes dates marked Off duty (paid) on its calendar.
                </p>
              </div>
              <div>
                <label className={labelCls}>Current Hourly Rate</label>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5 text-sm font-semibold text-indigo-800 tabular-nums">
                  {ratePreview.shiftHours > 0 ? fmtRate(ratePreview.hourlyRate) : 'Set shift times'}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {ratePreview.workingDays || 0} working days · {ratePreview.shiftHours || 0} hours per shift
                </p>
              </div>
            </div>
          </section>

          {/* Shared employee-credit controls */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <SectionHeader
              icon={ShieldCheck}
              title="Salary Credit Limits"
              subtitle="Shared by cash advances and POS Charge to Salary"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                {
                  key: 'cashAdvanceEnabled',
                  label: 'Cash Advances',
                  description: 'Allow direct salary advances',
                },
                {
                  key: 'chargeToSalaryEnabled',
                  label: 'Charge to Salary',
                  description: 'Allow employee bills at POS',
                },
              ].map((option) => {
                const enabled = form.salaryCreditLimits?.[option.key] !== false;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setCreditLimit(option.key, !enabled)}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${
                      enabled
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                    aria-pressed={enabled}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{option.description}</span>
                    </span>
                    <span className={`relative h-6 w-11 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Daily Limit (%)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  className={inputCls}
                  value={form.salaryCreditLimits?.dailyLimitPercent ?? 10}
                  onChange={(event) => setCreditLimit('dailyLimitPercent', event.target.value)}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  {fmt((Number(form.salary || 0) * Number(form.salaryCreditLimits?.dailyLimitPercent ?? 10)) / 100)}
                </p>
              </div>
              <div>
                <label className={labelCls}>Rolling 7 Days (%)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  className={inputCls}
                  value={form.salaryCreditLimits?.rollingSevenDayLimitPercent ?? 25}
                  onChange={(event) => setCreditLimit('rollingSevenDayLimitPercent', event.target.value)}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  {fmt((Number(form.salary || 0) * Number(form.salaryCreditLimits?.rollingSevenDayLimitPercent ?? 25)) / 100)}
                </p>
              </div>
              <div>
                <label className={labelCls}>Maximum Outstanding (%)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  className={inputCls}
                  value={form.salaryCreditLimits?.maxOutstandingPercent ?? 60}
                  onChange={(event) => setCreditLimit('maxOutstandingPercent', event.target.value)}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  {fmt((Number(form.salary || 0) * Number(form.salaryCreditLimits?.maxOutstandingPercent ?? 60)) / 100)} · company ceiling 60%
                </p>
              </div>
            </div>
            <p className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] leading-relaxed text-indigo-700">
              Both facilities consume these limits together. Daily and seven-day usage is not restored by repayment; only a genuine void or refund releases it.
            </p>
          </section>

          {/* Banking */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <SectionHeader icon={Landmark} title="Banking" subtitle="Optional — for bank transfers" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Bank Name</label>
                <input className={inputCls} value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="HBL, MCB…" />
              </div>
              <div>
                <label className={labelCls}>Account Number</label>
                <input className={inputCls} value={form.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} placeholder="IBAN / account number" />
              </div>
            </div>
          </section>

          {/* Schedule & Address */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <SectionHeader icon={Clock} title="Schedule & Address" subtitle="Working hours and home address" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Shift Start</label>
                <input type="time" className={inputCls} value={form.shiftStart} onChange={(e) => set('shiftStart', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Shift End</label>
                <input type="time" className={inputCls} value={form.shiftEnd} onChange={(e) => set('shiftEnd', e.target.value)} />
              </div>
              {hasFeature('attendanceExternalDevice') && (
                <div className="sm:col-span-2">
                  <label className={labelCls}>Device Person ID</label>
                  <input
                    className={inputCls}
                    aria-label="Device Person ID"
                    aria-invalid={Boolean(deviceIdError)}
                    aria-describedby="device-person-id-help"
                    value={form.deviceEmployeeNo}
                    onChange={(e) => set('deviceEmployeeNo', e.target.value)}
                    placeholder="Person / Employee ID set on the face terminal"
                    maxLength={64}
                  />
                  <p id="device-person-id-help" className={`mt-1 text-[11px] ${deviceIdError ? 'text-rose-600' : 'text-slate-500'}`}>
                    {deviceIdError || 'Must match the terminal ID and be unique across employees, including inactive staff. Leave blank if unused.'}
                  </p>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className={labelCls}>Address</label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <textarea className={`${inputCls} pl-9 resize-none`} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Home address" />
                </div>
              </div>
            </div>
          </section>

          {/* Face ID card — premium */}
          <section className={`relative overflow-hidden rounded-2xl border p-5 ${
            faceState.tone === 'emerald'
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50'
              : 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50'
          }`}>
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/40 blur-2xl pointer-events-none" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  faceState.tone === 'emerald' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'
                } shadow-lg ${faceState.tone === 'emerald' ? 'shadow-emerald-500/30' : 'shadow-indigo-500/30'}`}>
                  {faceState.tone === 'emerald' ? <ShieldCheck size={20} /> : <ScanFace size={20} />}
                </div>
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                    faceState.tone === 'emerald' ? 'text-emerald-700' : 'text-indigo-700'
                  }`}>Face ID</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{faceState.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Capture 5 angles for secure attendance</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRequestFaceEnroll && onRequestFaceEnroll(employee)}
                className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition shadow-lg ${
                  faceState.tone === 'emerald'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Camera size={13} />
                  {alreadyEnrolled || faceCaptures.length >= FACE_GUIDE_STEPS.length ? 'Re-capture' : 'Register'}
                </span>
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end items-center gap-2 px-6 py-4 border-t border-slate-100 bg-white shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition rounded-xl">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : editing ? 'Update Employee' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

const EmployeeManager = () => {
  const dispatch = useDispatch();
  const { has } = usePermissions();
  const canManage = has('employees.manage');
  const { data: outlets = [] }                = useGetOutletsQuery();
  const [filter, setFilter] = useQueryState('status', 'active');
  const [outletFilter, setOutletFilter] = useQueryState('outlet', '');
  const [employeeSearch, setEmployeeSearch] = useQueryState('search', '');
  const [designationFilter, setDesignationFilter] = useQueryState('designation', '');
  const [departmentFilter, setDepartmentFilter] = useQueryState('department', '');
  const [faceFilter, setFaceFilter] = useQueryState('face', '');
  const [deviceFilter, setDeviceFilter] = useQueryState('device', '');
  const [minSalary, setMinSalary] = useQueryState('minSalary', '');
  const [maxSalary, setMaxSalary] = useQueryState('maxSalary', '');
  const [employeeSort, setEmployeeSort] = useQueryState('sort', 'name');
  const [empModal, setEmpModal]               = useState(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [faceEnrollOpen, setFaceEnrollOpen] = useState(false);
  const [faceEnrollEmployee, setFaceEnrollEmployee] = useState(null);
  const [faceCapturesGlobal, setFaceCapturesGlobal] = useState([]);
  // Lifted form state — survives Face ID round-trip when EmployeeModal unmounts/remounts.
  const [empFormState, setEmpFormState] = useState(null);
  const empFormInitForRef = useRef(null);

  const buildInitialForm = (emp) => ({
    name: emp?.name || '',
    cnic: emp?.cnic || '',
    phone: emp?.phone || '',
    address: emp?.address || '',
    designation: emp?.designation || '',
    department: emp?.department || '',
    joiningDate: emp?.joiningDate ? emp.joiningDate.slice(0, 10) : '',
    salary: emp?.salary || '',
    salaryDate: emp?.salaryDate || 1,
    paidOffDutyDays: emp?.paidOffDutyDays ?? 4,
    salaryCreditLimits: {
      cashAdvanceEnabled: emp?.salaryCreditLimits?.cashAdvanceEnabled !== false,
      chargeToSalaryEnabled: emp?.salaryCreditLimits?.chargeToSalaryEnabled !== false,
      maxOutstandingPercent: emp?.salaryCreditLimits?.maxOutstandingPercent ?? 60,
      dailyLimitPercent: emp?.salaryCreditLimits?.dailyLimitPercent ?? 10,
      rollingSevenDayLimitPercent: emp?.salaryCreditLimits?.rollingSevenDayLimitPercent ?? 25,
    },
    bankAccount: emp?.bankAccount || '',
    bankName: emp?.bankName || '',
    shiftStart: emp?.shiftStart || '',
    shiftEnd: emp?.shiftEnd || '',
    outlet: emp?.outlet?._id || emp?.outlet || '',
    deviceEmployeeNo: emp?.deviceEmployeeNo || '',
  });

  // Initialize form state only when opening for a different target (new vs specific employee id).
  // Don't reset on close — that would wipe data during Face ID overlay round-trip.
  // Reset on close happens explicitly via closeEmpModal() below.
  useEffect(() => {
    if (!empModal) return;
    const key = empModal === 'new' ? 'new' : empModal._id;
    if (empFormInitForRef.current !== key) {
      empFormInitForRef.current = key;
      setEmpFormState(buildInitialForm(empModal === 'new' ? null : empModal));
    }
  }, [empModal]);

  const closeEmpModal = () => {
    setEmpModal(null);
    empFormInitForRef.current = null;
    setEmpFormState(null);
    setFaceCapturesGlobal([]);
  };

  // ── Data loader ────────────────────────────────────────────────────────────
  const queryParams = useMemo(() => {
    const params = {};
    if (filter === 'active')   params.active = 'true';
    if (filter === 'inactive') params.active = 'false';
    if (outletFilter) params.outlet = outletFilter;
    return params;
  }, [filter, outletFilter]);

  const { data: payload, isLoading: loading } = useGetEmployeesQuery(queryParams, listQueryOpts);
  const employeeRows = useMemo(() => (Array.isArray(payload) ? payload : []), [payload]);
  const designations = useMemo(() => [...new Set(employeeRows.map((employee) => employee.designation).filter(Boolean))].sort(), [employeeRows]);
  const departments = useMemo(() => [...new Set(employeeRows.map((employee) => employee.department).filter(Boolean))].sort(), [employeeRows]);
  const employees = useMemo(() => employeeRows.filter((employee) => {
    const q = employeeSearch.trim().toLowerCase();
    const salary = Number(employee.salary || 0);
    return (!q || `${employee.name || ''} ${employee.cnic || ''} ${employee.phone || ''} ${employee.deviceEmployeeNo || ''} ${employee.designation || ''} ${employee.department || ''} ${employee.outlet?.name || ''}`.toLowerCase().includes(q))
      && (!designationFilter || employee.designation === designationFilter)
      && (!departmentFilter || employee.department === departmentFilter)
      && (!deviceFilter || (deviceFilter === 'linked' ? Boolean(employee.deviceEmployeeNo) : !employee.deviceEmployeeNo))
      && (!faceFilter || (faceFilter === 'enrolled' ? employee.isFaceEnrolled : !employee.isFaceEnrolled))
      && (minSalary === '' || salary >= Number(minSalary))
      && (maxSalary === '' || salary <= Number(maxSalary));
  }).sort((a, b) => {
    if (employeeSort === 'salaryHigh') return Number(b.salary || 0) - Number(a.salary || 0);
    if (employeeSort === 'salaryLow') return Number(a.salary || 0) - Number(b.salary || 0);
    if (employeeSort === 'joiningNewest') return new Date(b.joiningDate || 0) - new Date(a.joiningDate || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  }), [employeeRows, employeeSearch, designationFilter, departmentFilter, faceFilter, deviceFilter, minSalary, maxSalary, employeeSort]);

  const refreshEmployees = () => dispatch(baseApi.util.invalidateTags(['Employee']));

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleDeactivate = (emp) => {
    setConfirmDeactivate(null);
    deactivateEmployee(emp._id)
      .then(() => {
        dispatch(baseApi.util.invalidateTags(['Employee']));
        toast.success(`${emp.name} deactivated.`);
      })
      .catch(() => toast.error('Failed to deactivate employee.'));
  };

  const handleReactivate = (emp) => {
    updateEmployee(emp._id, { isActive: true })
      .then(() => {
        dispatch(baseApi.util.invalidateTags(['Employee']));
        toast.success(`${emp.name} reactivated.`);
      })
      .catch(() => toast.error('Failed to reactivate employee.'));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const activeEmps = employees.filter((e) => e.isActive).length;
  const inactiveEmps = employees.filter((e) => !e.isActive).length;
  const enrolledFace = employees.filter((e) => e.isFaceEnrolled).length;
  const fmtPKR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
  const totalSalary = employees.filter((e) => e.isActive).reduce((s, e) => s + (e.salary || 0), 0);

  const downloadEmployeesExcel = () => {
    if (!employees.length) {
      toast.error('There are no employees to export in the current view.');
      return;
    }

    const headers = [
      'Name', 'CNIC', 'Phone', 'Address', 'Designation', 'Department',
      'Outlet', 'Outlet Code', 'Joining Date', 'Monthly Salary (PKR)',
      'Salary Day', 'Paid Off-Duty Days', 'Bank Name', 'Bank Account', 'Shift Start', 'Shift End',
      'Daily Credit Limit (%)', 'Rolling 7-Day Limit (%)', 'Maximum Outstanding (%)',
      'Cash Advance Enabled', 'Charge to Salary Enabled',
      'Device Employee No.', 'Face ID Enrolled', 'Status',
    ];
    const rows = employees.map((employee) => [
      employee.name || '',
      employee.cnic || '',
      employee.phone || '',
      employee.address || '',
      employee.designation || '',
      employee.department || '',
      employee.outlet?.name || '',
      employee.outlet?.code || '',
      employee.joiningDate ? String(employee.joiningDate).slice(0, 10) : '',
      Number(employee.salary || 0),
      Number(employee.salaryDate || 0),
      Number(employee.paidOffDutyDays ?? 4),
      employee.bankName || '',
      employee.bankAccount || '',
      employee.shiftStart || '',
      employee.shiftEnd || '',
      Number(employee.salaryCreditLimits?.dailyLimitPercent ?? 10),
      Number(employee.salaryCreditLimits?.rollingSevenDayLimitPercent ?? 25),
      Number(employee.salaryCreditLimits?.maxOutstandingPercent ?? 60),
      employee.salaryCreditLimits?.cashAdvanceEnabled === false ? 'No' : 'Yes',
      employee.salaryCreditLimits?.chargeToSalaryEnabled === false ? 'No' : 'Yes',
      employee.deviceEmployeeNo || '',
      employee.isFaceEnrolled ? 'Yes' : 'No',
      employee.isActive ? 'Active' : 'Inactive',
    ]);

    const xmlRows = [
      `<Row ss:Height="26">${headers.map((header) => excelCell(header, 'String', 'Header')).join('')}</Row>`,
      ...rows.map((row) => `<Row>${row.map((value, index) => {
        if (index === 9) return excelCell(value, 'Number', 'Currency');
        if ([10, 11, 16, 17, 18].includes(index)) return excelCell(value, 'Number', 'Number');
        return excelCell(value);
      }).join('')}</Row>`),
    ].join('');

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="Header"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#4F46E5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Body"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  <Style ss:ID="Currency"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  <Style ss:ID="Number"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
 </Styles>
 <Worksheet ss:Name="Employees">
  <Table>${headers.map((_, index) => `<Column ss:Width="${index === 3 ? 180 : index === 0 ? 130 : index === 9 ? 105 : 95}"/>`).join('')}${xmlRows}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><DoNotDisplayGridlines/></WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${rows.length + 1}C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employees-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${employees.length} employee${employees.length === 1 ? '' : 's'}.`);
  };

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={Users}
        eyebrow="Team"
        title="Employees"
        subtitle="Manage boutique staff, compensation, schedules, and attendance."
        accent="indigo"
        compact
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={Download}
              onClick={downloadEmployeesExcel}
              disabled={loading || employees.length === 0}
            >
              Export Excel
            </Button>
            {canManage && (
              <>
                <Button
                  variant="secondary"
                  icon={Upload}
                  onClick={() => setBulkImportOpen(true)}
                >
                  Import Employees
                </Button>
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setEmpModal('new')}
                >
                  Add Employee
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Active" value={activeEmps} icon={Users} gradient="indigo" />
        <StatTile label="Inactive" value={inactiveEmps} icon={UserX} gradient="slate" />
        <StatTile label="Face ID Enrolled" value={enrolledFace} icon={ScanFace} gradient="cyan" />
        <StatTile label="Monthly Payroll" value={fmtPKR(totalSalary)} icon={Wallet} gradient="emerald" />
      </div>

      {/* Filter bar */}
      <FilterBar>
        <input value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="Search name, phone, role, or device ID…" className="min-w-[260px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { value: 'active',   label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all',      label: 'All' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === value
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {outlets.length > 0 && (
          <div className="min-w-[200px]">
            <SearchableSelect
              options={[
                { value: '', label: 'All Outlets' },
                ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' })),
              ]}
              value={outletFilter}
              onChange={setOutletFilter}
            />
          </div>
        )}
        <div className="min-w-[180px]"><SearchableSelect options={[{ value: '', label: 'All designations' }, ...designations.map((value) => ({ value, label: value }))]} value={designationFilter} onChange={setDesignationFilter} /></div>
        <div className="min-w-[180px]"><SearchableSelect options={[{ value: '', label: 'All departments' }, ...departments.map((value) => ({ value, label: value }))]} value={departmentFilter} onChange={setDepartmentFilter} /></div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'Any Face ID state' }, { value: 'enrolled', label: 'Face ID enrolled' }, { value: 'not-enrolled', label: 'Face ID not enrolled' }]} value={faceFilter} onChange={setFaceFilter} /></div>
        <div className="min-w-[170px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'Any device ID state' }, { value: 'linked', label: 'Device ID linked' }, { value: 'unlinked', label: 'Device ID not linked' }]} value={deviceFilter} onChange={setDeviceFilter} /></div>
        <input type="number" min="0" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} placeholder="Minimum salary" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} placeholder="Maximum salary" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'name', label: 'Employee name' }, { value: 'salaryHigh', label: 'Highest salary' }, { value: 'salaryLow', label: 'Lowest salary' }, { value: 'joiningNewest', label: 'Newest joining' }]} value={employeeSort} onChange={setEmployeeSort} /></div>
        <div className="ml-auto text-xs text-gray-400">
          {employees.length} employee{employees.length === 1 ? '' : 's'}
        </div>
      </FilterBar>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Team Roster</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${employees.length} ${filter === 'all' ? 'total' : filter} · ${enrolledFace} face-enrolled`}
            </p>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Users size={36} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-sm font-medium text-slate-500">
              {filter === 'active'   ? 'No active employees found.'
                : filter === 'inactive' ? 'No inactive employees found.'
                : 'No employees found.'}
            </p>
            <p className="text-xs text-gray-400 -mt-2">
              {filter === 'all' ? 'Click "Add Employee" to get started.' : 'Try switching to "All" to see everyone.'}
            </p>
          </div>
        ) : (
          <EmployeeRoster employees={employees} renderActions={(emp) => (
<div className="flex flex-wrap items-center gap-2">
                        {canManage && (
                          <button
                            onClick={() => setEmpModal(emp)}
                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 size={15} /> Edit
                          </button>
                        )}
                        {canManage && emp.isActive && (
                          <button
                            onClick={() => setConfirmDeactivate(emp)}
                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Deactivate"
                          >
                            <UserX size={15} /> Deactivate
                          </button>
                        )}
                        {canManage && !emp.isActive && (
                          <button
                            onClick={() => handleReactivate(emp)}
                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Reactivate"
                          >
                            <UserCheck size={15} /> Reactivate
                          </button>
                        )}
                        {!canManage && <span className="text-xs text-gray-400">View only</span>}
                      </div>
          )} />
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {bulkImportOpen && (
        <EmployeeBulkImportModal
          outlets={outlets}
          onClose={() => setBulkImportOpen(false)}
          onImported={refreshEmployees}
        />
      )}

      {empModal && empFormState && (
        <EmployeeModal
          employee={empModal === 'new' ? null : empModal}
          outlets={outlets}
          onClose={closeEmpModal}
          onSaved={refreshEmployees}
          onRequestFaceEnroll={(employee) => {
            // Keep EmployeeModal mounted (so form state persists) and overlay Face ID.
            setFaceEnrollEmployee(employee);
            setFaceEnrollOpen(true);
          }}
          faceCapturesFromParent={faceCapturesGlobal}
          formState={empFormState}
          setFormState={setEmpFormState}
        />
      )}

      {faceEnrollOpen && (
        <FaceEnrollmentModal
          employee={faceEnrollEmployee}
          onClose={() => {
            setFaceEnrollOpen(false);
            setFaceEnrollEmployee(null);
          }}
          onComplete={(captures) => {
            setFaceCapturesGlobal(captures);
            setFaceEnrollOpen(false);
            setFaceEnrollEmployee(null);
            toast.success('Face capture completed. Save the employee to enroll Face ID.');
          }}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(confirmDeactivate)}
        title="Deactivate Employee"
        message={confirmDeactivate
          ? `Are you sure you want to deactivate ${confirmDeactivate.name}? They will no longer appear in active employee lists.`
          : ''}
        confirmLabel="Deactivate"
        variant="danger"
        onConfirm={() => handleDeactivate(confirmDeactivate)}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
};

export default EmployeeManager;
