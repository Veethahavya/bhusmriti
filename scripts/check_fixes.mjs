import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => { const el = document.querySelector('.intro'); return el && getComputedStyle(el).visibility === 'hidden'; }, { timeout: 90000 });
await p.waitForTimeout(600);
const brand = await p.locator('.brand-name').innerText();
// default fill Temp, add RH line, inspect FILL disabled
const rh = p.locator('.layer-item', { hasText: 'RH 2 m' }).first();
await rh.locator('.layer-main').click();
await p.waitForTimeout(400);
const rhState = await rh.evaluate(el => ({
  badges:[...el.querySelectorAll('.layer-badge')].map(e=>e.textContent),
  modes:[...el.querySelectorAll('.mode-switch button')].map(b=>({t:b.textContent,disabled:b.disabled,cls:b.className}))
}));
// flow blocking
const w850 = p.locator('.layer-item', { hasText: 'Wind 850' }).first();
const w850Blocked = await w850.evaluate(el => ({cls:el.className, disabled: el.querySelector('.layer-main').disabled}));
// Temp to LINES
const temp = p.locator('.layer-item', { hasText: 'Temp 2 m' }).first();
await temp.locator('.mode-switch button', { hasText: 'LINES' }).click();
await p.waitForTimeout(500);
const tempState = await temp.evaluate(el => ({badges:[...el.querySelectorAll('.layer-badge')].map(e=>e.textContent), modes:[...el.querySelectorAll('.mode-switch button')].map(b=>({t:b.textContent,disabled:b.disabled,cls:b.className}))}));
await p.screenshot({ path: '/tmp/f7-temp-line.png' });
// remove RH and temp to clear, add CAPE and switch to LINES
for (const loc of [rh, temp]) { if (await loc.locator('.layer-main').count()) await loc.locator('.layer-main').click(); await p.waitForTimeout(200); }
const cape = p.locator('.layer-item', { hasText: 'CAPE' }).first();
await cape.locator('.layer-main').click(); await p.waitForTimeout(300);
await cape.locator('.mode-switch button', { hasText: 'LINES' }).click(); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/f7-cape-line.png' });
// remove cape, add snow line
await cape.locator('.layer-main').click(); await p.waitForTimeout(200);
const snow = p.locator('.layer-item', { hasText: 'Snow' }).first();
await snow.locator('.layer-main').click(); await p.waitForTimeout(300);
await snow.locator('.mode-switch button', { hasText: 'LINES' }).click(); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/f7-snow-line.png' });
// legend info popup (snow selected)
await p.locator('.legend-info').click(); await p.waitForTimeout(250);
const info = await p.locator('.var-info-card').count();
const infoTitle = info ? await p.locator('.var-info-title').innerText() : '';
await p.screenshot({ path: '/tmp/f7-info.png' });
console.log(JSON.stringify({brand,rhState,w850Blocked,tempState,info,infoTitle,errors:errs.slice(0,4)},null,1));
await b.close();
