// Tiny WebAudio synth: no audio assets, so the APK stays small and offline-friendly.
import { state } from './storage.js';

let ctx = null, master = null, lastPop = 0;
const PENTA = [0, 2, 4, 7, 9];

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
  if (!state.sound || !ensure()) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock: ensure,
  click() { tone(520, 0.07, 'triangle', 0.18); },
  tap() { tone(300, 0.09, 'sine', 0.3, 0, 1.8); },
  charge(v) { tone(260 + v * 90, 0.1, 'triangle', 0.22); },
  // pitch climbs with the chain, so long cascades literally sing
  pop(i) {
    const now = performance.now();
    if (now - lastPop < 28) return;
    lastPop = now;
    const semis = PENTA[i % 5] + 12 * Math.min(3, Math.floor(i / 5));
    const f = 330 * Math.pow(2, semis / 12);
    tone(f, 0.28, 'sine', 0.3);
    tone(f * 2, 0.16, 'triangle', 0.1);
  },
  shard() { tone(900, 0.12, 'sawtooth', 0.04, 0, 0.5); },
  stone() { tone(120, 0.15, 'square', 0.12, 0, 0.6); },
  coin() { tone(988, 0.08, 'square', 0.1); tone(1319, 0.14, 'square', 0.1, 0.07); },
  win() { [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.3, 'triangle', 0.25, k * 0.1)); },
  star() { tone(880, 0.2, 'sine', 0.25); tone(1320, 0.3, 'sine', 0.2, 0.06); },
  fail() { [330, 262, 196].forEach((f, k) => tone(f, 0.3, 'sawtooth', 0.12, k * 0.14)); },
  error() { tone(160, 0.14, 'square', 0.12); },
};

export function haptic(ms = 12) {
  if (state.haptic && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}
