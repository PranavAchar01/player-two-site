// Headless flow test for the Player Two one-sentence site.
// Run: node /Users/pranavachar/helloworld/player-two-site/.tests/flow.mjs
import puppeteer from '/Users/pranavachar/helloworld/player-two/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(SITE, '.shots');
const PORT = 4599;
const BASE = `http://localhost:${PORT}/`;
const CHROME = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const TASK = 'pick up the red cup with its left hand, twice, slowly';
const ALLOWED_HOSTS = new Set(['localhost', 'fonts.googleapis.com', 'fonts.gstatic.com']);

const EXPECTED_ARTICLES = {
  'SO-101': 'an', 'SO-100': 'an', 'Koch v1.1': 'a', 'Franka Panda': 'a', 'Franka FR3': 'a', 'UR3e': 'a', 'UR5e': 'a', 'UR10e': 'a',
  'xArm 6': 'an', 'xArm 7': 'an', 'UFACTORY Lite 6': 'a', 'Kinova Gen3': 'a', 'KUKA LBR iiwa 14': 'a', 'Sawyer': 'a', 'WidowX 250': 'a',
  'ViperX 300': 'a', 'myCobot 280': 'a', 'ALOHA (bimanual)': 'an', 'Trossen WidowX AI': 'a', 'Unitree G1': 'a', 'Unitree H1': 'a',
  'Fourier GR-1': 'a', 'Booster T1': 'a', 'Agility Digit': 'an', 'Apptronik Apollo': 'an', '1X NEO': 'a', 'Figure 02': 'a', 'Tesla Optimus': 'a',
  'LEAP Hand': 'a', 'Allegro Hand': 'an', 'Shadow Dexterous Hand': 'a', 'Inspire RH56': 'an', 'Unitree Go2': 'a', 'Boston Dynamics Spot': 'a',
  'ANYmal': 'an', 'Hello Robot Stretch 3': 'a', 'PAL TIAGo': 'a'
};

// The recorded demos. Everything the page shows about them must come from this file.
const MANIFEST_PATH = path.join(SITE, 'media/demo/manifest.json');
const MANIFEST = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : null;
const DEMOS = MANIFEST ? MANIFEST.demos : [];
const tidy = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const hasClipFiles = (demo) => demo.clips.length > 0 && demo.clips.every((c) => existsSync(path.join(SITE, c.file)) && existsSync(path.join(SITE, c.poster)));

const GRIPPER_CAVEAT = 'The gripper cannot be learned from video yet, so only the arm path is captured.';
const JACKS_REFUSAL = 'An SO-101 is one arm. Jumping jacks need two arms and legs. Try a humanoid, or ask for a one-arm motion.';

// Leaving a tile or the viewer cancels that clip's download on purpose. That is not an error.
const isCancelledClip = (r) => /\.mp4(\?|$)/.test(r.url()) && r.failure() && r.failure().errorText === 'net::ERR_ABORTED';

// A temporary manifest for the big-library checks: the real demos with their clips repeated up to 24.
// It only ever exists in memory, served by request interception.
const BIG = MANIFEST ? JSON.parse(JSON.stringify(MANIFEST)) : null;
if (BIG) {
  for (const demo of BIG.demos) {
    const base = demo.clips;
    demo.clips = Array.from({ length: 24 }, (_, i) => ({ ...base[i % base.length], title: `${tidy(base[i % base.length].title)} (${i + 1})` }));
    demo.summary = { ...demo.summary, accepted: 24, episodes: 24 };
  }
}

// A manifest whose demo makes no sense for its robot. The page must refuse it rather than play it.
const NONSENSE = MANIFEST ? { demos: [{ ...MANIFEST.demos[0], id: 'nonsense', robot: 'SO-101', robotId: 'so101', task: 'do jumping jacks', match: ['jumping jacks'] }] } : null;

const serveManifest = async (page, manifest) => {
  await page.setRequestInterception(true);
  page.on('request', (r) => (/media\/demo\/manifest\.json/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) }) : r.continue()));
};

mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failures = 0;
const notes = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n      ${detail}` : ''}`);
}
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SITE, stdio: 'ignore' });
await sleep(900);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
try {
  await browser.defaultBrowserContext().overridePermissions(BASE.replace(/\/$/, ''), ['clipboard-read', 'clipboard-write']);
} catch (e) {
  try { await browser.defaultBrowserContext().overridePermissions(BASE.replace(/\/$/, ''), ['clipboard-read', 'clipboard-sanitized-write']); }
  catch (e2) { notes.push(`clipboard permission override failed: ${e2.message}`); }
}

const text = (page, sel) => page.$eval(sel, (n) => n.innerText.replace(/\s+/g, ' ').trim());
const overflow = (page) => page.evaluate(() => ({
  doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  body: document.body.scrollWidth - document.documentElement.clientWidth
}));
const score = (page) => text(page, '#spec-score');
const inViewport = (page, sel) => page.$eval(sel, (n) => {
  const r = n.getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: document.documentElement.clientWidth, vh: window.innerHeight };
});

const until = async (page, fn, ms = 5000, ...args) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await page.evaluate(fn, ...args)) return Date.now() - started;
    await sleep(60);
  }
  return -1;
};

const viewerState = (page) => page.evaluate(() => {
  const v = document.getElementById('ql-video');
  return {
    open: document.getElementById('ql').dataset.open === 'true',
    title: document.getElementById('ql-title').textContent,
    count: document.getElementById('ql-count').textContent,
    playing: !v.paused && v.currentTime > 0,
    loop: v.loop,
    muted: v.muted,
    focusInside: document.getElementById('ql').contains(document.activeElement),
    pageInert: document.getElementById('page').inert
  };
});

