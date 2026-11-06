// Screenshots the community for the community ad: King's job post and his messages with Toby.
// Uses mock-supabase-community.js in place of Supabase, so it shows made-up people and touches no real data.
// Serve the repository root on port 8778, then: node capture-community.js
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const OUT = __dirname + '/screens/community';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-GB', timezoneId: 'Europe/London' });
  await c.addInitScript(() => { try { localStorage.setItem('shiftbuck:analytics', 'no'); } catch (e) {} });
  await c.route('**/src/vendor/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(__dirname + '/mock-supabase-community.js', 'utf8') }));
  await c.route('**/src/config.js', async r => { const body = (await (await fetch(r.request().url())).text()).replace(/supabaseUrl: "[^"]*"/, 'supabaseUrl: "https://mock.supabase.co"').replace(/supabaseAnonKey: "[^"]*"/, 'supabaseAnonKey: "mock"'); r.fulfill({ contentType: 'text/javascript', body }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8778/app/'); await p.waitForTimeout(1800);
  const t = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  console.log('signed in:', !(await p.isVisible('#view-auth')), '| setup shown:', await p.isVisible('#view-setup'));
  await p.$eval('.bottombar [data-view=community]', x => x.click()); await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/full-community.png' });
  await p.addStyleTag({ content: '.top,.bottombar,body::before,.toast,#consent{visibility:hidden!important}' });
  const shot = async (name, loc) => { await loc.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await loc.screenshot({ path: `${OUT}/${name}.png` }); };
  // community intro: the card's title and the line about nicknames
  const intro = p.locator('#view-community .card').first(); await intro.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  const ib = await intro.boundingBox(), rules = await p.locator('#view-community .card').first().locator('details').first().boundingBox();
  await p.screenshot({ path: OUT + '/intro.png', clip: { x: ib.x, y: ib.y, width: ib.width, height: rules.y - ib.y - 4 } });
  const post = p.locator('#cmFeed > *').filter({ hasText: 'hiring' }).first();
  await shot('post', post);
  const spaces = p.locator('#cmSpaces'); await shot('spaces', spaces);
  console.log('spaces:', (await t('#cmSpaces')));
  await p.$eval('#cmMsgList [data-open^="dm:"]', x => x.click()); await p.waitForTimeout(800);
  console.log('thread:', (await t('#cmThread')).slice(0, 260));
  await shot('thread', p.locator('#cmThread'));
  console.log('feed:', (await t('#cmFeed')).slice(0, 200));
  console.log('messages list:', (await t('#cmMsgList').catch(() => '?')).slice(0, 120));
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
