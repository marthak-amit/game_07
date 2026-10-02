# Bloom Chain 🌸⚡

A one-thumb **chain-reaction puzzle** for mobile. Tap an orb to charge it; at 4 it bursts and fires four sparks that charge the orbs they hit — set off a cascade that clears the board in as few taps as possible.

Built with plain HTML5 Canvas + ES modules (zero build step, free), installable as a PWA, and packaged for Android with Capacitor.

## Why it should retain & earn
| Hook | What it does |
|---|---|
| **Satisfying core** | Rising-pitch pentatonic pops, screen shake, particles, haptics, "x14 UNREAL!" combo callouts |
| **Skill, not luck** | Every level is *solver-verified* solvable (beam search), with a par. 3★ = par taps |
| **Endless content** | Procedural levels (stones from L6, mirrors from L12), 8 worlds, ramping difficulty |
| **Daily Challenge** | Same puzzle worldwide each day + streak → daily return habit |
| **Daily Gift** | 7-day reward calendar (day 7 big) |
| **Collection** | Orb skins bought with coins |

### Monetisation placements (all wired, using test ads in browser)
- **Rewarded**: +3 taps on fail (highest-converting spot), double level coins, free hint/undo/+taps, free coins in shop, daily gift x2
- **Interstitial**: after every 2nd win from level 4, min 70 s gap, hidden for payers
- **IAP** (₹): Starter Pack ₹99 (conversion driver), Remove Ads ₹249, coin packs ₹79–₹799
- Tunables live in `js/config.js`.

> Realistic note on the ₹10 lakh/month goal: the game gives you the retention + monetisation surface. Revenue is `DAU × (ad ARPDAU + IAP)`; ₹10L/month typically needs roughly 50–100k DAU with paid/organic user acquisition. Plan to soft-launch, watch D1/D7 retention, and tune `config.js`.

## Run locally
```bash
npm start            # http://localhost:8080  (or: python3 -m http.server)
npm test             # engine/solver tests
```
Ads/IAP show clearly-labelled **TEST** overlays in the browser so every flow can be played.

## Android build (Capacitor)
```bash
npm install
npx cap add android
npm run android:sync
npx cap open android      # build APK/AAB in Android Studio
```
Then, when you have the accounts:
1. **AdMob**: create app + 3 units, put real IDs in `js/config.js` (`admob.*`, `testing:false`) and the App ID in `android/app/src/main/AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`).
   `js/ads.js` already calls `@capacitor-community/admob` when running natively — verify the listener names against the plugin version you install.
2. **Billing**: create the product IDs from `config.products` in Play Console; implement the `TODO(native)` in `js/store.js` (e.g. `cordova-plugin-purchase`).
3. Add a privacy policy URL + Data Safety form (ads), age rating, store listing from `icons/`.

## Structure
```
js/engine.js   pure rules, solver, level generator (tested in node)
js/game.js     canvas renderer, input, animation director, skins/worlds
js/main.js     screens, economy, power-ups, reward flows
js/ads.js      AdMob / test-ad abstraction      js/store.js  IAP abstraction
js/audio.js    synthesized SFX                  js/storage.js save data
tests/         engine tests + Playwright e2e (PW_PATH=…/playwright/index.mjs node tests/e2e.mjs)
```
