import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => { const el = document.querySelector('.intro'); return el && getComputedStyle(el).visibility === 'hidden'; }, { timeout: 90000 });
await p.waitForTimeout(700);
const temp = p.locator('.layer-item', { hasText: 'Temp 2 m' }).first();
await temp.locator('.mode-switch button', { hasText: 'LINES' }).click();
await p.waitForTimeout(500);
const state1 = await temp.evaluate(el => ({ cls: el.className, badges: [...el.querySelectorAll('.layer-badge')].map(e=>e.textContent), mode: [...el.querySelectorAll('.mode-switch button')].map(b=>({t:b.textContent,on:b.className})) }));
await p.screenshot({ path: '/tmp/line-temp.png' });
// remove Temp, add CAPE line
await temp.locator('.layer-main').click();
await p.waitForTimeout(300);
const cape = p.locator('.layer-item', { hasText: 'CAPE' }).first();
await cape.locator('.layer-main').click();
await p.waitForTimeout(500);
const state2 = await cape.evaluate(el => ({ cls: el.className, badges: [...el.querySelectorAll('.layer-badge')].map(e=>e.textContent), mode: [...el.querySelectorAll('.mode-switch button')].map(b=>({t:b.textContent,on:b.className})) }));
await p.screenshot({ path: '/tmp/line-cape.png' });
// remove CAPE, add Snow line
await cape.locator('.layer-main').click();
await p.waitForTimeout(300);
const snow = p.locator('.layer-item', { hasText: 'Snow' }).first();
await snow.locator('.layer-main').click();
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/line-snow.png' });
console.log(JSON.stringify({state1,state2,errors:errs.slice(0,3)},null,1));
await b.close();
