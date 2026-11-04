// Renders the Shiftbuck video ads. Run a static server at the repository root first:
//   python3 -m http.server 8773
// node render.js stills <ad> t1,t2,...   -> stills_<ad>.png (contact sheet of frames)
// node render.js video  <ad> <out.mp4>   -> 30 fps H.264, 1080x1920, silent audio track
// <ad> is payslip, shiftpay, rest, or story (Tunde's story ad, story.html). Needs Playwright (Chromium) and ffmpeg with libx264.
const { spawn } = require('child_process');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const [mode, ad, arg] = process.argv.slice(2), DIR = __dirname, FPS = 30;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(ad === 'story' ? 'http://localhost:8773/marketing/video-ads/source/story.html' : `http://localhost:8773/marketing/video-ads/source/ad.html?ad=${ad}`); await p.evaluate(() => window.ready);
  const stage = p.locator('#stage');
  if (mode === 'stills') {
    const times = arg.split(',').map(Number), shots = [];
    for (const t of times) { await p.evaluate(t => renderAt(t), t); shots.push((await stage.screenshot({ type: 'png' })).toString('base64')); }
    const sheet = await b.newPage({ viewport: { width: 270 * times.length + 10 * (times.length + 1), height: 520 } });
    await sheet.setContent(`<body style="margin:0;background:#333;display:flex;gap:10px;padding:10px">${shots.map((s, i) => `<div style="color:#fff;font:14px sans-serif"><img src="data:image/png;base64,${s}" width="270"><div>${times[i]}s</div></div>`).join('')}</body>`);
    await sheet.screenshot({ path: `${DIR}/stills_${ad}.png` });
  } else {
    const dur = await p.evaluate(() => DURATION), n = Math.round(dur * FPS);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', arg]);
    ff.stderr.on('data', d => process.stderr.write(d));
    for (let f = 0; f < n; f++) {
      await p.evaluate(t => renderAt(t), f / FPS);
      const buf = await stage.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log(`${ad}: ${n} frames -> ${arg}`);
  }
  if (errs.length) console.log('errors:', errs);
  await b.close();
})();
