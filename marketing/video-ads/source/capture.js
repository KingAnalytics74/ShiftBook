const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
// Fills a demo account with sample data (seed.js) and screenshots the app cards used in the ads.
// Serve the repository root on port 8772, then: node capture.js <output folder>
const OUT = process.argv[2], URL = 'http://localhost:8772/app/';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-GB', timezoneId: 'Europe/London' });
  await c.addInitScript({ content: fs.readFileSync(__dirname + '/seed.js', 'utf8') + ';if(!sessionStorage.getItem("seeded")){window.__seed();sessionStorage.setItem("seeded","1")}' });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1500);
  const t = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  console.log('who:', await t('#who').catch(() => '?'), '| gross:', await t('#gross').catch(() => '?'), '| setup shown:', await p.isVisible('#view-setup'), '| auth shown:', await p.isVisible('#view-auth'));
  const shot = async (name, sel) => { const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await el.screenshot({ path: `${OUT}/${name}.png` }); };
  await p.screenshot({ path: `${OUT}/overview.png` });
  await shot('hero', '#view-overview .hero');
  await shot('rest', '#restCard');
  console.log('rest:', await t('#restPill').catch(() => '?'));
  await p.click('.bottombar [data-view=money]'); await p.waitForTimeout(500);
  await shot('payslip', '#payCard');
  console.log('payslip text:', (await t('#payBody')).slice(0, 400));
  await p.click('.bottombar [data-view=log]'); await p.waitForTimeout(500);
  await p.click('#fUsers [data-u="Sam"]'); await p.click('#fPreset [data-pre="both"]'); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/log.png` });
  await shot('logcard', '#view-log .card');
  await shot('logpreview', '#view-log .preview');
  await p.click('.bottombar [data-view=overview]'); await p.waitForTimeout(400);
  await shot('chart', '#view-overview .card:has(#cum)');
  console.log('log preview:', await t('#fPreview').catch(() => '?'));
  console.log('errors:', errs); await b.close();
})();
