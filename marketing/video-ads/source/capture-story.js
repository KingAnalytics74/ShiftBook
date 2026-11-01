const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
// Captures Tunde's app screens for the story ad. Serve the repository root on port 8775, then: node capture-story.js
const OUT = __dirname + '/screens/story';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-GB', timezoneId: 'Europe/London' });
  await c.addInitScript({ content: fs.readFileSync(__dirname + '/seed-story.js', 'utf8') + ';if(!sessionStorage.getItem("s")){window.__seed();sessionStorage.setItem("s","1");localStorage.setItem("shiftbuck:analytics","no")}' });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8775/app/'); await p.waitForTimeout(1500);
  await p.click('#prev'); await p.waitForTimeout(500);   // October, the month with Tunde's shifts
  const t = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  const shot = async (name, sel) => { const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await el.screenshot({ path: `${OUT}/${name}.png` }); };
  console.log('period:', await t('#periodLabel'), '| gross:', await t('#gross'));
  await shot('hero', '#view-overview .hero');
  await p.click('.bottombar [data-view=money]'); await p.waitForTimeout(600);
  console.log('take-home:', await t('#mNet'), '| plan:', (await t('#mAlloc')).slice(0, 120));
  // hide the sticky header and tab bar for these crops so they don't overlap the card
  await p.addStyleTag({ content: '.top,.bottombar,body::before{visibility:hidden!important}' });
  await shot('pot', '#planRows .pot[data-id="house"]');
  const card = p.locator('#view-money .card:has(#planRows)'); await card.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  const bb = await card.boundingBox(); const top = await p.locator('#planRows').boundingBox();
  await p.screenshot({ path: `${OUT}/plantop.png`, clip: { x: bb.x, y: bb.y, width: bb.width, height: top.y - bb.y - 6 } });
  await p.evaluate(() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('.top,.bottombar')) s.remove(); }));
  const pots = await p.$$eval('#planRows .pot', ps => ps.map(x => x.querySelector('.pname').value + ' ' + x.querySelector('.pplanned').textContent));
  console.log('pots:', pots.join(' | '));
  await p.click('.bottombar [data-view=log]'); await p.waitForTimeout(400);
  await p.click('#fUsers [data-u="Sam"]'); await p.click('#fPreset [data-pre="both"]'); await p.waitForTimeout(300);
  await shot('logcard', '#view-log .card'); await shot('logpreview', '#view-log .preview');
  console.log('preview:', await t('#fPreview'), '| errors:', errs);
  await b.close();
})();