// Chips, the recorded run, the library and the viewer. Everything expected here is read from the manifest.
async function demoFlow(page, label, shot) {
  if (!DEMOS.length) { notes.push(`${label}: media/demo/manifest.json is missing, demo checks skipped`); return; }
  const mobile = label === 'mobile';
  const mp4s = [];
  page.on('request', (r) => { if (/\.mp4(\?|$)/.test(r.url())) mp4s.push(r.url()); });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);

  // chips come from the manifest
  const chips = await page.$$eval('#chips .chip', (ns) => ns.map((n) => n.textContent));
  eq(`${label}: one chip per recorded demo`, chips.length, Math.min(DEMOS.length, 3));
  DEMOS.slice(0, 3).forEach((demo, i) => {
    const article = EXPECTED_ARTICLES[demo.robot];
    if (article) eq(`${label}: chip ${i + 1} is built from the manifest`, chips[i], `Try: ${article} ${tidy(demo.robot)} to ${tidy(demo.task)}`);
  });
  check(`${label}: chips are at least 44px tall`, await page.$$eval('#chips .chip', (ns) => ns.every((n) => n.getBoundingClientRect().height >= 44)));

  // underlines of the three blanks sit on the same rule, one border below the text
  const gaps = await page.evaluate(() => ['robot-blank', 'tier'].map((id) => {
    const box = document.getElementById(id);
    const frame = box.getBoundingClientRect();
    for (const node of [box.nextSibling, box.previousSibling]) {
      if (!node || node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const mid = (r.top + r.bottom) / 2;
        if (r.width > 0 && mid > frame.top && mid < frame.bottom) return Math.round((frame.bottom - r.bottom) * 100) / 100;
      }
    }
    return null;
  }));
  check(`${label}: blank underlines are optically aligned`, gaps.every((g) => g === null || Math.abs(g - 1) <= 0.3), JSON.stringify(gaps));

  // a chip types into all three blanks
  const demo = DEMOS[DEMOS.length - 1];
  const chipIndex = DEMOS.length - 1;
  const before = await page.evaluate(() => document.getElementById('sentence').getBoundingClientRect().top);
  await page.click(`#chips .chip:nth-child(${chipIndex + 1})`);
  await sleep(180);
  const midway = await page.evaluate(() => ({ robot: document.getElementById('robot').value, task: document.getElementById('task').textContent }));
  check(`${label}: chip types instead of pasting`, midway.robot.length < tidy(demo.robot).length || midway.task.length < tidy(demo.task).length, JSON.stringify(midway));
  const filled = await until(page, (robot, task) => document.getElementById('robot').value === robot && document.getElementById('task').textContent === task && !document.getElementById('compose').disabled, 6000, tidy(demo.robot), tidy(demo.task));
  check(`${label}: chip fills robot and task`, filled >= 0, JSON.stringify(await page.evaluate(() => ({ robot: document.getElementById('robot').value, task: document.getElementById('task').textContent }))));
  eq(`${label}: chip sets the tier`, await text(page, '#tier-label'), 'curated video');
  eq(`${label}: chip keeps the sentence where it was`, await page.evaluate(() => document.getElementById('sentence').getBoundingClientRect().top), before);
  let of = await overflow(page);
  check(`${label}: no horizontal overflow (chip filled)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));
  await sleep(400);
  await shot('d-chip-filled');

  // compose: the run timeline plays first
  const composedAt = Date.now();
  await page.click('#compose');
  await sleep(700);
  const playing = await page.evaluate(() => ({
    runVisible: !document.getElementById('run-wrap').hidden,
    briefOpen: document.getElementById('brief-wrap').classList.contains('is-open'),
    outputOpen: document.getElementById('output').classList.contains('is-open'),
    steps: [...document.querySelectorAll('#steps .step-name')].map((n) => n.textContent),
    active: document.querySelectorAll('#steps .step.is-active').length,
    resultsLocked: document.getElementById('results').inert && !document.getElementById('results').classList.contains('is-open'),
    kicker: document.getElementById('run-kicker-text').textContent,
    title: document.getElementById('run-title').textContent
  }));
  check(`${label}: a matched run opens the timeline, not the brief`, playing.runVisible && playing.outputOpen && !playing.briefOpen, JSON.stringify(playing));
  eq(`${label}: six steps from the manifest`, playing.steps.join('|'), demo.steps.map((s) => tidy(s.name)).join('|'));
  check(`${label}: one step is in progress and the library waits`, playing.active === 1 && playing.resultsLocked, JSON.stringify(playing));
  check(`${label}: honest "Recorded run" label with the date`, /^Recorded run(, \d{1,2} [A-Z][a-z]+ \d{4})?$/.test(playing.kicker) && (!demo.recordedAt || /\d{4}$/.test(playing.kicker)), playing.kicker);
  eq(`${label}: run title is the recorded sentence`, playing.title, `I want to train ${EXPECTED_ARTICLES[demo.robot] || 'a'} ${tidy(demo.robot)} to ${tidy(demo.task)} with curated video data.`);
  await sleep(1500);
  await shot('e-run-playing');
  const statusMid = await text(page, '#step-status');
  check(`${label}: status line quotes the agent's trace`, demo.steps.some((s) => statusMid.includes(tidy(s.detail).slice(0, 24))), statusMid);

  const done = await until(page, () => document.getElementById('run-wrap').classList.contains('is-done'), 12000);
  const total = Date.now() - composedAt;
  check(`${label}: timeline takes about 6 to 8 seconds`, done >= 0 && total >= 5500 && total <= 9000, `${total} ms`);
  await sleep(1500);
  const after = await page.evaluate(() => ({
    done: document.querySelectorAll('#steps .step.is-done').length,
    tiles: document.querySelectorAll('#grid .tile').length,
    visible: [...document.querySelectorAll('#grid .tile')].every((n) => Number(getComputedStyle(n).opacity) === 1),
    stats: Object.fromEntries([...document.querySelectorAll('#stats .stat')].map((n) => [n.dataset.key, Number(n.querySelector('dd').textContent)])),
    downloadDisabled: document.getElementById('download').disabled,
    hint: document.getElementById('download-hint').textContent.replace(/\s+/g, ' ').trim(),
    rejects: document.querySelectorAll('#rejects-list .reject').length,
    rejectsHidden: document.getElementById('rejects').hidden,
    lazy: [...document.querySelectorAll('#grid .tile img')].every((n) => n.loading === 'lazy'),
    preload: [...document.querySelectorAll('#grid .tile video')].every((n) => n.preload === 'none' && !n.getAttribute('src')),
    badges: [...document.querySelectorAll('#grid .pill--time')].map((n) => n.textContent),
    words: document.getElementById('run-wrap').innerText
  }));
  eq(`${label}: every step ticked`, after.done, demo.steps.length);
  eq(`${label}: one tile per clip in the manifest`, after.tiles, demo.clips.length);
  check(`${label}: tiles have finished their entrance`, after.visible);
  eq(`${label}: summary numbers are the manifest's`, JSON.stringify(after.stats), JSON.stringify({ found: demo.summary.found, judged: demo.summary.judged, accepted: demo.summary.accepted, rejected: demo.summary.rejected, episodes: demo.summary.episodes }));
  check(`${label}: download is disabled and says why`, after.downloadDisabled && after.hint === 'Runs locally. See the brief.', after.hint);
  check(`${label}: rejected strip follows the manifest`, after.rejects === (demo.rejections || []).length && after.rejectsHidden === !(demo.rejections || []).length, JSON.stringify({ rejects: after.rejects, hidden: after.rejectsHidden }));
  check(`${label}: posters lazy-load and videos do not preload`, after.lazy && after.preload);
  check(`${label}: duration badges`, after.badges.length === demo.clips.length && after.badges.every((b) => /^\d:\d\d$/.test(b)), after.badges.join(','));
  check(`${label}: nothing claims a run was trained or queued`, !/\b(trained|queued|training (started|complete)|uploaded)\b/i.test(after.words), after.words.slice(0, 200));
  eq(`${label}: no video was requested before a hover or open`, mp4s.length, 0);
  of = await overflow(page);
  check(`${label}: no horizontal overflow (results)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));
  await page.evaluate(() => document.querySelector('#grid .tile').scrollIntoView({ block: 'center' }));
  await sleep(500);
  await shot('f-results');
  await shot('f2-results-full', { fullPage: true });

  const filesExist = hasClipFiles(demo);
  if (!filesExist) notes.push(`${label}: clip files for ${demo.id} are missing, playback checks skipped`);

  // hover peek (desktop)
  if (!mobile && filesExist) {
    await page.hover('#grid .tile:nth-child(1)');
    await sleep(1500);
    const peek = await page.evaluate(() => {
      const tile = document.querySelector('#grid .tile');
      const v = tile.querySelector('video');
      return { lifted: tile.classList.contains('is-hover'), playing: !v.paused && v.currentTime > 0, shown: tile.classList.contains('is-playing'), muted: v.muted, scrub: getComputedStyle(tile.querySelector('.tile-scrub')).opacity };
    });
    check('desktop: hovering a tile lifts it and plays it muted in place', peek.lifted && peek.playing && peek.shown && peek.muted, JSON.stringify(peek));
    await shot('g-hover');
    if (demo.clips.length > 1) {
      await page.hover('#grid .tile:nth-child(2)');
      await sleep(1300);
      const both = await page.$$eval('#grid .tile video', (vs) => vs.map((v) => !v.paused));
      eq('desktop: only one video plays at a time', both.filter(Boolean).length, 1);
      check('desktop: the second tile took over', both[1] === true && both[0] === false, JSON.stringify(both));
    }
    await page.mouse.move(6, 6);
    await sleep(400);
    eq('desktop: leaving the grid stops playback', (await page.$$eval('#grid .tile video', (vs) => vs.filter((v) => !v.paused).length)), 0);
  }

  // viewer by keyboard (desktop) or by touch (mobile)
  const titles = demo.clips.map((c) => tidy(c.title));
  if (!mobile) {
    await page.focus('#grid .tile:nth-child(1)');
    await page.keyboard.press('Enter');
    await sleep(250);
    await shot('h-viewer-opening');
    await sleep(1300);
    let v = await viewerState(page);
    check('desktop: Enter on a tile opens the viewer', v.open && v.focusInside && v.pageInert, JSON.stringify(v));
    eq('desktop: viewer shows the first clip', `${v.title}|${v.count}`, `${titles[0]}|1 of ${titles.length}`);
    if (filesExist) check('desktop: viewer autoplays, muted and looping', v.playing && v.loop && v.muted, JSON.stringify(v));
    const info = await page.evaluate(() => ({
      href: document.getElementById('ql-source').getAttribute('href'), rel: document.getElementById('ql-source').rel,
      licence: document.getElementById('ql-licence').textContent, author: document.getElementById('ql-author').textContent,
      stats: [...document.querySelectorAll('#ql-stats .ql-stat')].map((n) => n.innerText.replace(/\s+/g, ' ').trim())
    }));
    const c0 = demo.clips[0];
    check('desktop: viewer info comes from the manifest', info.href === c0.url && /noopener/.test(info.rel) && info.licence === tidy(c0.licence) && info.author === tidy(c0.author), JSON.stringify(info));
    const s0 = c0.stats;
    const wantStats = [`${s0.tracked} %`, `${s0.lagBefore} ms`, `${s0.lagAfter} ms`, `${s0.speedCap} %`].concat(s0.trackErrCm != null ? [`${s0.trackErrCm} cm`] : []);
    check('desktop: measured stats are shown', wantStats.every((w) => info.stats.some((t) => t.includes(w))) && (s0.trackErrCm != null) === info.stats.some((t) => /Tracking error/.test(t)), JSON.stringify(info.stats));
    of = await overflow(page);
    check('desktop: no horizontal overflow (viewer)', of.doc <= 0 && of.body <= 0, JSON.stringify(of));
    const fits = await page.evaluate(() => { const f = document.getElementById('ql-frame').getBoundingClientRect(); const m = document.getElementById('ql-media').getBoundingClientRect(); const i = document.getElementById('ql-info'); return f.top >= 0 && f.bottom <= window.innerHeight && m.left >= f.left && m.right <= f.right && m.top >= f.top && m.bottom <= f.bottom && i.scrollHeight <= i.clientHeight + 1; });
    check('desktop: viewer fits the screen and nothing in it is cut off', fits);
    await shot('i-viewer');

    if (titles.length > 1) {
      await page.keyboard.press('ArrowRight');
      await sleep(800);
      v = await viewerState(page);
      eq('desktop: right arrow moves to the next clip', `${v.title}|${v.count}`, `${titles[1]}|2 of ${titles.length}`);
      await shot('j-viewer-next');
      await page.keyboard.press('ArrowLeft');
      await sleep(700);
      eq('desktop: left arrow moves back', (await viewerState(page)).title, titles[0]);
      await page.keyboard.press('ArrowLeft');
      await sleep(700);
      eq('desktop: arrows wrap around', (await viewerState(page)).title, titles[titles.length - 1]);
      await page.click('#ql-next');
      await sleep(700);
      eq('desktop: the on-screen arrow works too', (await viewerState(page)).title, titles[0]);
    }
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    check('desktop: Tab stays inside the viewer', (await viewerState(page)).focusInside);
    await page.keyboard.press('Escape');
    await sleep(900);
    const closed = await page.evaluate(() => ({ open: document.getElementById('ql').dataset.open, visible: getComputedStyle(document.getElementById('ql')).visibility, inert: document.getElementById('page').inert, focus: document.activeElement.className, hiddenTiles: document.querySelectorAll('.tile.is-origin').length, playing: !document.getElementById('ql-video').paused, runStillDone: document.getElementById('run-wrap').classList.contains('is-done') }));
    check('desktop: Escape closes the viewer and gives focus back to the tile', closed.open === 'false' && closed.visible === 'hidden' && !closed.inert && /tile/.test(closed.focus) && closed.hiddenTiles === 0 && !closed.playing && closed.runStillDone, JSON.stringify(closed));
    await page.keyboard.press(' ');
    await sleep(700);
    check('desktop: Space on a tile opens the viewer', (await viewerState(page)).open);
    await page.click('#ql-close');
    await sleep(800);
  } else {
    await page.tap('#grid .tile:nth-child(1)');
    await sleep(1500);
    let v = await viewerState(page);
    check('mobile: tap opens the viewer', v.open && v.title === titles[0], JSON.stringify(v));
    if (filesExist) check('mobile: viewer autoplays', v.playing, JSON.stringify(v));
    of = await overflow(page);
    check('mobile: no horizontal overflow (viewer)', of.doc <= 0 && of.body <= 0, JSON.stringify(of));
    await shot('i-viewer');
    const box = await page.$eval('#ql-media', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const swipe = async (dx, dy) => {
      await page.touchscreen.touchStart(box.x, box.y);
      for (let i = 1; i <= 6; i += 1) { await page.touchscreen.touchMove(box.x + (dx * i) / 6, box.y + (dy * i) / 6); await sleep(16); }
      await page.touchscreen.touchEnd();
    };
    if (titles.length > 1) {
      await swipe(-160, 4);
      await sleep(900);
      eq('mobile: swipe left moves to the next clip', (await viewerState(page)).title, titles[1]);
      await swipe(160, -4);
      await sleep(900);
      eq('mobile: swipe right moves back', (await viewerState(page)).title, titles[0]);
    }
    await swipe(6, 60);
    await sleep(600);
    check('mobile: a short pull springs back', (await viewerState(page)).open);
    await swipe(4, 240);
    await sleep(900);
    check('mobile: swipe down closes the viewer', !(await viewerState(page)).open && !(await page.$eval('#page', (n) => n.inert)));
  }

  // the brief is still one tap away
  await page.click('#see-brief');
  await sleep(900);
  check(`${label}: "See the brief" opens the honest brief under the results`, await page.evaluate(() => document.getElementById('brief-wrap').classList.contains('is-open') && !document.getElementById('run-wrap').hidden && /Nothing has been queued or trained/.test(document.getElementById('brief').innerText)));
  of = await overflow(page);
  check(`${label}: no horizontal overflow (results and brief)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));

  // editing the task away from the demo dims the recorded run; the next compose gives the brief
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#task');
  await page.evaluate(() => { const t = document.getElementById('task'); const r = document.createRange(); r.selectNodeContents(t); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.keyboard.type('stack three red cups', { delay: 5 });
  await sleep(200);
  check(`${label}: a run that no longer matches is dimmed and locked`, await page.$eval('#run-wrap', (n) => n.classList.contains('is-stale') && n.inert));
  await page.click('#compose');
  await sleep(900);
  check(`${label}: composing an unmatched task swaps the run for the brief`, await page.evaluate(() => document.getElementById('run-wrap').hidden && document.getElementById('brief-wrap').classList.contains('is-open') && /stack three red cups/.test(document.getElementById('cmd').textContent)));

  // Escape and click both skip the timeline
  if (DEMOS.length) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    await page.click('#chips .chip:nth-child(1)');
    await until(page, (task) => document.getElementById('task').textContent === task && !document.getElementById('compose').disabled, 6000, tidy(DEMOS[0].task));
    await page.click('#compose');
    await sleep(900);
    await page.keyboard.press('Escape');
    const skipped = await until(page, () => document.getElementById('run-wrap').classList.contains('is-done'), 600);
    check(`${label}: Escape skips the timeline`, skipped >= 0 && skipped < 600, String(skipped));
    eq(`${label}: skipping still shows every clip`, await page.$$eval('#grid .tile', (n) => n.length), DEMOS[0].clips.length);
    await page.click('#compose');
    await sleep(900);
    await page.click('#steps');
    const clicked = await until(page, () => document.getElementById('run-wrap').classList.contains('is-done'), 600);
    check(`${label}: a click skips the timeline`, clicked >= 0, String(clicked));
    await sleep(700);
    await page.click('#steps .step:nth-child(2) .step-btn');
    await sleep(400);
    check(`${label}: a finished step can be read again`, (await text(page, '#step-status')).includes(tidy(DEMOS[0].steps[1].detail).slice(0, 24)), await text(page, '#step-status'));
  }
}

