// Persistent player state (localStorage with in-memory fallback).
import { CONFIG } from './config.js';

const KEY = 'bloomchain.save.v1';
const defaults = () => ({
  level: 1, stars: {}, coins: CONFIG.economy.startCoins, hints: 2, undos: 2,
  sound: true, haptic: true, noAds: false, bought: [],
  skin: 'neon', skins: ['neon'],
  streak: 0, rewardDay: 0, lastReward: '',
  dailyDone: '', dailyStreak: 0, lastDailyWin: '',
  played: 0, wins: 0, winsSinceAd: 0, lastAdAt: 0, lastFreeCoinAt: 0,
  bestCombo: 0, totalBursts: 0, seenTips: {},
});

let mem = null;
export const state = (() => {
  let loaded = {};
  try { loaded = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { mem = mem || {}; }
  return Object.assign(defaults(), loaded);
})();

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  listeners.forEach((fn) => fn(state));
}

export function resetAll() {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, defaults());
  persist();
}

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return todayStr(d);
}

export function grant(g) {
  if (g.coins) state.coins += g.coins;
  if (g.hints) state.hints += g.hints;
  if (g.undos) state.undos += g.undos;
  if (g.noAds) state.noAds = true;
  persist();
}
