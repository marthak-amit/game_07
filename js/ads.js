// Ad abstraction. The game only ever calls Ads.showRewarded()/Ads.showInterstitial().
//  - In a browser it shows a clearly-labelled TEST ad overlay so every ad flow can be played end-to-end.
//  - Inside the Capacitor Android app it uses @capacitor-community/admob (see README for setup).
import { CONFIG } from './config.js';
import { state, persist } from './storage.js';

const native = () => window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
const admob = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;

let busy = false;

function mockAd(kind) {
  return new Promise((resolve) => {
    const secs = kind === 'rewarded' ? 3 : 2;
    const el = document.createElement('div');
    el.className = 'mock-ad';
    el.innerHTML = `<div class="mock-ad-box"><div class="mock-ad-tag">TEST AD · ${kind}</div>
      <div class="mock-ad-title">Your ad plays here</div>
      <div class="mock-ad-count"></div><button class="btn mock-ad-close" disabled>Close</button></div>`;
    document.body.appendChild(el);
    const count = el.querySelector('.mock-ad-count'), btn = el.querySelector('.mock-ad-close');
    let left = secs;
    const tick = () => {
      if (left > 0) { count.textContent = kind === 'rewarded' ? `Reward in ${left}s` : `Skip in ${left}s`; left--; setTimeout(tick, 1000); }
      else { count.textContent = kind === 'rewarded' ? 'Reward ready!' : 'Done'; btn.disabled = false; }
    };
    tick();
    btn.onclick = () => { el.remove(); resolve(true); };
  });
}

export const Ads = {
  async init() {
    if (native() && admob()) {
      try { await admob().initialize({ initializeForTesting: CONFIG.admob.testing }); } catch (e) { /* offline */ }
    }
  },

  canShowInterstitial(level) {
    const a = CONFIG.ads;
    return !state.noAds && level >= a.interstitialFromLevel &&
      state.winsSinceAd >= a.interstitialEveryNWins && Date.now() - state.lastAdAt > a.interstitialMinGapMs;
  },

  noteWin() { state.winsSinceAd++; persist(); },

  async showInterstitial() {
    if (state.noAds || busy) return false;
    busy = true;
    try {
      if (native() && admob()) {
        await admob().prepareInterstitial({ adId: CONFIG.admob.interstitial, isTesting: CONFIG.admob.testing });
        await admob().showInterstitial();
      } else {
        await mockAd('interstitial');
      }
      state.winsSinceAd = 0; state.lastAdAt = Date.now(); persist();
      return true;
    } catch (e) { return false; } finally { busy = false; }
  },

  // Resolves true only if the player earned the reward.
  async showRewarded() {
    if (busy) return false;
    busy = true;
    try {
      if (native() && admob()) {
        const ad = admob();
        await ad.prepareRewardVideoAd({ adId: CONFIG.admob.rewarded, isTesting: CONFIG.admob.testing });
        return await new Promise((resolve) => {
          let rewarded = false;
          const subs = [];
          const done = () => { subs.forEach((s) => s && s.remove && s.remove()); resolve(rewarded); };
          Promise.all([
            ad.addListener('onRewardedVideoAdReward', () => { rewarded = true; }),
            ad.addListener('onRewardedVideoAdDismissed', done),
            ad.addListener('onRewardedVideoAdFailedToShow', done),
          ]).then((s) => { subs.push(...s); return ad.showRewardVideoAd(); }).catch(done);
        });
      }
      return await mockAd('rewarded');
    } catch (e) { return false; } finally { busy = false; }
  },
};
