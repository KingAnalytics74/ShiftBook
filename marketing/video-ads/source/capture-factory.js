const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
// Screenshots the log card for Kemi's night shift (seed-factory.js). Serve the repository root on port 8772, then: node capture-factory.js screens/factory
const OUT = process.argv[2], URL = 'http://localhost:8772/app/';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-GB', timezoneId: 'Europe/London' });
  await c.addInitScript({ content: fs.readFileSync(__dirname + '/seed-factory.js', 'utf8') + ';if(!sessionStorage.getItem("seeded")){window.__seed();sessionStorage.setItem("seeded","1");localStorage.setItem("shiftbuck:analytics","no")}' });
  // demo mode: no Supabase, the app reads the seeded account from this browser only
  await c.route('**/src/config.js', async r => { const body = (await (await fetch(r.request().url())).text()).replace(/supabaseUrl: "[^"]*"/, 'supabaseUrl: ""').replace(/supabaseAnonKey: "[^"]*"/, 'supabaseAnonKey: ""'); r.fulfill({ contentType: 'text/javascript', body }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1800);
  await p.addStyleTag({ content: '.top,.bottombar,body::before,.toast{visibility:hidden!important}' });
  const t = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  console.log('who:', await t('#who').catch(() => '?'), '| gross:', await t('#gross').catch(() => '?'), '| setup:', await p.isVisible('#view-setup').catch(()=>'?'), '| auth:', await p.isVisible('#view-auth').catch(()=>'?'));
  await p.screenshot({ path: `${OUT}/overview.png` });
  const shot = async (name, sel) => { const el = p.locator(sel).first(); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await el.screenshot({ path: `${OUT}/${name}.png` }); };
  await shot('hero', '#view-overview .hero');
  await p.$eval('.bottombar [data-view=log]', b => b.click()); await p.waitForTimeout(600);
  const pres = await p.$$eval('#fPreset button', bs => bs.map(b => b.textContent));
  console.log('presets:', pres);
  await p.fill('#fDate', '2026-11-06'); await p.dispatchEvent('#fDate', 'change'); await p.waitForTimeout(300); await p.click('#fPreset [data-pre="2"]'); await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/log.png`, fullPage: true });
  await shot('logtypes', '#view-log .field:has(#fPreset)');
  await shot('logpreview', '#view-log .preview');
  console.log('preview:', await t('#fPreview'), '| rest warn:', await p.isVisible('#restWarn') ? await t('#restWarn') : 'none');
  console.log('errors:', errs); await b.close();
})();
