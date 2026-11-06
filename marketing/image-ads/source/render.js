// Renders the Shiftbuck image ads to PNG. Run a static server at the repository root first:
//   python3 -m http.server 8776
// node render.js            -> ../shiftbuck-<ad>-<size>.png for every ad and size
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const ADS = ['pay', 'payslip', 'shifts', 'rest'], SIZES = { sq: [1080, 1080], story: [1080, 1920] };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [size, [w, h]] of Object.entries(SIZES)) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    for (const ad of ADS) {
      await p.goto(`http://localhost:8776/marketing/image-ads/source/ads.html?ad=${ad}&size=${size}`);
      await p.evaluate(() => window.ready);
      const out = `${__dirname}/../shiftbuck-${ad}-${size === 'sq' ? '1x1' : '9x16'}.png`;
      await p.locator('#stage').screenshot({ path: out });
      console.log('wrote', out.replace(/.*\//, ''));
    }
    await p.close();
  }
  if (errs.length) console.log('errors:', errs);
  await b.close();
})();
