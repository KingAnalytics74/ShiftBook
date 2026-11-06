// Fills a demo account with sample data (seed.js) and screenshots the app cards used in the image ads.
// Serve the repository root on port 8776, then: node capture.js
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const OUT = __dirname + '/screens';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-GB', timezoneId: 'Europe/London' });
  await c.addInitScript({ content: fs.readFileSync(__dirname + '/seed.js', 'utf8') + ';if(!sessionStorage.getItem("s")){window.__seed();sessionStorage.setItem("s","1");localStorage.setItem("shiftbuck:analytics","no")}' });
  // run in demo mode for the screenshots: the live config points at Supabase, which would ask for a real sign-in
  await c.route('**/src/config.js', async r => { const body = (await (await fetch(r.request().url())).text()).replace(/supabaseUrl: "[^"]*"/, 'supabaseUrl: ""').replace(/supabaseAnonKey: "[^"]*"/, 'supabaseAnonKey: ""'); r.fulfill({ contentType: 'text/javascript', body }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8776/app/'); await p.waitForTimeout(1500);
  const t = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  await p.addStyleTag({ content: '.top,.bottombar,body::before,.toast{visibility:hidden!important}' });   // keep sticky bars out of the crops
  const shot = async (name, sel) => { const el = p.locator(sel).first(); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await el.screenshot({ path: `${OUT}/${name}.png` }); };
  // log form first (today), with the waking night shift picked
  await p.$eval('.bottombar [data-view=log]', b => b.click()); await p.waitForTimeout(400);
  await p.click('#fUsers [data-u="Sam"]'); await p.click('#fPreset [data-pre="1"]'); await p.waitForTimeout(300);
  console.log('log: types', (await t('#fPreset')), '| preview', await t('#fPreview'));
  await shot('logtypes', '#view-log .field:has(#fPreset)'); await shot('logpreview', '#view-log .preview');
  const card = p.locator('#view-log .card'); await card.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  const bb = await card.boundingBox(), pv = await p.locator('#view-log .preview').boundingBox();
  // log card from the top to the preview line, as one picture
  await p.screenshot({ path: `${OUT}/logcard.png`, clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(pv.y + pv.height + 16 - bb.y, 844 - bb.y) } });
  // October, the month with Ada's shifts and payslip
  await p.$eval('.bottombar [data-view=overview]', b => b.click()); await p.waitForTimeout(300);
  await p.$eval('#prev', b => b.click()); await p.waitForTimeout(500);
  console.log('period', await t('#periodLabel'), '| gross', await t('#gross'), '| rest', await t('#restPill'));
  await shot('hero', '#view-overview .hero'); await shot('rest', '#restCard');
  await p.$eval('.bottombar [data-view=money]', b => b.click()); await p.waitForTimeout(500);
  console.log('payslip:', (await t('#payBody')).slice(0, 160));
  await shot('payslip', '#payCard');
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
