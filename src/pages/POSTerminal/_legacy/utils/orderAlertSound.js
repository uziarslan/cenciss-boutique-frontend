let audioContext = null;
let unlocked = false;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener(unlocked));

const contextForBrowser = () => {
  if (audioContext) return audioContext;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext = new AudioContext();
  return audioContext;
};

const tone = (context, frequency, startsAt, duration, volume = 0.11) => {
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

export const isOrderSoundUnlocked = () => unlocked;

export const subscribeOrderSound = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Browsers do not provide a speaker permission prompt. A deliberate click is
// the portable way to unlock Web Audio before real-time socket events arrive.
export const unlockOrderSound = async () => {
  const context = contextForBrowser();
  if (!context) return false;
  try {
    await context.resume();
    unlocked = context.state === 'running';
    if (unlocked) {
      const now = context.currentTime + 0.02;
      tone(context, 659, now, 0.12, 0.075);
      tone(context, 880, now + 0.13, 0.18, 0.09);
    }
  } catch {
    unlocked = false;
  }
  notify();
  return unlocked;
};

export const playOrderAlert = (kind = 'qr') => {
  const context = contextForBrowser();
  if (!unlocked || !context || context.state !== 'running') {
    if (unlocked) {
      unlocked = false;
      notify();
    }
    return false;
  }

  const now = context.currentTime + 0.015;
  if (kind === 'tablet') {
    tone(context, 988, now, 0.13);
    tone(context, 784, now + 0.14, 0.13);
    tone(context, 988, now + 0.28, 0.2);
  } else {
    tone(context, 587, now, 0.12);
    tone(context, 740, now + 0.13, 0.12);
    tone(context, 988, now + 0.26, 0.22);
  }
  return true;
};
