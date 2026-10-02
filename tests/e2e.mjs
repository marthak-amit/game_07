const { chromium } = await import(process.env.PW_PATH || 'playwright');
const out = process.env.SHOTS || '/tmp/claude-0/shots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(async () => chromium.launch({ args: ['--no-sandbox'] }));
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await p.goto('http://localhost:8099/index.html');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/1-reward.png` });
await p.click('[data-m=claim]');
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/2-home.png` });
await p.click('[data-act=play]');
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/3-level1.png` });
// tap the solution cell
const pos = await p.evaluate(() => { const g = window.__bloom.game, s = window.__bloom.spec(); const i = s.solution[0]; return g.cellPx(i); });
await p.mouse.click(pos[0], pos[1]);
await p.waitForTimeout(450);
await p.screenshot({ path: `${out}/4-burst.png` });
await p.waitForTimeout(2200);
await p.screenshot({ path: `${out}/5-win.png` });
// double-coin rewarded flow
await p.click('[data-m=double]');
await p.waitForTimeout(3600);
await p.click('.mock-ad-close');
await p.waitForTimeout(300);
await p.click('[data-m=next]');
await p.waitForTimeout(500);
// level with stones+mirrors, play its solution
for (const lvl of [8, 25]) {
  await p.evaluate((l) => window.__bloom.startLevel(l), lvl);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/6-level${lvl}.png` });
  const sol = await p.evaluate(() => window.__bloom.spec().solution);
  for (const idx of sol) {
    const pp = await p.evaluate((i) => window.__bloom.game.cellPx(i), idx);
    await p.mouse.click(pp[0], pp[1]);
    await p.waitForTimeout(150);
    if (idx === sol[0]) await p.screenshot({ path: `${out}/7-chain${lvl}.png` });
    for (let k = 0; k < 60; k++) { if (await p.evaluate(() => window.__bloom.game.phase !== 'anim')) break; await p.waitForTimeout(100); }
  }
  await p.waitForTimeout(1800);
  const won = await p.evaluate(() => !!document.querySelector('[data-m=next]'));
  console.log('level', lvl, 'solved via UI:', won);
  await p.screenshot({ path: `${out}/8-win${lvl}.png` });
}
// lose flow
await p.evaluate(() => window.__bloom.startLevel(30));
await p.evaluate(() => { const g = window.__bloom.game; g.tapsLeft = 1; });
const first = await p.evaluate(() => { const g = window.__bloom.game; for (let i = 0; i < 48; i++) if (g.sim.T[i] === 1) return g.cellPx(i); });
await p.mouse.click(first[0], first[1]);
await p.waitForTimeout(4500);
await p.screenshot({ path: `${out}/9-lose.png` });
await p.evaluate(() => window.__bloom.showShop());
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/10-shop.png` });
await p.evaluate(() => window.__bloom.showSkins());
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/11-skins.png` });
console.log('errors:', errors);
await b.close();