// Reduced motion, the built-in stand-in, and the film driver. Desktop only.
async function extras() {
  console.log('\n=== extras ===');
  const open = async (url, before) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (!isCancelledClip(r)) errors.push(`requestfailed: ${r.url()}`); });
    if (before) await before(page);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(url, { waitUntil: 'networkidle0' });
    await sleep(800);
    return { page, errors };
  };

  // reduced motion
  if (DEMOS.length) {
    const { page, errors } = await open(BASE, (p) => p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]));
    eq('reduced motion: no drift on the wallpaper', await page.$eval('.hero-img', (n) => getComputedStyle(n).animationName), 'none');
    await page.click('#chips .chip:nth-child(1)');
    await sleep(250);
    eq('reduced motion: a chip fills at once', await page.evaluate(() => `${document.getElementById('robot').value}|${document.getElementById('task').textContent}`), `${tidy(DEMOS[0].robot)}|${tidy(DEMOS[0].task)}`);
    await page.click('#compose');
    await sleep(500);
    check('reduced motion: the timeline still plays', await page.evaluate(() => document.querySelectorAll('#steps .step.is-active').length === 1));
    await page.click('#run-skip');
    await sleep(300);
    check('reduced motion: tiles are simply there', await page.$$eval('#grid .tile', (ns) => ns.length > 0 && ns.every((n) => Number(getComputedStyle(n).opacity) === 1)));
    await page.focus('#grid .tile:nth-child(1)');
    await page.keyboard.press('Enter');
    await sleep(200);
    check('reduced motion: the viewer opens without a flight', await page.evaluate(() => document.getElementById('ql').dataset.open === 'true' && document.getElementById('ql-media').getAnimations().length === 0));
    await page.keyboard.press('Escape');
    await sleep(200);
    check('reduced motion: the viewer closes at once', await page.evaluate(() => document.getElementById('ql').dataset.open === 'false' && !document.getElementById('page').inert));
    check('reduced motion: no console errors', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: path.join(SHOTS, 'desktop-k-reduced-motion.png') });
    await page.close();
  }

  // no manifest: the stand-in keeps the page whole and says what it is
  {
    const { page, errors } = await open(BASE, async (p) => {
      await p.setRequestInterception(true);
      p.on('request', (r) => (/manifest\.json/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', body: '{}' }) : r.continue()));
    });
    const chips = await page.$$eval('#chips .chip', (ns) => ns.map((n) => n.textContent));
    check('stand-in: chips still appear without a manifest', chips.length === 2 && chips.every((c) => /^Try: an? /.test(c)), chips.join(' | '));
    await page.click('#chips .chip:nth-child(1)');
    await until(page, () => !document.getElementById('compose').disabled && document.getElementById('task').textContent.length > 10 && document.activeElement.id === 'compose', 6000);
    await page.click('#compose');
    await sleep(600);
    await page.click('#run-skip');
    await sleep(1200);
    const standIn = await page.evaluate(() => ({ kicker: document.getElementById('run-kicker-text').textContent, tiles: document.querySelectorAll('#grid .tile.no-poster').length, status: document.getElementById('step-status').innerText }));
    check('stand-in: it says no recorded run is loaded', /No recorded run is loaded/.test(standIn.kicker) && standIn.tiles === 3 && !/Recorded run,/.test(standIn.kicker), JSON.stringify(standIn));
    await page.click('#grid .tile:nth-child(1)');
    await sleep(900);
    check('stand-in: the viewer opens on an empty clip without breaking', await page.evaluate(() => document.getElementById('ql').dataset.open === 'true' && !document.getElementById('ql-missing').hidden));
    await page.screenshot({ path: path.join(SHOTS, 'desktop-l-stand-in.png') });
    await page.keyboard.press('Escape');
    await sleep(500);
    check('stand-in: no console errors', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // film driver
  {
    const plain = await open(BASE);
    await sleep(1400); // let the entrance finish, so the two layouts are compared at rest
    const plainLayout = await plain.page.evaluate(() => ({ film: typeof window.filmDemo, h: document.documentElement.scrollHeight, s: JSON.stringify(document.getElementById('sentence').getBoundingClientRect()), c: JSON.stringify(document.getElementById('compose').getBoundingClientRect()) }));
    eq('film: the driver is absent without ?film=1', plainLayout.film, 'undefined');
    await plain.page.close();

    const { page, errors } = await open(`${BASE}?film=1`, BIG ? (p) => serveManifest(p, BIG) : null);
    await sleep(1400);
    const filmLayout = await page.evaluate(() => ({ film: typeof window.filmDemo, cursor: Boolean(document.querySelector('.film-cursor')), h: document.documentElement.scrollHeight, s: JSON.stringify(document.getElementById('sentence').getBoundingClientRect()), c: JSON.stringify(document.getElementById('compose').getBoundingClientRect()) }));
    check('film: ?film=1 exposes filmDemo and draws a cursor', filmLayout.film === 'function' && filmLayout.cursor, JSON.stringify(filmLayout));
    check('film: film mode does not change layout', filmLayout.h === plainLayout.h && filmLayout.s === plainLayout.s && filmLayout.c === plainLayout.c, JSON.stringify({ filmLayout, plainLayout }));
    if (DEMOS.length) {
      const which = DEMOS.length - 1;
      await page.evaluate(() => { window.__sfx = []; window.__maxY = 0; window.__openY = 0; window.addEventListener('film:sfx', (e) => { window.__sfx.push(e.detail); if (e.detail.type === 'open') window.__openY = window.scrollY; }); setInterval(() => { window.__maxY = Math.max(window.__maxY, window.scrollY); }, 80); });
      const started = Date.now();
      const running = page.evaluate((i) => window.filmDemo(i).then(() => 'done', (e) => `failed: ${e.message}`), which);
      await sleep(5200);
      await page.screenshot({ path: path.join(SHOTS, 'desktop-m-film-typing.png') });
      const outcome = await running;
      const seconds = Math.round((Date.now() - started) / 1000);
      eq('film: filmDemo resolves', outcome, 'done');
      const sfx = await page.evaluate(() => window.__sfx);
      const counts = sfx.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});
      const demo = (BIG || MANIFEST).demos[which];
      check('film: every kind of sound cue is dispatched with a timestamp', ['key', 'click', 'open', 'close', 'tick', 'success', 'hover'].every((t) => counts[t] > 0) && sfx.every((e) => typeof e.t === 'number'), JSON.stringify(counts));
      check('film: one tick per step and one success', counts.tick === demo.steps.length && counts.success === 1, JSON.stringify(counts));
      const keys = sfx.filter((e) => e.type === 'key').map((e) => e.t);
      const gapsMs = keys.slice(1).map((t, i) => t - keys[i]).filter((g) => g < 400);
      const mean = gapsMs.reduce((a, b) => a + b, 0) / gapsMs.length;
      check('film: typing is human paced', keys.length >= tidy(demo.task).length && mean > 45 && mean < 140 && new Set(gapsMs.map((g) => Math.round(g / 8))).size > 3, `mean ${Math.round(mean)} ms over ${keys.length} keys`);
      const end = await page.evaluate(() => ({ robot: document.getElementById('robot').value, task: document.getElementById('task').textContent, viewer: document.getElementById('ql').dataset.open, done: document.getElementById('run-wrap').classList.contains('is-done'), tiles: document.querySelectorAll('#grid .tile').length }));
      check('film: the take ends on the results with the viewer closed', end.robot === tidy(demo.robot) && end.task === tidy(demo.task) && end.viewer === 'false' && end.done && end.tiles === demo.clips.length, JSON.stringify(end));
      const travel = await page.evaluate(() => ({ max: window.__maxY, open: window.__openY }));
      check('film: the take scrolls down through the library and comes back before opening a clip', travel.max - travel.open > 200, JSON.stringify(travel));
      notes.push(`film: filmDemo(${which}) ran for ${seconds} s and dispatched ${sfx.length} cues (${JSON.stringify(counts)})`);
      await page.screenshot({ path: path.join(SHOTS, 'desktop-n-film-end.png') });
    }
    check('film: no console errors', errors.length === 0, errors.join(' | '));
    await page.close();
  }
}

const fitState = (page) => page.evaluate(() => {
  const fit = document.getElementById('fit');
  return {
    level: fit.dataset.level,
    shown: fit.classList.contains('is-on'),
    height: Math.round(fit.getBoundingClientRect().height),
    line: document.getElementById('fit-line').textContent,
    actions: [...document.querySelectorAll('#fit-actions button')].map((n) => n.textContent),
    composeDisabled: document.getElementById('compose').disabled
  };
});

// Verdicts for robot and task pairs, straight from the URL. [robot, task, level, a fragment of the line]
const FIT_CASES = [
  ['SO-101', 'do jumping jacks', 'refuse', JACKS_REFUSAL],
  ['Franka Panda', 'clap twice', 'refuse', 'Clapping needs two hands'],
  ['UR5e', 'fold a t-shirt in half on a table', 'refuse', 'Folding needs two hands'],
  ['xArm 7', 'open a jar of jam', 'refuse', 'Opening a jar needs two hands'],
  ['Koch v1.1', 'walk to the door', 'refuse', 'Walking and running need legs'],
  ['SO-100', 'do the Renegade TikTok dance', 'refuse', 'A dance needs two arms, legs and a torso'],
  ['Sawyer', 'lift the barbell overhead', 'refuse', 'A barbell needs two hands'],
  ['SO-101', 'hold the cup with both hands', 'refuse', 'This task asks for two hands'],
  ['ALOHA (bimanual)', 'fold a towel in half', 'ok', ''],
  ['ALOHA (bimanual)', 'do ten squats', 'refuse', 'An ALOHA (bimanual) is two arms on a fixed base.'],
  ['SO-101', 'follow a dumbbell lateral raise', 'ok', ''],
  ['SO-101', 'pick up the red cup', 'warn', GRIPPER_CAVEAT],
  ['Franka Panda', 'pour water into the glass', 'warn', GRIPPER_CAVEAT],
  ['Unitree G1', 'do jumping jacks', 'ok', ''],
  ['Unitree G1', 'do a dumbbell shoulder press', 'ok', ''],
  ['Unitree G1', 'play the piano with its right hand', 'warn', 'Fingers cannot be learned from video yet, so only the arm and body path is captured.'],
  ['Unitree H1', 'pick up the box', 'warn', 'Hands cannot be learned from video yet'],
  ['LEAP Hand', 'do a squat', 'refuse', 'A LEAP Hand is fingers only.'],
  ['Unitree Go2', 'wave hello', 'refuse', 'A Unitree Go2 is legs and no arms.'],
  ['Unitree Go2', 'walk in a circle', 'ok', ''],
  ['Boston Dynamics Spot', 'pick up the ball', 'warn', GRIPPER_CAVEAT],
  ['Hello Robot Stretch 3', 'do jumping jacks', 'refuse', 'A Hello Robot Stretch 3 is one arm on a wheeled base.'],
  ['Zorg 9', 'do jumping jacks', 'ok', '']
];

// The sentence has to make sense: refusals, caveats, and what the brief and the demos do about them.
async function fitFlow(page, label, shot) {
  const go = async (robot, task) => {
    await page.goto(`${BASE}?robot=${encodeURIComponent(robot)}&task=${encodeURIComponent(task)}&tier=curated-video`, { waitUntil: 'networkidle0' });
    await sleep(500);
  };

  if (label === 'desktop') {
    const wrong = [];
    for (const [robot, task, level, fragment] of FIT_CASES) {
      await page.goto(`${BASE}?robot=${encodeURIComponent(robot)}&task=${encodeURIComponent(task)}`, { waitUntil: 'domcontentloaded' });
      const got = await fitState(page);
      if (got.level !== level || (level !== 'ok' && !got.line.includes(fragment)) || (level === 'ok' && got.shown)) wrong.push(`${robot} / ${task}: ${got.level} "${got.line}"`);
    }
    check(`desktop: ${FIT_CASES.length} robot and task pairs get the right verdict`, wrong.length === 0, wrong.join(' ; '));
  }

  // not runnable
  await go('SO-101', 'do jumping jacks');
  let fit = await fitState(page);
  eq(`${label}: a one-arm robot refuses jumping jacks, in words`, fit.line, JACKS_REFUSAL);
  check(`${label}: the refusal is a visible quiet line with two suggestions`, fit.level === 'refuse' && fit.shown && fit.height > 40 && fit.actions.join('|') === 'Switch to Unitree G1|Make it one arm', JSON.stringify(fit));
  eq(`${label}: Compose run stays enabled when not runnable`, fit.composeDisabled, false);
  const tone = await page.evaluate(() => ({ text: getComputedStyle(document.getElementById('fit-line')).fontSize, copy: getComputedStyle(document.querySelector('.spec-line')).fontSize, dot: getComputedStyle(document.getElementById('fit-line'), '::before').backgroundColor }));
  check(`${label}: same type scale as the line above, red only on the dot`, tone.text === tone.copy && tone.dot === 'rgb(229, 138, 132)', JSON.stringify(tone));
  let of = await overflow(page);
  check(`${label}: no horizontal overflow (not runnable)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));
  await sleep(1600);
  await shot('o-not-runnable');

  // "Make it one arm" offers an example and rewrites nothing until asked
  await page.click('#fit-actions button:nth-child(2)');
  await sleep(450);
  fit = await fitState(page);
  check(`${label}: "Make it one arm" offers an example and leaves the task alone`, /^A one-arm version could be: ".+"\.$/.test(fit.line) && fit.actions[0] === 'Use this example' && (await page.$eval('#task', (n) => n.textContent)) === 'do jumping jacks', JSON.stringify(fit));
  await shot('o2-one-arm-example');
  await page.click('#fit-actions button:nth-child(1)');
  await sleep(500);
  fit = await fitState(page);
  check(`${label}: using the example makes the run fine again and folds the line away`, fit.level === 'ok' && !fit.shown && fit.height === 0 && /arm/.test(await page.$eval('#task', (n) => n.textContent)), JSON.stringify(fit));

  // the brief leads with the refusal and never shows a command
  await go('SO-101', 'do jumping jacks');
  await page.click('#compose');
  await sleep(1300);
  const refused = await page.evaluate(() => ({
    title: document.getElementById('brief-title').textContent,
    first: document.getElementById('brief').innerText.trim().split('\n')[0],
    why: document.getElementById('brief-fit-row').hidden ? '' : document.getElementById('brief-fit-row').innerText.replace(/\s+/g, ' ').trim(),
    runRow: document.getElementById('brief-run-row').hidden,
    cmd: document.getElementById('cmd').textContent,
    runHidden: document.getElementById('run-wrap').hidden,
    words: document.getElementById('brief').innerText
  }));
  check(`${label}: the brief leads with "Not runnable on this robot"`, refused.title === 'Not runnable on this robot' && refused.first === 'Not runnable on this robot' && refused.why === `Why not ${JACKS_REFUSAL}`, JSON.stringify(refused));
  check(`${label}: a refused brief never shows a command`, refused.runRow && refused.cmd === '' && !/pnpm|agent\.mts/.test(refused.words) && refused.runHidden, JSON.stringify(refused));
  await page.evaluate(() => document.getElementById('brief').scrollIntoView({ block: 'center' }));
  await sleep(400);
  await shot('o3-not-runnable-brief');
  try {
    await page.click('#copy-json');
    await sleep(200);
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    check(`${label}: the JSON brief says it is not runnable`, copied.runnable === false && copied.note === JACKS_REFUSAL, JSON.stringify(copied));
  } catch (e) {
    notes.push(`${label}: clipboard read-back of the refused brief not verified (${e.message})`);
  }

  // one click to a robot that can do it
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  await page.click('#fit-actions button:nth-child(1)');
  await sleep(600);
  fit = await fitState(page);
  check(`${label}: "Switch to Unitree G1" changes the robot and clears the refusal`, (await page.$eval('#robot', (n) => n.value)) === 'Unitree G1' && fit.level === 'ok' && !fit.shown && (await page.$eval('#brief-title', (n) => n.textContent)) === 'Run brief', JSON.stringify(fit));

  // caveat: runnable, said plainly
  await go('SO-101', 'pick up the red cup with its left hand, twice, slowly');
  fit = await fitState(page);
  check(`${label}: a grasp on an arm is runnable with the gripper caveat`, fit.level === 'warn' && fit.shown && fit.line === GRIPPER_CAVEAT && fit.actions.length === 0, JSON.stringify(fit));
  eq(`${label}: the caveat dot is the accent, not red`, await page.evaluate(() => getComputedStyle(document.getElementById('fit-line'), '::before').backgroundColor), 'rgb(127, 178, 255)');
  await sleep(1600);
  await shot('p-caveat');
  await page.click('#compose');
  await sleep(1300);
  const warned = await page.evaluate(() => ({ title: document.getElementById('brief-title').textContent, row: document.getElementById('brief-fit-row').innerText.replace(/\s+/g, ' ').trim(), cmd: document.getElementById('cmd').textContent }));
  check(`${label}: the brief carries the caveat and still shows the command`, warned.title === 'Run brief' && warned.row === `Caveat ${GRIPPER_CAVEAT}` && /--robot so101/.test(warned.cmd), JSON.stringify(warned));

  // the line waits for a pause in typing, then eases open; the sentence never moves
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}?robot=SO-101`, { waitUntil: 'networkidle0' });
  await sleep(1600);
  const sentenceTop = await page.evaluate(() => document.getElementById('sentence').getBoundingClientRect().top);
  await page.click('#task');
  await page.keyboard.type('do jumping jacks', { delay: 12 });
  const early = await fitState(page);
  await sleep(900);
  const late = await fitState(page);
  check(`${label}: the verdict is live but the line waits for a pause`, early.level === 'refuse' && !early.shown && late.shown && late.line === JACKS_REFUSAL, JSON.stringify({ early, late }));
  eq(`${label}: the sentence does not move when the line appears`, await page.evaluate(() => document.getElementById('sentence').getBoundingClientRect().top), sentenceTop);
}

// A recorded demo that makes no sense for its robot must not play.
async function nonsense() {
  if (!NONSENSE) return;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await serveManifest(page, NONSENSE);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(800);
  await page.click('#chips .chip:nth-child(1)');
  await until(page, () => document.getElementById('task').textContent === 'do jumping jacks' && document.activeElement.id === 'compose', 6000);
  await page.click('#compose');
  await sleep(1200);
  const got = await page.evaluate(() => ({ run: !document.getElementById('run-wrap').hidden, brief: document.getElementById('brief-wrap').classList.contains('is-open'), title: document.getElementById('brief-title').textContent, tiles: document.querySelectorAll('#grid .tile').length }));
  check('nonsense demo: a recorded demo never plays for a robot that cannot do the task', !got.run && got.brief && got.title === 'Not runnable on this robot' && got.tiles === 0, JSON.stringify(got));
  await page.close();
}

// Twenty-four clips: columns, gaps, stillness, the sticky summary, keyboard, one download at a time.
async function library() {
  if (!BIG) { notes.push('library: no manifest, 24 clip checks skipped'); return; }
  console.log('\n=== library of 24 ===');
  await nonsense();
  const sizes = [
    ['desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }, 4],
    ['laptop', { width: 1280, height: 800, deviceScaleFactor: 1 }, 4],
    ['wide', { width: 1920, height: 1080, deviceScaleFactor: 1 }, 5],
    ['mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 2]
  ];
  for (const [label, viewport, wantCols] of sizes) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errors = [];
    const live = new Set();
    let mostAtOnce = 0;
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await serveManifest(page, BIG);
    page.on('request', (r) => { if (/\.mp4(\?|$)/.test(r.url())) { live.add(r); mostAtOnce = Math.max(mostAtOnce, live.size); } });
    page.on('requestfinished', (r) => live.delete(r));
    page.on('requestfailed', (r) => { live.delete(r); if (!isCancelledClip(r)) errors.push(`requestfailed: ${r.url()}`); });

    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(700);
    await page.click('#chips .chip:nth-child(1)');
    await until(page, () => !document.getElementById('compose').disabled && document.activeElement.id === 'compose', 6000);
    await page.click('#compose');
    await sleep(1000);

    // skip, and look at the very first moment of the library
    const built = await page.evaluate(async () => {
      const t0 = performance.now();
      document.getElementById('run-skip').click();
      const t1 = performance.now();
      const tiles = [...document.querySelectorAll('#grid .tile')];
      const grid = document.getElementById('grid');
      const first = { count: tiles.length, staggered: tiles.filter((t) => !t.classList.contains('is-in')).length, gridHeight: grid.getBoundingClientRect().height, heights: [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().height)))] };
      let frames = 0; let worst = 0; let last = performance.now();
      await new Promise((resolve) => { const tick = (now) => { worst = Math.max(worst, now - last); last = now; frames += 1; if (now - t1 < 1200) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      return { ...first, ms: Math.round(t1 - t0), frames, worst: Math.round(worst) };
    });
    const demo = BIG.demos[0];
    eq(`${label}: 24 tiles`, built.count, demo.clips.length);
    check(`${label}: only the first screenful staggers in`, built.staggered > 0 && built.staggered < built.count && built.staggered <= 16, JSON.stringify(built));
    check(`${label}: opening a 24 tile library is cheap`, built.ms < 60 && built.frames >= 36, JSON.stringify(built));
    notes.push(`${label}: library opened in ${built.ms} ms of script, ${built.frames} frames in the next 1.2 s, worst frame ${built.worst} ms`);
    await sleep(900);

    const layout = await page.evaluate(() => {
      const grid = document.getElementById('grid');
      const s = getComputedStyle(grid);
      const tiles = [...grid.querySelectorAll('.tile')];
      const imgs = tiles.map((t) => t.querySelector('img'));
      return {
        cols: s.gridTemplateColumns.split(' ').length, gap: `${s.rowGap} ${s.columnGap}`, gridHeight: grid.getBoundingClientRect().height,
        ratios: [...new Set(tiles.map((t) => { const r = t.getBoundingClientRect(); return Math.round((r.width / r.height) * 100) / 100; }))],
        lazy: imgs.every((i) => i.loading === 'lazy' && i.decoding === 'async'),
        faded: imgs.filter((i) => i.complete && i.naturalWidth).every((i) => i.classList.contains('is-loaded') && Number(getComputedStyle(i).opacity) > 0),
        fade: getComputedStyle(imgs[0]).transitionProperty,
        tabbable: tiles.filter((t) => t.tabIndex === 0).length,
        allIn: tiles.every((t) => t.classList.contains('is-in'))
      };
    });
    eq(`${label}: ${wantCols} columns`, layout.cols, wantCols);
    eq(`${label}: 8px gaps both ways`, layout.gap, '8px 8px');
    check(`${label}: fixed 16:9 boxes, so posters cannot shift anything`, layout.ratios.length === 1 && Math.abs(layout.ratios[0] - 1.78) < 0.02 && Math.abs(layout.gridHeight - built.gridHeight) < 1, JSON.stringify({ layout, before: built.gridHeight }));
    check(`${label}: posters lazy-load and fade in`, layout.lazy && layout.faded && /opacity/.test(layout.fade) && layout.allIn, JSON.stringify(layout));
    eq(`${label}: the grid is one tab stop`, layout.tabbable, 1);
    const of = await overflow(page);
    check(`${label}: no horizontal overflow (24 tiles)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));
    await page.screenshot({ path: path.join(SHOTS, `${label}-q-library-24.png`) });
    await page.screenshot({ path: path.join(SHOTS, `${label}-q2-library-24-full.png`), fullPage: true });

    // the summary row sticks while the grid scrolls under it
    await page.evaluate(() => { const g = document.getElementById('grid').getBoundingClientRect(); window.scrollBy(0, g.top + g.height * 0.4); });
    await sleep(600);
    const stuck = await page.evaluate(() => {
      const bar = getComputedStyle(document.getElementById('summary')).display === 'contents' ? document.getElementById('stats') : document.getElementById('summary');
      const r = bar.getBoundingClientRect();
      const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { top: Math.round(r.top), flagged: document.getElementById('summary').classList.contains('is-stuck'), onTop: bar.contains(under), found: document.querySelector('#stats [data-key="found"] dd').textContent };
    });
    check(`${label}: the summary row sticks to the top over the grid`, stuck.top === 8 && stuck.flagged && stuck.onTop && stuck.found === String(demo.summary.found), JSON.stringify(stuck));
    await page.screenshot({ path: path.join(SHOTS, `${label}-q3-library-24-scrolled.png`) });

    if (!viewport.isMobile) {
      // arrow keys walk the grid
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.focus('#grid .tile:nth-child(1)');
      const focused = () => page.evaluate(() => Number(document.activeElement.dataset.index));
      await page.keyboard.press('ArrowRight');
      eq(`${label}: right arrow moves focus to the next tile`, await focused(), 1);
      await page.keyboard.press('ArrowDown');
      eq(`${label}: down arrow moves one row down`, await focused(), 1 + wantCols);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowUp');
      eq(`${label}: left and up come back`, await focused(), 0);
      await page.keyboard.press('ArrowLeft');
      eq(`${label}: the first tile is an edge`, await focused(), 0);
      await page.keyboard.press('End');
      eq(`${label}: End jumps to the last tile`, await focused(), 23);
      const seen = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
      check(`${label}: the focused tile is scrolled into view`, seen);
      eq(`${label}: the tab stop follows focus`, await page.evaluate(() => [...document.querySelectorAll('#grid .tile')].findIndex((t) => t.tabIndex === 0)), 23);

      // the viewer counts across all 24 and wraps
      await page.keyboard.press('Enter');
      await sleep(1200);
      eq(`${label}: viewer counts across the whole library`, await page.$eval('#ql-count', (n) => n.textContent), '24 of 24');
      await page.keyboard.press('ArrowRight');
      await sleep(700);
      eq(`${label}: next from the last clip is the first`, await page.$eval('#ql-count', (n) => n.textContent), '1 of 24');
      for (let i = 0; i < 3; i += 1) { await page.keyboard.press('ArrowRight'); await sleep(450); }
      eq(`${label}: arrows keep walking`, `${await page.$eval('#ql-count', (n) => n.textContent)}|${await page.$eval('#ql-title', (n) => n.textContent)}`, `4 of 24|${demo.clips[3].title}`);
      await page.keyboard.press('Escape');
      await sleep(900);
      eq(`${label}: closing returns focus to the clip that was showing`, await focused(), 3);

      // sweep the pointer over a row: never two clips playing, never two on the wire
      await page.evaluate(() => document.querySelector('#grid .tile').scrollIntoView({ block: 'center' }));
      await sleep(400);
      let mostPlaying = 0;
      for (const n of [1, 2, 3, 4, 3, 2]) {
        await page.hover(`#grid .tile:nth-child(${n})`);
        for (let i = 0; i < 4; i += 1) {
          await sleep(110);
          mostPlaying = Math.max(mostPlaying, await page.$$eval('#grid .tile video', (vs) => vs.filter((v) => !v.paused).length));
        }
      }
      await sleep(700);
      const resting = await page.evaluate(() => ({ playing: [...document.querySelectorAll('#grid .tile video')].filter((v) => !v.paused).length, loaded: [...document.querySelectorAll('#grid .tile video')].filter((v) => v.getAttribute('src')).length }));
      const playable = hasClipFiles(MANIFEST.demos[0]);
      check(`${label}: sweeping across tiles never plays two clips`, mostPlaying <= 1 && (!playable || resting.playing === 1), JSON.stringify({ mostPlaying, resting }));
      check(`${label}: sweeping across tiles never downloads two clips at once`, mostAtOnce <= 1 && (!playable || resting.loaded === 1), JSON.stringify({ mostAtOnce, resting }));
      await page.mouse.move(4, 4);
      await sleep(300);
    } else {
      await page.evaluate(() => document.querySelector('#grid .tile:nth-child(9)').scrollIntoView({ block: 'center' }));
      await sleep(400);
      await page.tap('#grid .tile:nth-child(9)');
      await sleep(1300);
      eq(`${label}: a tap deep in the grid opens that clip`, await page.$eval('#ql-count', (n) => n.textContent), '9 of 24');
      await page.click('#ql-close');
      await sleep(700);
      check(`${label}: one clip at most was ever on the wire`, mostAtOnce <= 1, String(mostAtOnce));
    }
    check(`${label}: no console errors (24 tiles)`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
}

async function run(label, viewport) {
  console.log(`\n=== ${label} ${viewport.width}x${viewport.height} ===`);
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  const foreign = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!isCancelledClip(r)) errors.push(`requestfailed: ${r.url()}`); });
  page.on('request', (r) => { try { const h = new URL(r.url()).hostname; if (r.url().startsWith('http') && !ALLOWED_HOSTS.has(h)) foreign.push(r.url()); } catch (_) {} });
  const shot = (name, opts = {}) => page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), ...opts });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1900);

  // (a) empty state
  eq(`${label}: title`, await page.title(), 'Player Two');
  eq(`${label}: wordmark`, await text(page, '.wordmark'), 'Player Two');
  eq(`${label}: tagline is sentence case`, await text(page, '.hero-tag'), 'Train a robot from video');
  eq(`${label}: specificity copy`, await text(page, '.spec-line'), 'The more specific you are, the better the training data. Start with a verb and an object.');
  const hero = await page.evaluate(() => {
    const panel = document.getElementById('hero');
    const r = panel.getBoundingClientRect();
    const s = getComputedStyle(panel);
    return { left: r.left, right: document.documentElement.clientWidth - r.right, top: r.top, ratio: r.height / window.innerHeight, radius: s.borderTopLeftRadius, bottomRadius: s.borderBottomLeftRadius, image: getComputedStyle(document.querySelector('.hero-img')).backgroundImage, grain: getComputedStyle(document.querySelector('.grain')).opacity };
  });
  check(`${label}: hero panel is inset 16 to 24px with 24px top corners`, hero.left >= 16 && hero.left <= 24 && hero.right >= 16 && hero.right <= 24 && hero.top >= 16 && hero.top <= 24 && hero.radius === '24px' && hero.bottomRadius === '0px', JSON.stringify(hero));
  check(`${label}: hero is at least 78vh and carries the wallpaper and grain`, hero.ratio >= 0.779 && /wallpaper-hero\.jpg/.test(hero.image) && Number(hero.grain) === 0.25, JSON.stringify(hero));
  eq(`${label}: footer`, await text(page, '.foot p'), 'Player Two composes training runs. It produces retargeted demonstrations, it does not train a policy.');
  eq(`${label}: button disabled before input`, await page.$eval('#compose', (b) => b.disabled), true);
  eq(`${label}: button label`, await text(page, '#compose'), 'Compose run');
  eq(`${label}: empty meter`, await score(page), '0/5');
  eq(`${label}: empty sentence`, await text(page, '#sentence'), 'I want to train a to with curated video data.');
  eq(`${label}: brief hidden at start`, await page.$eval('#brief-wrap', (n) => n.inert && !n.classList.contains('is-open')), true);
  const fonts = await page.evaluate(() => ({
    serif: document.fonts.check('40px "Hedvig Letters Serif"'),
    sans: document.fonts.check('15px Inter'),
    family: getComputedStyle(document.getElementById('sentence')).fontFamily
  }));
  check(`${label}: web fonts loaded`, fonts.serif && fonts.sans, JSON.stringify(fonts));
  let of = await overflow(page);
  check(`${label}: no horizontal overflow (empty)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));
  await shot('a-empty');

  // (b) robot list
  await page.click('#robot');
  await sleep(700);
  eq(`${label}: robot list opens on click`, await page.$eval('#robot', (n) => n.getAttribute('aria-expanded')), 'true');
  eq(`${label}: robot option count`, await page.$$eval('#robot-list [role=option]', (n) => n.length), 37);
  eq(`${label}: exactly three live robots`, (await page.$$eval('#robot-list [role=option]', (ns) => ns.filter((n) => n.querySelector('.tag').textContent === 'live').map((n) => n.querySelector('.opt-name').textContent))).join('|'), 'SO-101|Franka Panda|Unitree G1');
  eq(`${label}: four groups`, (await page.$$eval('#robot-list .pop-label', (ns) => ns.map((n) => n.textContent))).join('|'), 'Arms|Humanoids|Hands|Quadrupeds and mobile');
  let box = await inViewport(page, '#robot-list');
  check(`${label}: robot list inside viewport`, box.left >= 0 && box.right <= box.vw && box.bottom <= box.vh + 1, JSON.stringify(box));
  await shot('b-robot-list');
  if (label === 'mobile') {
    eq('mobile: robot list is a bottom sheet', await page.$eval('#robot-list', (n) => { const s = getComputedStyle(n); return `${s.position} ${Math.round(window.innerHeight - n.getBoundingClientRect().bottom)}`; }), 'fixed 0');
  } else {
    eq('desktop: robot menu grows out of its anchor', await page.$eval('#robot-list', (n) => getComputedStyle(n).transformOrigin.split(' ')[1]), '0px');
  }
  check(`${label}: options are at least 44px tall`, await page.$$eval('#robot-list [role=option]', (ns) => ns.every((n) => n.getBoundingClientRect().height >= 44)));

  await page.keyboard.type('so', { delay: 40 });
  await sleep(250);
  eq(`${label}: "so" filters to SO arms`, (await page.$$eval('#robot-list [role=option] .opt-name', (ns) => ns.map((n) => n.textContent))).join('|'), 'SO-101|SO-100');
  eq(`${label}: button still disabled while typing robot`, await page.$eval('#compose', (b) => b.disabled), true);
  await shot('b2-robot-filtered');
  const so101 = await page.evaluateHandle(() => [...document.querySelectorAll('#robot-list [role=option]')].find((n) => n.querySelector('.opt-name').textContent === 'SO-101'));
  await so101.click();
  await sleep(250);
  eq(`${label}: robot value`, await page.$eval('#robot', (n) => n.value), 'SO-101');
  eq(`${label}: article is "an" for SO-101`, await text(page, '#article'), 'an');
  eq(`${label}: list closed after pick`, await page.$eval('#robot', (n) => n.getAttribute('aria-expanded')), 'false');
  eq(`${label}: focus moved to task`, await page.evaluate(() => document.activeElement.id), 'task');
  eq(`${label}: button disabled with robot only`, await page.$eval('#compose', (b) => b.disabled), true);

  // task + specificity meter
  const steps = [['pick up', '0/5'], [' the red cup', '2/5'], [' with its left hand', '3/5'], [', twice', '4/5']];
  const seen = [];
  for (const [chunk, want] of steps) {
    await page.keyboard.type(chunk, { delay: 8 });
    await sleep(60);
    const got = await score(page);
    seen.push(got);
    eq(`${label}: meter after "${chunk.trim()}"`, got, want);
  }
  check(`${label}: meter changes as words are added`, new Set(seen).size === seen.length, seen.join(','));
  eq(`${label}: hint at 4/5`, await text(page, '#spec-hint'), 'Say how fast or how carefully.');
  await page.keyboard.type(', slowly', { delay: 8 });
  eq(`${label}: meter at 5/5`, await score(page), '5/5');
  eq(`${label}: hint at 5/5`, await text(page, '#spec-hint'), 'That is specific enough to search for.');
  eq(`${label}: lit segments`, await page.$$eval('#meter .seg.is-on', (n) => n.length), 5);
  eq(`${label}: meter aria`, await page.$eval('#meter', (n) => n.getAttribute('aria-valuenow')), '5');
  eq(`${label}: button enabled`, await page.$eval('#compose', (b) => b.disabled), false);

  await page.keyboard.press('Enter');
  eq(`${label}: Enter in task moves to tier`, await page.evaluate(() => document.activeElement.id), 'tier');
  eq(`${label}: Enter did not add a newline`, await page.$eval('#task', (n) => n.textContent), TASK);

  // tier
  await page.click('#tier');
  await sleep(700);
  eq(`${label}: tier list open`, await page.$eval('#tier', (n) => n.getAttribute('aria-expanded')), 'true');
  eq(`${label}: tier options`, (await page.$$eval('#tier-list [role=option]', (ns) => ns.map((n) => `${n.querySelector('.opt-title').textContent}/${n.querySelector('.tag').textContent}`))).join('|'), 'Operator-grade/Tier 1|Curated video/Tier 2|Open web video/Tier 3');
  box = await inViewport(page, '#tier-list');
  check(`${label}: tier list inside viewport`, box.left >= 0 && box.right <= box.vw && box.bottom <= box.vh + 1 && box.top >= 0, JSON.stringify(box));
  await shot('b3-tier-list');
  const curated = await page.evaluateHandle(() => [...document.querySelectorAll('#tier-list [role=option]')].find((n) => n.querySelector('.opt-title').textContent === 'Curated video'));
  await curated.click();
  await sleep(350);
  eq(`${label}: tier label lowercase`, await text(page, '#tier-label'), 'curated video');
  eq(`${label}: tier list closed`, await page.$eval('#tier', (n) => n.getAttribute('aria-expanded')), 'false');
  await shot('b4-filled');

  // (c) compose
  await page.click('#compose');
  await sleep(1300);
  eq(`${label}: brief open`, await page.$eval('#brief-wrap', (n) => n.classList.contains('is-open') && !n.inert), true);
  eq(`${label}: brief sentence`, await text(page, '#brief-sentence'), `I want to train an SO-101 to ${TASK} with curated video data.`);
  eq(`${label}: brief status`, await text(page, '#brief-status'), 'Live');
  eq(`${label}: an unmatched run shows the brief, not a run`, await page.$eval('#run-wrap', (n) => n.hidden), true);
  eq(`${label}: brief robot line`, await text(page, '#brief-robot-line'), 'Runs today.');
  eq(`${label}: exact command`, await page.$eval('#cmd', (n) => n.textContent), `pnpm dlx tsx scripts/agent/agent.mts "${TASK}" --robot so101 --max-videos 8 --seconds 6`);
  eq(`${label}: operator line hidden for tier 2`, await page.$eval('#brief-operator-line', (n) => n.hidden), true);
  const briefText = await text(page, '#brief');
  check(`${label}: brief does not claim a run was queued`, /Nothing has been queued or trained/.test(briefText) && !/\b(queued successfully|training started|run started)\b/i.test(briefText));
  eq(`${label}: url carries the blanks`, await page.evaluate(() => new URLSearchParams(location.search).get('robot') + '|' + new URLSearchParams(location.search).get('tier')), 'SO-101|curated-video');
  of = await overflow(page);
  check(`${label}: no horizontal overflow (brief)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));
  await shot('c-brief', { fullPage: true });
  await shot('c2-brief-viewport');

  // copy buttons
  try {
    await page.click('#copy-json');
    await sleep(200);
    eq(`${label}: copy feedback`, await text(page, '#copy-json'), 'Copied');
    const clip = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    eq(`${label}: JSON brief`, JSON.stringify(clip), JSON.stringify({ robot: 'SO-101', robotStatus: 'live', task: TASK, specificity: 5, tier: 'Curated video', runnable: true, note: GRIPPER_CAVEAT }));
    await page.click('#copy-cmd');
    await sleep(200);
    eq(`${label}: copied command`, await page.evaluate(() => navigator.clipboard.readText()), `pnpm dlx tsx scripts/agent/agent.mts "${TASK}" --robot so101 --max-videos 8 --seconds 6`);
  } catch (e) {
    notes.push(`${label}: clipboard read-back not verified (${e.message})`);
  }

  // tier by keyboard: tier 3 then tier 1
  await page.focus('#tier');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(200);
  eq(`${label}: keyboard pick tier 3`, await text(page, '#tier-label'), 'open web video');
  eq(`${label}: tier 3 command`, await page.$eval('#cmd', (n) => n.textContent), `pnpm dlx tsx scripts/agent/agent.mts "${TASK}" --robot so101 --max-videos 8 --seconds 6 --allow-standard-license`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await sleep(200);
  eq(`${label}: keyboard pick tier 1`, await text(page, '#tier-label'), 'operator-grade');
  eq(`${label}: tier 1 hides command`, await page.$eval('#cmd-block', (n) => n.hidden), true);
  eq(`${label}: tier 1 operator line`, await page.$eval('#brief-operator-line', (n) => (n.hidden ? '' : n.textContent)), 'Operator sessions run in the teleoperation page of the Player Two app.');
  await page.keyboard.press('Enter');
  await sleep(150);
  await page.keyboard.press('Escape');
  await sleep(150);
  eq(`${label}: Escape closes tier list`, await page.$eval('#tier', (n) => n.getAttribute('aria-expanded')), 'false');
  eq(`${label}: Escape kept the tier`, await text(page, '#tier-label'), 'operator-grade');

  // planned robot by keyboard
  await page.click('#robot');
  await sleep(180);
  await page.keyboard.type('spot', { delay: 20 });
  await page.keyboard.press('Enter');
  await sleep(250);
  eq(`${label}: planned robot picked`, await page.$eval('#robot', (n) => n.value), 'Boston Dynamics Spot');
  eq(`${label}: planned status`, await text(page, '#brief-status'), 'Planned');
  eq(`${label}: planned line`, await text(page, '#brief-robot-line'), 'Not wired up yet. The brief is saved for when it is.');
  eq(`${label}: planned hides run row`, await page.$eval('#brief-run-row', (n) => n.hidden), true);
  of = await overflow(page);
  check(`${label}: no horizontal overflow (long robot name)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));

  // custom robot
  await page.click('#robot');
  await sleep(180);
  await page.keyboard.type('Zorg 9', { delay: 20 });
  await sleep(200);
  eq(`${label}: custom option offered`, (await page.$$eval('#robot-list [role=option]', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()))).join('|'), 'Use "Zorg 9" Custom');
  await page.keyboard.press('Enter');
  await sleep(250);
  eq(`${label}: custom status`, await text(page, '#brief-status'), 'Custom');
  eq(`${label}: custom sentence`, await text(page, '#brief-sentence'), `I want to train a Zorg 9 to ${TASK} with operator-grade data.`);

  // Escape and click outside
  await page.click('#robot');
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(150);
  eq(`${label}: Escape closes robot list`, await page.$eval('#robot', (n) => n.getAttribute('aria-expanded')), 'false');
  await page.click('#robot');
  await sleep(200);
  eq(`${label}: robot list reopens on click`, await page.$eval('#robot', (n) => n.getAttribute('aria-expanded')), 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check(`${label}: arrow keys set aria-activedescendant`, Boolean(await page.$eval('#robot', (n) => n.getAttribute('aria-activedescendant'))));
  await page.mouse.click(8, 8);
  await sleep(200);
  eq(`${label}: click outside closes robot list`, await page.$eval('#robot', (n) => n.getAttribute('aria-expanded')), 'false');
  eq(`${label}: robot kept after dismiss`, await page.$eval('#robot', (n) => n.value), 'Zorg 9');

  // clearing the robot disables the button and folds the brief
  await page.click('#robot');
  await sleep(180);
  await page.keyboard.press('Backspace');
  await page.mouse.click(8, 8);
  await sleep(200);
  eq(`${label}: cleared robot disables button`, await page.$eval('#compose', (b) => b.disabled), true);
  eq(`${label}: cleared robot dims and locks the brief`, await page.$eval('#brief-wrap', (n) => n.classList.contains('is-stale') && document.getElementById('brief').inert), true);

  // persistence
  await page.click('#robot');
  await sleep(180);
  await page.keyboard.type('franka p', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  eq(`${label}: robot restored from localStorage`, await page.$eval('#robot', (n) => n.value), 'Franka Panda');
  eq(`${label}: task restored from localStorage`, await page.$eval('#task', (n) => n.textContent), TASK);
  eq(`${label}: tier restored from localStorage`, await text(page, '#tier-label'), 'operator-grade');
  eq(`${label}: button enabled after restore`, await page.$eval('#compose', (b) => b.disabled), false);

  // tab order
  await page.focus('#robot');
  const order = ['robot'];
  for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.id)); }
  eq(`${label}: tab order`, order.join('>'), 'robot>task>tier>compose');
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineColor}`; });
  eq(`${label}: accent focus ring on button`, ring, 'solid rgb(127, 178, 255)');

  // shareable URL
  await page.goto(`${BASE}?robot=Unitree%20G1&task=wave%20hello%20with%20its%20hand&tier=3`, { waitUntil: 'networkidle0' });
  eq(`${label}: url robot`, await page.$eval('#robot', (n) => n.value), 'Unitree G1');
  eq(`${label}: url task`, await page.$eval('#task', (n) => n.textContent), 'wave hello with its hand');
  eq(`${label}: url tier`, await text(page, '#tier-label'), 'open web video');
  eq(`${label}: url article`, await text(page, '#article'), 'a');
  eq(`${label}: hint names the limb`, await text(page, '#spec-hint'), 'Say which hand.');

  // shell escaping
  await page.goto(`${BASE}?robot=panda&tier=curated-video&task=${encodeURIComponent('say "hi" to $HOME and `whoami`')}`, { waitUntil: 'networkidle0' });
  await page.click('#compose');
  await sleep(300);
  eq(`${label}: command escapes quotes and expansions`, await page.$eval('#cmd', (n) => n.textContent), 'pnpm dlx tsx scripts/agent/agent.mts "say \\"hi\\" to \\$HOME and \\`whoami\\`" --robot panda --max-videos 8 --seconds 6');

  if (label === 'desktop') {
    const wrong = [];
    for (const [name, want] of Object.entries(EXPECTED_ARTICLES)) {
      await page.goto(`${BASE}?robot=${encodeURIComponent(name)}`, { waitUntil: 'domcontentloaded' });
      const got = await text(page, '#article');
      if (got !== want) wrong.push(`${name}: ${got}`);
    }
    check('desktop: a/an correct for all 37 catalog robots', wrong.length === 0, wrong.join('; '));

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    eq('desktop: reduced motion removes the blur-in', await page.$eval('#sentence', (n) => getComputedStyle(n).animationName), 'none');
    await page.emulateMediaFeatures([]);
  }

  await fitFlow(page, label, shot);
  await demoFlow(page, label, shot);

  check(`${label}: no console errors or warnings`, errors.length === 0, errors.join(' | '));
  check(`${label}: no requests beyond Google Fonts`, foreign.length === 0, foreign.join(' | '));
  await page.close();
}

try {
  await run('desktop', { width: 1440, height: 900, deviceScaleFactor: 1 });
  await run('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await extras();
  await library();
} catch (e) {
  failures += 1;
  console.log(`CRASH ${e.stack}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed, ${failures} failed`);
for (const n of notes) console.log(`NOTE  ${n}`);
process.exit(failures ? 1 : 0);
