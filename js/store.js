// In-app purchases. Web build = test purchase confirm; native build hooks in here (see README).
import { CONFIG } from './config.js';
import { state, grant, persist } from './storage.js';

export const Store = {
  products: () => CONFIG.products.filter((p) => !(p.once && state.bought.includes(p.id))),
  find: (id) => CONFIG.products.find((p) => p.id === id),

  async purchase(id) {
    const p = Store.find(id);
    if (!p) return false;
    let ok = false;
    const plugin = window.CdvPurchase;
    if (plugin && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      // TODO(native): wire cordova-plugin-purchase here once the Play Console products exist.
      ok = false;
    } else {
      ok = window.confirm(`TEST PURCHASE\n${p.title} for ${p.price}?\n(Real billing is enabled in the Android build.)`);
    }
    if (!ok) return false;
    if (p.once) state.bought.push(id);
    grant(p.grant);
    persist();
    return true;
  },

  async restore() { return state.bought.length; },
};
