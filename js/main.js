// Bloom Chain — screens, economy and flow glue.
import { CONFIG } from './config.js';
import { state, persist, onChange, todayStr, yesterdayStr, grant, resetAll } from './storage.js';
import { generateLevel, generateDaily, starsFor } from './engine.js';
import { Game, SKINS, worldOf } from './game.js';
import { sfx, haptic } from './audio.js';
import { Ads } from './ads.js';
import { Store } from './store.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const E = CONFIG.economy;

const game = new Game($('#c'));
let current = null; // { type: 'level', n } | { type: 'daily', date }
let spec = null;

// ---------- small helpers ----------

function bind() {
  const set = (k, v) => $$(`[data-bind="${k}"]`).forEach((el) => { el.textContent = v; });
  const flag = (k, on) => $$(`[data-bind="${k}"]`).forEach((el) => el.classList.toggle('on', on));
  set('coins', state.coins.toLocaleString());
  set('hints', state.hints); set('undos', state.undos);
  $$('[data-bind="hints"]').forEach((el) => el.classList.toggle('zero', state.hints === 0));
  $$('[data-bind="undos"]').forEach((el) => el.classList.toggle('zero', state.undos === 0));
  $$('[data-bind="hints"]').forEach((el) => { if (state.hints === 0) el.textContent = '▶'; });
  $$('[data-bind="undos"]').forEach((el) => { if (state.undos === 0) el.textContent = '▶'; });
  set('levelLabel', `Level ${state.level}`);
  const dailyOpen = state.dailyDone !== todayStr();
  set('dailyLabel', dailyOpen ? 'New puzzle today · bonus reward' : 'Completed ✓ · come back tomorrow');
  flag('dailyDot', dailyOpen);
  flag('giftDot', rewardAvailable());
}
onChange(bind);

let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 1900);
}

