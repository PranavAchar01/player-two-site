// Headless flow test for the Player Two one-sentence site.
// Run: node /Users/pranavachar/helloworld/player-two-site/.tests/flow.mjs
import puppeteer from '/Users/pranavachar/helloworld/player-two/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
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

async function run(label, viewport) {
  console.log(`\n=== ${label} ${viewport.width}x${viewport.height} ===`);
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  const foreign = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('request', (r) => { try { const h = new URL(r.url()).hostname; if (r.url().startsWith('http') && !ALLOWED_HOSTS.has(h)) foreign.push(r.url()); } catch (_) {} });
  const shot = (name, opts = {}) => page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), ...opts });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1900);

  // (a) empty state
  eq(`${label}: title`, await page.title(), 'Player Two');
  eq(`${label}: eyebrow`, await text(page, '.eyebrow--lead'), 'PLAYER TWO · TRAIN A ROBOT FROM VIDEO');
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
  await sleep(350);
  eq(`${label}: robot list opens on click`, await page.$eval('#robot', (n) => n.getAttribute('aria-expanded')), 'true');
  eq(`${label}: robot option count`, await page.$$eval('#robot-list [role=option]', (n) => n.length), 37);
  eq(`${label}: exactly three live robots`, (await page.$$eval('#robot-list [role=option]', (ns) => ns.filter((n) => n.querySelector('.tag').textContent === 'live').map((n) => n.querySelector('.opt-name').textContent))).join('|'), 'SO-101|Franka Panda|Unitree G1');
  eq(`${label}: four groups`, (await page.$$eval('#robot-list .pop-label', (ns) => ns.map((n) => n.textContent))).join('|'), 'Arms|Humanoids|Hands|Quadrupeds and mobile');
  let box = await inViewport(page, '#robot-list');
  check(`${label}: robot list inside viewport`, box.left >= 0 && box.right <= box.vw && box.bottom <= box.vh + 1, JSON.stringify(box));
  await shot('b-robot-list');

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
  await sleep(450);
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
  eq(`${label}: brief status`, await text(page, '#brief-status'), 'LIVE');
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
    eq(`${label}: JSON brief`, JSON.stringify(clip), JSON.stringify({ robot: 'SO-101', robotStatus: 'live', task: TASK, specificity: 5, tier: 'Curated video' }));
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
  eq(`${label}: planned status`, await text(page, '#brief-status'), 'PLANNED');
  eq(`${label}: planned line`, await text(page, '#brief-robot-line'), 'Not wired up yet. The brief is saved for when it is.');
  eq(`${label}: planned hides run row`, await page.$eval('#brief-run-row', (n) => n.hidden), true);
  of = await overflow(page);
  check(`${label}: no horizontal overflow (long robot name)`, of.doc <= 0 && of.body <= 0, JSON.stringify(of));

  // custom robot
  await page.click('#robot');
  await sleep(180);
  await page.keyboard.type('Zorg 9', { delay: 20 });
  await sleep(200);
  eq(`${label}: custom option offered`, (await page.$$eval('#robot-list [role=option]', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()))).join('|'), 'Use "Zorg 9" CUSTOM');
  await page.keyboard.press('Enter');
  await sleep(250);
  eq(`${label}: custom status`, await text(page, '#brief-status'), 'CUSTOM');
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
  eq(`${label}: pink focus ring on button`, ring, 'solid rgb(255, 95, 162)');

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

  check(`${label}: no console errors or warnings`, errors.length === 0, errors.join(' | '));
  check(`${label}: no requests beyond Google Fonts`, foreign.length === 0, foreign.join(' | '));
  await page.close();
}

try {
  await run('desktop', { width: 1440, height: 900, deviceScaleFactor: 1 });
  await run('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
