let audioContext = null;
let unlocked = false;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener(unlocked));

const getContext = () => {
  if (audioContext) return audioContext;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext = new AudioContext();
  return audioContext;
};

const tone = (context, frequency, startsAt, duration, volume = 0.13) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.02);
};

const vibrate = (pattern) => {
  try { window.navigator?.vibrate?.(pattern); } catch {}
};

export const isCustomerOrderSoundUnlocked = () => unlocked;

export const subscribeCustomerOrderSound = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Mobile browsers require a user gesture before a page can play audio. The
// Place Order click calls this automatically; the status page also exposes a
// manual control for guests who reload or reopen the page.
export const unlockCustomerOrderSound = async ({ confirmation = true } = {}) => {
  const context = getContext();
  if (!context) return false;
  try {
    await context.resume();
    unlocked = context.state === 'running';
    if (unlocked && confirmation) {
      const now = context.currentTime + 0.015;
      tone(context, 659, now, 0.1, 0.075);
      tone(context, 880, now + 0.11, 0.16, 0.09);
    }
  } catch {
    unlocked = false;
  }
  notify();
  return unlocked;
};

export const playCustomerOrderAlert = (kind = 'status') => {
  const context = getContext();
  if (!unlocked || !context || context.state !== 'running') {
    if (unlocked) {
      unlocked = false;
      notify();
    }
    return false;
  }

  const now = context.currentTime + 0.015;
  if (kind === 'cancelled') {
    tone(context, 440, now, 0.18, 0.14);
    tone(context, 330, now + 0.2, 0.24, 0.15);
    vibrate([180, 90, 260]);
  } else if (kind === 'ready') {
    tone(context, 659, now, 0.13);
    tone(context, 880, now + 0.14, 0.13);
    tone(context, 1175, now + 0.28, 0.24, 0.15);
    vibrate([100, 60, 100, 60, 180]);
  } else {
    tone(context, 587, now, 0.12);
    tone(context, 784, now + 0.13, 0.2);
    vibrate([120, 70, 160]);
  }
  return true;
};
