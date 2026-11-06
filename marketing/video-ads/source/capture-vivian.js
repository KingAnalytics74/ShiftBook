// Captures Vivian's before-and-after app screens for her overtime ad (runs the app in demo mode with seed-vivian.js).
// Serve the repository root on port 8777, then: node capture-vivian.js
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const OUT = __dirname + '/screens/vivian';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-GB', timezoneId: 'Europe/London' });
  await c.addInitScript({ content: fs.readFileSync(__dirname + '/seed-vivian.js', 'utf8') + ';if(!sessionStorage.getItem("s")){window.__seed();sessionStorage.setItem("s","1");localStorage.setItem("shiftbuck:analytics","no")}' });
  await c.route('**/src/config.js', async r => { const body = (await (await fetch(r.request().url())).text()).replace(/supabaseUrl: "[^"]*"/, 'supabaseUrl: ""').replace(/supabaseAnonKey: "[^"]*"/, 'supabaseAnonKey: ""'); r.fulfill({ contentType: 'text/javascript', body }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8777/app/'); await p.waitForTimeout(1500);
  const t = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  await p.addStyleTag({ content: '.top,.bottombar,body::before,.toast{visibility:hidden!important}' });
  const tab = v => p.$eval(`.bottombar [data-view=${v}]`, b => b.click());
  const shot = async (name, sel) => { const el = p.locator(sel).first(); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await el.screenshot({ path: `${OUT}/${name}.png` }); };
  const planTop = async name => { const card = p.locator('#view-money .card:has(#planRows)'); await card.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
    const bb = await card.boundingBox(), top = await p.locator('#planRows').boundingBox(); await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: bb.x, y: bb.y, width: bb.width, height: top.y - bb.y - 6 } }); };
  console.log('period', await t('#periodLabel'), '| BEFORE gross', await t('#gross'), '|', (await t('#grossNet')).slice(0, 70));
  await shot('hero-before', '#view-overview .hero');
  await tab('money'); await p.waitForTimeout(500);
  console.log('BEFORE take-home', await t('#mNet'), '| plan:', await t('#mAlloc'));
  console.log('insights:', (await t('#sInsights')).slice(0, 160));
  await planTop('plan-before');
  await tab('log'); await p.waitForTimeout(400);
  await p.fill('#fDate', '2026-11-14'); await p.dispatchEvent('#fDate', 'change'); await p.waitForTimeout(300);
  await p.click('#fUsers [data-u="Alex"]'); await p.click('#fPreset [data-pre="2"]'); await p.waitForTimeout(300);
  console.log('log: date', await p.inputValue('#fDate'), '| types', await t('#fPreset'), '| preview', await t('#fPreview'));
  await shot('logtypes', '#view-log .field:has(#fPreset)'); await shot('logpreview', '#view-log .preview');
  await p.$eval('#saveBtn', b => b.click()); await p.waitForTimeout(800);
  await tab('overview'); await p.waitForTimeout(400);
  console.log('AFTER gross', await t('#gross'), '| rest', await t('#restPill'), '|', (await t('#restHead')).slice(0, 90));
  await shot('hero-after', '#view-overview .hero'); await shot('rest', '#restCard');
  await tab('money'); await p.waitForTimeout(500);
  console.log('AFTER take-home', await t('#mNet'), '| plan:', await t('#mAlloc'));
  await planTop('plan-after');
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