function modal(html, { dismiss = true, cls = '' } = {}) {
  closeModal();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="card ${cls}">${dismiss ? '<button class="round x" data-close aria-label="Close">✕</button>' : ''}${html}</div>`;
  $('#modal-root').appendChild(o);
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || (dismiss && e.target === o)) { sfx.click(); closeModal(); }
  });
  return o;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function wire(root, map) {
  root.querySelectorAll('[data-m]').forEach((el) => {
    el.addEventListener('click', () => { sfx.click(); const fn = map[el.dataset.m]; fn && fn(el); });
  });
}

function show(screen) {
  $('#home').classList.toggle('hidden', screen !== 'home');
  $('#hud').classList.toggle('hidden', screen !== 'hud');
  if (screen === 'home') { game.setMenu(); game.setInsets(0, 0); }
  else {
    const top = 150 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0);
    game.setInsets(top, 118);
  }
}

function setWorld(hue) { document.documentElement.style.setProperty('--hue', hue); }

// ---------- level flow ----------

const TIPS = {
  1: 'Tap an orb. At 4 charge it bursts and shoots 4 sparks!',
  2: 'Sparks charge every orb they hit. Plan your taps!',
  3: 'Fewer taps = more stars ⭐',
  6: 'Stones block sparks. Hit them twice to crush them.',
  12: 'Mirrors bend sparks 90°. Use them for trick shots!',
};

function startLevel(n) {
  current = { type: 'level', n };
  spec = generateLevel(n);
  beginPlay(worldOf(n), `Level ${n}`, worldOf(n).name, TIPS[n]);
}

function startDaily() {
  const date = todayStr();
  current = { type: 'daily', date };
  spec = generateDaily(date);
  beginPlay({ name: 'Daily Challenge', hue: 175 }, 'Daily Challenge', date, null);
}

function beginPlay(world, title, sub, tip) {
  closeModal();
  setWorld(world.hue);
  show('hud');
  game.load(spec, world);
  $('[data-bind="hudTitle"]').textContent = title;
  $('[data-bind="hudWorld"]').textContent = sub;
  $('[data-bind="par"]').textContent = `⭐⭐⭐ in ${spec.par} ${spec.par === 1 ? 'tap' : 'taps'}`;
  const tipEl = $('#tip');
  if (tip && !state.seenTips[tip]) {
    tipEl.textContent = tip; tipEl.classList.remove('hidden');
    state.seenTips[tip] = 1; persist();
    setTimeout(() => tipEl.classList.add('hidden'), 6000);
  } else tipEl.classList.add('hidden');
  state.played++; persist(); bind();
}

game.cb.onTaps = (n) => {
  const el = $('[data-bind="taps"]');
  el.textContent = n; el.classList.toggle('low', n <= 1);
  $('#tip').classList.add('hidden');
};

game.cb.onWin = ({ used, maxCombo, bursts }) => {
  const stars = starsFor(used, spec.par);
  let coins = E.winBase + stars * E.winPerStar + (maxCombo >= E.comboBonusAt ? E.comboBonus : 0);
  let extra = '';
  if (current.type === 'level') {
    const key = current.n;
    state.stars[key] = Math.max(state.stars[key] || 0, stars);
    if (current.n === state.level) state.level++;
  } else if (state.dailyDone !== current.date) {
    coins += 100;
    state.dailyDone = current.date;
    state.dailyStreak = state.lastDailyWin === yesterdayStr() ? state.dailyStreak + 1 : 1;
    state.lastDailyWin = current.date;
    state.hints += 1;
    extra = `<p>Daily bonus! +1 💡 · Streak ${state.dailyStreak} 🔥</p>`;
  }
  state.wins++; state.bestCombo = Math.max(state.bestCombo, maxCombo); state.totalBursts += bursts;
  grant({ coins }); Ads.noteWin();
  showWin({ stars, coins, maxCombo, extra });
};

game.cb.onLose = () => showLose();

function showWin({ stars, coins, maxCombo, extra }) {
  const retry = stars < 3 && current.type === 'level';
  const m = modal(`
    <h2>${stars === 3 ? 'PERFECT!' : 'Level Clear!'}</h2>
    <div class="stars"><span>⭐</span><span>⭐</span><span>⭐</span></div>
    <p>Best chain <b>x${maxCombo}</b> · ${game.used} ${game.used === 1 ? 'tap' : 'taps'}</p>
    <div class="reward">+${coins} 🪙</div>${extra}
    <div class="stack">
      <button class="btn primary" data-m="next">${current.type === 'level' ? 'Next Level ▶' : 'Home'}</button>
      <button class="btn gold" data-m="double">🎬 Double coins (+${coins})</button>
      ${retry ? '<button class="btn" data-m="retry">↻ Retry for ⭐⭐⭐</button>' : ''}
    </div>`, { dismiss: false });
  [...m.querySelectorAll('.stars span')].forEach((s, k) => {
    if (k < stars) setTimeout(() => { s.classList.add('on'); sfx.star(); haptic(15); }, 350 + k * 300);
  });
  wire(m, {
    next: async () => {
      if (current.type === 'level') {
        if (Ads.canShowInterstitial(current.n)) await Ads.showInterstitial();
        startLevel(state.level);
      } else goHome();
    },
    double: async (el) => {
      el.disabled = true;
      if (await Ads.showRewarded()) { grant({ coins }); sfx.coin(); toast(`+${coins} 🪙`); el.remove(); } else { el.disabled = false; toast('Ad not completed'); }
    },
    retry: () => startLevel(current.n),
  });
}

function showLose() {
  const n = E.extraTapsOnContinue;
  const m = modal(`
    <h2>Out of taps!</h2>
    <p>${spec ? 'So close — keep your chain alive.' : ''}</p>
    <div class="stack">
      <button class="btn green" data-m="ad">🎬 +${n} Taps · Free</button>
      <button class="btn gold" data-m="coins">+${n} Taps · 🪙${E.continueCoinCost}</button>
      <button class="btn" data-m="retry">↻ Restart</button>
      <button class="btn" data-m="home">Home</button>
    </div>`, { dismiss: false });
  wire(m, {
    ad: async (el) => {
      el.disabled = true;
      if (await Ads.showRewarded()) { closeModal(); game.addTaps(n); } else { el.disabled = false; toast('Ad not completed'); }
    },
    coins: () => {
      if (state.coins < E.continueCoinCost) { toast('Not enough coins'); sfx.error(); return; }
      state.coins -= E.continueCoinCost; persist(); closeModal(); game.addTaps(n);
    },
    retry: () => (current.type === 'level' ? startLevel(current.n) : startDaily()),
    home: goHome,
  });
}

// ---------- power-ups ----------

function offer(kind, label, cost, onGot) {
  const m = modal(`
    <h2>${label}</h2>
    <p>Get one now:</p>
    <div class="stack">
      <button class="btn green" data-m="ad">🎬 Watch ad · Free</button>
      <button class="btn gold" data-m="buy">🪙 ${cost} Coins</button>
      <button class="btn" data-m="shop">Get more coins</button>
    </div>`);
  wire(m, {
    ad: async (el) => { el.disabled = true; if (await Ads.showRewarded()) { closeModal(); onGot(); } else { el.disabled = false; toast('Ad not completed'); } },
    buy: () => { if (state.coins < cost) { toast('Not enough coins'); sfx.error(); return; } state.coins -= cost; persist(); closeModal(); onGot(); },
    shop: showShop,
  });
}

function doHint() {
  if (game.phase !== 'idle') return;
  const apply = () => { if (game.hint()) { sfx.star(); } else toast('No clear route — try Undo or Restart'); };
  if (state.hints > 0) { if (game.hint()) { state.hints--; persist(); sfx.star(); } else toast('No clear route — try Undo or Restart'); }
  else offer('hint', '💡 Out of hints', E.hintCost, apply);
}
function doUndo() {
  if (game.phase !== 'idle') return;
  if (!game.canUndo()) { toast('Nothing to undo'); return; }
  if (state.undos > 0) { state.undos--; persist(); game.undo(); }
  else offer('undo', '↩ Out of undos', E.undoCost, () => game.undo());
}
function doTaps() {
  if (game.phase !== 'idle') return;
  if (state.coins >= E.tapsCost) { state.coins -= E.tapsCost; persist(); game.addTaps(2); sfx.coin(); }
  else offer('taps', '➕ +2 Taps', E.tapsCost, () => game.addTaps(2));
}

// ---------- home / rewards / shop / skins / settings ----------

function goHome() { closeModal(); setWorld(262); show('home'); bind(); }

function rewardAvailable() { return state.lastReward !== todayStr(); }

function showReward() {
  const today = todayStr();
  const claimed = state.lastReward === today;
  const day = claimed ? state.rewardDay : (state.lastReward === yesterdayStr() ? (state.rewardDay + 1) % 7 : 0);
  const label = (r) => [r.coins ? `🪙${r.coins}` : '', r.hints ? `💡${r.hints}` : '', r.undos ? `↩${r.undos}` : ''].filter(Boolean).join(' ');
  const days = CONFIG.dailyRewards.map((r, k) =>
    `<div class="day ${k === day && !claimed ? 'cur' : ''} ${k < day || (k === day && claimed) ? 'done' : ''} ${k === 6 ? 'big' : ''}">Day ${k + 1}<b>${label(r)}</b></div>`).join('');
  const m = modal(`
    <h2>🎁 Daily Gift</h2>
    <p>Come back every day — day 7 is huge.</p>
    <div class="days">${days}</div>
    <div class="stack">
      ${claimed ? '<button class="btn" disabled>Claimed ✓ — see you tomorrow</button>'
        : '<button class="btn primary" data-m="claim">Claim</button><button class="btn gold" data-m="claim2">🎬 Claim x2</button>'}
    </div>`);
  const doClaim = (mult) => {
    const r = CONFIG.dailyRewards[day];
    const g = {}; Object.keys(r).forEach((k) => { g[k] = r[k] * mult; });
    state.rewardDay = day; state.lastReward = today;
    grant(g); sfx.coin(); closeModal(); toast(`Claimed ${label(g)}`);
  };
  wire(m, {
    claim: () => doClaim(1),
    claim2: async (el) => { el.disabled = true; if (await Ads.showRewarded()) doClaim(2); else { el.disabled = false; toast('Ad not completed'); } },
  });
}

function showShop() {
  const free = Date.now() - state.lastFreeCoinAt > E.rewardedCooldownMs;
  const prods = Store.products().map((p) => `
    <div class="row">${p.badge ? `<span class="tag">${p.badge}</span>` : ''}
      <span class="ico">${p.grant.noAds ? '🚫' : p.id === 'starter_pack' ? '🎁' : '🪙'}</span>
      <div class="t">${p.title}<small>${p.id === 'starter_pack' ? '1200 🪙 + 5 💡 + 5 ↩' : p.grant.noAds ? 'No pop-up ads + 300 🪙 (reward ads stay optional)' : ''}</small></div>
      <button class="btn gold" data-m="buy" data-id="${p.id}">${p.price}</button></div>`).join('');
  const m = modal(`
    <h2>Shop</h2>
    <div class="list">
      <div class="row"><span class="ico">🎬</span><div class="t">Free coins<small>Watch a short ad</small></div>
        <button class="btn green" data-m="free" ${free ? '' : 'disabled'}>+${E.rewardedCoins} 🪙</button></div>
      ${prods}
      <div class="row"><span class="ico">💡</span><div class="t">Hint<small>Show the best next tap</small></div><button class="btn" data-m="bhint">🪙${E.hintCost}</button></div>
      <div class="row"><span class="ico">↩</span><div class="t">Undo<small>Take back a tap</small></div><button class="btn" data-m="bundo">🪙${E.undoCost}</button></div>
    </div>`);
  const buyItem = (key, cost) => {
    if (state.coins < cost) { toast('Not enough coins'); sfx.error(); return; }
    state.coins -= cost; state[key]++; persist(); sfx.coin(); toast('Purchased!');
  };
  wire(m, {
    free: async (el) => {
      el.disabled = true;
      if (await Ads.showRewarded()) { state.lastFreeCoinAt = Date.now(); grant({ coins: E.rewardedCoins }); sfx.coin(); toast(`+${E.rewardedCoins} 🪙`); showShop(); }
      else { el.disabled = false; toast('Ad not completed'); }
    },
    buy: async (el) => { if (await Store.purchase(el.dataset.id)) { sfx.coin(); toast('Thank you! 💖'); showShop(); } },
    bhint: () => buyItem('hints', E.hintCost),
    bundo: () => buyItem('undos', E.undoCost),
  });
}

function showSkins() {
  const cards = Object.entries(SKINS).map(([id, s]) => {
    const owned = state.skins.includes(id);
    return `<button class="skin ${state.skin === id ? 'sel' : ''}" data-m="skin" data-id="${id}">
      <div class="sw">${s.cols.map((c) => `<i style="background:${c};color:${c}"></i>`).join('')}</div>
      ${s.name}<small style="display:block;opacity:.8">${state.skin === id ? 'Equipped' : owned ? 'Tap to equip' : '🪙 ' + s.price}</small></button>`;
  }).join('');
  const m = modal(`<h2>Skins</h2><p>Make your chains shine.</p><div class="skins">${cards}</div>`);
  wire(m, {
    skin: (el) => {
      const id = el.dataset.id, s = SKINS[id];
      if (!state.skins.includes(id)) {
        if (state.coins < s.price) { toast('Not enough coins'); sfx.error(); return; }
        state.coins -= s.price; state.skins.push(id);
      }
      state.skin = id; persist(); game.sprites.clear(); showSkins();
    },
  });
}

function showSettings() {
  const sw = (key, label) => `<div class="switch" data-m="tog" data-key="${key}">${label}<div class="tog ${state[key] ? 'on' : ''}"></div></div>`;
  const m = modal(`
    <h2>Settings</h2>
    <div class="list">${sw('sound', '🔊 Sound')}${sw('haptic', '📳 Vibration')}</div>
    <p style="margin-top:14px">Levels cleared: <b>${Math.max(0, state.level - 1)}</b> · Best chain: <b>x${state.bestCombo}</b></p>
    <div class="stack">
      <button class="btn" data-m="restore">Restore purchases</button>
      <button class="btn" data-m="reset">Reset progress</button>
    </div>
    <p style="font-size:12px;opacity:.55">v${CONFIG.version}</p>`);
  wire(m, {
    tog: (el) => { const k = el.dataset.key; state[k] = !state[k]; persist(); showSettings(); },
    restore: async () => { await Store.restore(); toast('Purchases restored'); },
    reset: () => { if (window.confirm('Erase ALL progress?')) { resetAll(); closeModal(); bind(); toast('Progress reset'); } },
  });
}

// ---------- global actions ----------

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  sfx.unlock(); sfx.click();
  switch (b.dataset.act) {
    case 'play': startLevel(state.level); break;
    case 'daily':
      if (state.dailyDone === todayStr()) { toast('Daily done! New puzzle tomorrow'); } else startDaily();
      break;
    case 'shop': showShop(); break;
    case 'skins': showSkins(); break;
    case 'reward': showReward(); break;
    case 'settings': showSettings(); break;
    case 'home': goHome(); break;
    case 'pu-hint': doHint(); break;
    case 'pu-undo': doUndo(); break;
    case 'pu-taps': doTaps(); break;
    case 'pu-retry': current.type === 'level' ? startLevel(current.n) : startDaily(); break;
    default: break;
  }
});

// debug/test hook (also handy for QA in the browser console)
window.__bloom = { game, state, startLevel, startDaily, showWin, showLose, showShop, showSkins, showReward, showSettings, goHome, spec: () => spec };

// ---------- boot ----------

Ads.init();
goHome();
bind();
if (rewardAvailable()) setTimeout(() => { if (!$('#home').classList.contains('hidden')) showReward(); }, 500);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
