// Central tuning + monetisation config. Swap the test IDs for real ones before release.
export const CONFIG = {
  appName: 'Bloom Chain',
  version: '1.0.0',
  // Google's public AdMob TEST unit IDs (safe to ship in dev, replace for production).
  admob: {
    appIdAndroid: 'ca-app-pub-3940256099942544~3347511713',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    banner: 'ca-app-pub-3940256099942544/6300978111',
    testing: true,
  },
  ads: {
    interstitialFromLevel: 4,   // never interrupt the first levels
    interstitialEveryNWins: 2,  // show after every Nth win...
    interstitialMinGapMs: 70000, // ...but never closer than this
  },
  economy: {
    startCoins: 120,
    hintCost: 40, undoCost: 30, tapsCost: 60,
    extraTapsOnContinue: 3,
    continueCoinCost: 80,
    rewardedCoins: 50,
    rewardedCooldownMs: 30000,
    winBase: 15, winPerStar: 10, comboBonus: 10, comboBonusAt: 10,
  },
  dailyRewards: [
    { coins: 50 }, { hints: 1 }, { coins: 80 }, { undos: 2 },
    { coins: 120 }, { hints: 2 }, { coins: 300, hints: 3, undos: 2 },
  ],
  products: [
    { id: 'starter_pack', title: 'Starter Pack', price: '₹99', once: true, grant: { coins: 1200, hints: 5, undos: 5 }, badge: 'BEST DEAL' },
    { id: 'remove_ads', title: 'Remove Ads', price: '₹249', once: true, grant: { noAds: true, coins: 300 } },
    { id: 'coins_s', title: '500 Coins', price: '₹79', grant: { coins: 500 } },
    { id: 'coins_m', title: '1,500 Coins', price: '₹199', grant: { coins: 1500 }, badge: 'POPULAR' },
    { id: 'coins_l', title: '4,000 Coins', price: '₹399', grant: { coins: 4000 } },
    { id: 'coins_xl', title: '10,000 Coins', price: '₹799', grant: { coins: 10000 }, badge: 'MAX VALUE' },
  ],
};
