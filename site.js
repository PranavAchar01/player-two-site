/* Player Two: one sentence, three blanks. No framework, no backend. */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ data */

  // Only these three are wired into the real pipeline today.
  const LIVE_IDS = { 'Unitree G1': 'g1', 'SO-101': 'so101', 'Franka Panda': 'panda' };

  const CATALOG = [
    { group: 'Arms', items: ['SO-101', 'SO-100', 'Koch v1.1', 'Franka Panda', 'Franka FR3', 'UR3e', 'UR5e', 'UR10e', 'xArm 6', 'xArm 7', 'UFACTORY Lite 6', 'Kinova Gen3', 'KUKA LBR iiwa 14', 'Sawyer', 'WidowX 250', 'ViperX 300', 'myCobot 280', 'ALOHA (bimanual)', 'Trossen WidowX AI'] },
    { group: 'Humanoids', items: ['Unitree G1', 'Unitree H1', 'Fourier GR-1', 'Booster T1', 'Agility Digit', 'Apptronik Apollo', '1X NEO', 'Figure 02', 'Tesla Optimus'] },
    { group: 'Hands', items: ['LEAP Hand', 'Allegro Hand', 'Shadow Dexterous Hand', 'Inspire RH56'] },
    { group: 'Quadrupeds and mobile', items: ['Unitree Go2', 'Boston Dynamics Spot', 'ANYmal', 'Hello Robot Stretch 3', 'PAL TIAGo'] }
  ];

  const ROBOTS = CATALOG.flatMap(({ group, items }) => items.map((name) => ({
    name,
    group,
    status: LIVE_IDS[name] ? 'live' : 'planned',
    id: LIVE_IDS[name] || null
  })));

  const TIERS = [
    {
      id: 'operator-grade', level: 1, title: 'Operator-grade', tag: 'Tier 1',
      desc: 'Best. Vetted operators drive the robot directly, with a leader arm in their hands or by webcam in the browser. Every episode is replayed on the server and must pass every safety and quality gate.',
      line: 'Vetted operators drive the robot directly, and every episode must pass every safety and quality gate.'
    },
    {
      id: 'curated-video', level: 2, title: 'Curated video', tag: 'Tier 2',
      desc: 'Good. The agent finds licensed videos of people doing the task, keeps only footage one camera can be trusted on, and retargets it to your robot. Each clip keeps its source and licence.',
      line: 'Licensed videos of people doing the task, retargeted to your robot. Each clip keeps its source and licence.'
    },
    {
      id: 'open-web-video', level: 3, title: 'Open web video', tag: 'Tier 3',
      desc: 'Broad. A wide net over public video, pose only, loosest gates. Most volume, least precision. Footage is never stored.',
      line: 'A wide net over public video, pose only, with the loosest gates. Footage is never stored.'
    }
  ];

  const PLACEHOLDERS = [
    'do the Renegade TikTok dance',
    'fold a t-shirt in half on a table',
    'wave hello with its right hand, twice',
    'stack three red cups'
  ];

  const STORE_KEY = 'playertwo.blanks.v1';
  const TASK_MAX = 240;
  const ROBOT_MAX = 60;

  /* --------------------------------------------------------------- helpers */

  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = window.matchMedia('(max-width: 640px)');

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value);
      }
    }
    for (const child of children) if (child != null) node.append(child);
    return node;
  }

  function clean(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\x00-\x1f\x7f\xa0]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const root = document.documentElement;

  // ?film=1 turns on the demo driver at the bottom of this file. It never changes layout.
  let FILM = false;
  try { FILM = new URLSearchParams(window.location.search).get('film') === '1'; } catch (_) { FILM = false; }

  // Every audible moment, for whoever cuts the film. Silent outside film mode.
  function sfx(type) {
    if (!FILM) return;
    window.dispatchEvent(new CustomEvent('film:sfx', { detail: { type, t: performance.now() } }));
  }

  // Change a blank's content and ease its width, so the words after it glide instead of jumping.
  let booted = false;
  function easeWidth(node, mutate) {
    if (!booted || reducedMotion.matches) { mutate(); return; }
    const from = node.getBoundingClientRect().width;
    node.classList.remove('is-resizing');
    node.style.width = '';
    mutate();
    const to = node.getBoundingClientRect().width;
    if (Math.abs(to - from) < 0.5) return;
    node.style.width = `${from}px`;
    node.getBoundingClientRect();
    node.classList.add('is-resizing');
    node.style.width = `${to}px`;
    window.clearTimeout(node.widthTimer);
    node.widthTimer = window.setTimeout(() => {
      node.classList.remove('is-resizing');
      node.style.width = '';
    }, 320);
  }

  /* --------------------------------------------------------------- article */

  // "a" or "an" by sound, not spelling: "an SO-101", "a UR5e", "an xArm 6", "a Unitree G1".
  function articleFor(name) {
    const token = (String(name || '').trim().split(/\s+/)[0] || '').replace(/^[^A-Za-z0-9]+/, '');
    if (!token) return 'a';

    if (/^\d/.test(token)) return /^(8|1[18](?!\d))/.test(token) ? 'an' : 'a';

    // Read as letters: short capital runs before a digit, hyphen or the end (SO-101, UR5e, G1),
    // and a single lowercase letter in front of a capital (xArm, iCub).
    const spelled = /^[A-Z]{1,3}(?=$|[\d-])/.test(token) || /^[a-z](?=[A-Z])/.test(token) || token.length === 1;
    if (spelled) return /^[AEFHILMNORSX]/i.test(token) ? 'an' : 'a';

    const word = token.toLowerCase();
    if (/^(hour|honest|honou?r|heir)/.test(word)) return 'an';
    if (/^(uni(?![nm])|us[aeu]|ut[ei]|ufa|ubi|eu|one|once)/.test(word)) return 'a';
    return /^[aeiou]/.test(word) ? 'an' : 'a';
  }

  /* ----------------------------------------------------------- specificity */

  const RX = {
    object: /\b(hands?|arms?|fingers?|thumbs?|wrists?|elbows?|shoulders?|legs?|foot|feet|knees?|hips?|head|torso|waist|body|palms?|fists?|grippers?|cups?|mugs?|bottles?|cans|glass(es)?|plates?|bowls?|spoons?|forks?|kni(fe|ves)|t-?shirts?|shirts?|towels?|cloths?|socks?|pants|jackets?|doors?|drawers?|handles?|knobs?|buttons?|switch(es)?|levers?|box(es)?|blocks?|cubes?|balls?|toys?|books?|pens?|pencils?|markers?|tables?|desks?|shel(f|ves)|bins?|baskets?|trays?|lids?|caps?|bags?|cables?|plugs?|screws?|bolts?|pegs?|keys?|phones?|remotes?|apples?|bananas?|oranges?|eggs?|sponges?|brush(es)?|cards?|coins?|chairs?|hammers?|screwdrivers?|wrench(es)?|dish(es)?|pots?|pans?|dumbbells?|barbells?|kettlebells?|weights?)\b/i,
    side: /\b(left|right|up|down|upwards?|downwards?|forwards?|backwards?|back|sideways|clockwise|counter-?clockwise|anti-?clockwise|towards?|away|above|below|behind|front|top|bottom|overhead|inwards?|outwards?|horizontal(ly)?|vertical(ly)?|diagonal(ly)?|lateral(ly)?|north|south|east|west)\b/i,
    count: /\b(\d+(\.\d+)?|once|twice|thrice|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|both|half|halves|double|triple|single|pair|couple|times?|seconds?|secs?|minutes?|mins?|each|every)\b/i,
    manner: /\b(slowly|slow|quickly|quick|fast|faster|gently|gentle|carefully|careful|smoothly|smooth|firmly|lightly|softly|steadily|steady|precisely|quietly|tightly|loosely|evenly|neatly|gradually|without|until|while|whilst|before|after|then|keeping|keep|avoid(ing)?|making sure|so that|only|at a time|one by one|(on|onto|into|inside|in|from|off|over|under|beside|between|across|along|through|against|next to|in front of|on top of)\s+(a|an|the|its|my|your|each|one)\b)/i,
    // "pick up" and friends are verbs, not directions.
    phrasal: /\b(pick|clean|tidy|set|put|warm|wake|power|shut|slow|speed|stand|sit|lie|lay)(s|ing)?\s+((it|them|this|that)\s+)?(up|down)\b/gi,
    limb: /\b(hand|arm|leg|foot|finger|thumb|wrist|elbow|shoulder|knee|gripper)s?\b/i
  };

  const CHECK_ORDER = ['length', 'object', 'side', 'count', 'manner'];

  function scoreTask(raw) {
    const text = clean(raw, TASK_MAX);
    const words = text ? text.split(' ').filter((w) => /[A-Za-z0-9]/.test(w)) : [];
    const directional = text.replace(RX.phrasal, '$1');
    const checks = {
      length: words.length >= 4,
      object: RX.object.test(text),
      side: RX.side.test(directional),
      count: RX.count.test(text),
      manner: RX.manner.test(text)
    };
    const score = CHECK_ORDER.filter((key) => checks[key]).length;

    let hint;
    if (!text) hint = 'Start with a verb and an object.';
    else if (!checks.length) hint = 'Add a few more words.';
    else if (!checks.object) hint = 'Name the object or body part.';
    else if (!checks.side) {
      const limb = text.match(RX.limb);
      hint = limb ? `Say which ${limb[1].toLowerCase()}.` : 'Say which side or direction.';
    } else if (!checks.count) hint = 'Say how many times.';
    else if (!checks.manner) hint = 'Say how fast or how carefully.';
    else hint = 'That is specific enough to search for.';

    return { score, checks, hint };
  }

  /* ----------------------------------------------------------------- state */

  const state = { robot: null, task: '', tier: 'curated-video', composed: false };

  const tierById = (id) => TIERS.find((t) => t.id === id) || TIERS[1];

  function resolveRobot(text) {
    const name = clean(text, ROBOT_MAX);
    if (!name) return null;
    const lower = name.toLowerCase();
    return ROBOTS.find((r) => r.name.toLowerCase() === lower || r.id === lower)
      || { name, group: null, status: 'custom', id: null };
  }

  function resolveTier(value) {
    const v = clean(value, 40).toLowerCase().replace(/[\s_]+/g, '-');
    if (!v) return null;
    const hit = TIERS.find((t) => t.id === v || String(t.level) === v || `tier-${t.level}` === v || `tier${t.level}` === v || t.id.startsWith(v));
    return hit ? hit.id : null;
  }

  function isValid() {
    return Boolean(state.robot) && clean(state.task, TASK_MAX).length >= 3;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        robot: state.robot ? state.robot.name : '',
        task: state.task,
        tier: state.tier
      }));
    } catch (_) { /* storage can be unavailable; the page works without it */ }
  }

  function restore() {
    let stored = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') stored = parsed;
    } catch (_) { stored = null; }

    let params = null;
    try { params = new URLSearchParams(window.location.search); } catch (_) { params = null; }
    const fromUrl = (key) => (params && params.has(key) ? params.get(key) : null);
    const pick = (key) => {
      const urlValue = fromUrl(key);
      if (urlValue != null) return urlValue;
      return stored && typeof stored[key] === 'string' ? stored[key] : '';
    };

    state.robot = resolveRobot(pick('robot'));
    state.task = clean(pick('task'), TASK_MAX);
    state.tier = resolveTier(pick('tier')) || 'curated-video';
  }

  /* ------------------------------------------------------------------- dom */

  const robotBlank = $('robot-blank');
  const robotInput = $('robot');
  const robotSizer = $('robot-sizer');
  const robotChev = $('robot-chev');
  const robotList = $('robot-list');
  const articleEl = $('article');
  const taskEl = $('task');
  const tierBtn = $('tier');
  const tierLabel = $('tier-label');
  const tierList = $('tier-list');
  const scrim = $('scrim');
  const composeBtn = $('compose');
  const briefWrap = $('brief-wrap');
  const announce = $('announce');

  /* ------------------------------------------------------ popup placement */

  // Centre the list under its blank, keep it inside the viewport, and flip it above
  // the blank when there is more room there. Returns the height it may use.
  function placePop(pop, anchor, wanted, needed) {
    const rect = anchor.getBoundingClientRect();
    const root = document.documentElement;
    const vw = root.clientWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const gutter = 16;
    const gap = 12;
    const width = Math.min(wanted, vw - gutter * 2);
    const left = clamp(rect.left + rect.width / 2 - width / 2, gutter, vw - gutter - width);
    const below = Math.max(vh - rect.bottom - gap - gutter, 0);
    const above = Math.max(rect.top - gap - gutter, 0);
    const flip = below < needed && above > below;
    pop.style.width = `${width}px`;
    pop.style.left = `${left + window.scrollX}px`;
    if (flip) {
      pop.style.top = 'auto';
      pop.style.bottom = `${root.clientHeight - (rect.top + window.scrollY) + gap}px`;
    } else {
      pop.style.bottom = 'auto';
      pop.style.top = `${rect.bottom + window.scrollY + gap}px`;
    }
    pop.dataset.side = flip ? 'above' : 'below';
    return flip ? above : below;
  }

  /* -------------------------------------------------------- robot combobox */

  const robot = { open: false, options: [], active: -1, typed: false, committed: null };

  function syncRobotSizer() {
    robotSizer.textContent = robotInput.value || robotInput.placeholder;
  }

  function highlight(name, query) {
    const frag = document.createDocumentFragment();
    const at = query ? name.toLowerCase().indexOf(query) : -1;
    if (at < 0) { frag.append(name); return frag; }
    frag.append(name.slice(0, at), el('mark', { text: name.slice(at, at + query.length) }), name.slice(at + query.length));
    return frag;
  }

  function statusTag(status) {
    return el('span', { class: `tag tag--${status}`, text: status });
  }

  function renderRobotList(query) {
    const q = clean(query, ROBOT_MAX).toLowerCase();
    const matches = ROBOTS.filter((r) => !q
      || r.name.toLowerCase().includes(q)
      || r.group.toLowerCase().includes(q)
      || r.status === q);

    robot.options = [];
    robotList.replaceChildren(el('div', { class: 'sheet-head', role: 'presentation' }, el('span', { text: 'Robots' })));

    for (const { group } of CATALOG) {
      const inGroup = matches.filter((r) => r.group === group);
      if (!inGroup.length) continue;
      const labelId = `robot-group-${robotList.childElementCount}`;
      const box = el('div', { class: 'pop-group', role: 'group', 'aria-labelledby': labelId },
        el('div', { class: 'pop-label', id: labelId, text: group }));
      for (const r of inGroup) {
        const index = robot.options.length;
        const name = el('span', { class: 'opt-name' });
        name.append(highlight(r.name, q));
        const option = el('div', {
          class: 'opt', role: 'option', id: `robot-opt-${index}`,
          'aria-selected': String(Boolean(state.robot && state.robot.name === r.name)),
          'data-index': String(index)
        }, name, statusTag(r.status));
        robot.options.push({ node: option, robot: r });
        box.append(option);
      }
      robotList.append(box);
    }

    if (!matches.length && q) {
      const typed = clean(query, ROBOT_MAX);
      const custom = { name: typed, group: null, status: 'custom', id: null };
      const option = el('div', {
        class: 'opt opt--custom', role: 'option', id: 'robot-opt-0', 'aria-selected': 'false', 'data-index': '0'
      }, el('span', { class: 'opt-name', text: `Use "${typed}"` }), statusTag('custom'));
      robot.options.push({ node: option, robot: custom });
      robotList.append(option);
    }

    if (!robot.options.length) robotList.append(el('div', { class: 'pop-empty', text: 'Type a robot name.' }));
  }

  function setRobotActive(index, scroll) {
    robot.active = index;
    robot.options.forEach(({ node }, i) => node.classList.toggle('is-active', i === index));
    const current = robot.options[index];
    if (current) {
      robotInput.setAttribute('aria-activedescendant', current.node.id);
      if (scroll) current.node.scrollIntoView({ block: 'nearest' });
    } else {
      robotInput.removeAttribute('aria-activedescendant');
    }
  }

  // On phones both menus are bottom sheets, laid out by CSS. They sit above the on-screen keyboard.
  function clearPopStyles(pop) {
    for (const prop of ['width', 'left', 'top', 'bottom', 'maxHeight']) pop.style[prop] = '';
    pop.dataset.side = 'sheet';
  }

  function syncSheetVars() {
    const vv = window.visualViewport;
    if (!vv) return;
    const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--keyboard', `${keyboard}px`);
    if (keyboard > 0) root.style.setProperty('--sheet-max', `${Math.round(vv.height * 0.5)}px`);
    else root.style.removeProperty('--sheet-max');
  }

  function positionRobotList() {
    if (smallScreen.matches) { clearPopStyles(robotList); syncSheetVars(); return; }
    const space = placePop(robotList, robotBlank, 360, 300);
    robotList.style.maxHeight = `${clamp(space, 200, 440)}px`;
  }

  function openRobot(query) {
    closeTier();
    renderRobotList(query);
    positionRobotList();
    if (!robot.open) sfx('open');
    robot.open = true;
    robotList.dataset.open = 'true';
    robotInput.setAttribute('aria-expanded', 'true');
    robotList.scrollTop = 0;
    const selectedIndex = robot.options.findIndex((o) => state.robot && o.robot.name === state.robot.name);
    if (clean(query, ROBOT_MAX)) setRobotActive(robot.options.length ? 0 : -1, false);
    else setRobotActive(selectedIndex, selectedIndex >= 0);
  }

  function closeRobot() {
    if (!robot.open) return;
    robot.open = false;
    sfx('close');
    robotList.dataset.open = 'false';
    robotInput.setAttribute('aria-expanded', 'false');
    robotInput.removeAttribute('aria-activedescendant');
    robot.active = -1;
  }

  function chooseRobot(choice, moveOn) {
    state.robot = choice;
    robot.typed = false;
    easeWidth(robotBlank, () => {
      robotInput.value = choice ? choice.name : '';
      syncRobotSizer();
    });
    closeRobot();
    update();
    if (document.activeElement === robotInput) robotInput.select();
    if (moveOn && !clean(state.task, TASK_MAX)) focusTask();
  }

  // Settle whatever is in the box when focus leaves without an explicit pick.
  function settleRobotText() {
    const typed = clean(robotInput.value, ROBOT_MAX);
    if (!typed) return chooseRobot(null, false);
    const lower = typed.toLowerCase();
    const exact = ROBOTS.find((r) => r.name.toLowerCase() === lower);
    if (exact) return chooseRobot(exact, false);
    const anyMatch = ROBOTS.some((r) => r.name.toLowerCase().includes(lower));
    if (!anyMatch) return chooseRobot({ name: typed, group: null, status: 'custom', id: null }, false);
    if (state.robot && state.robot.status === 'custom' && state.robot.name === typed) return chooseRobot(state.robot, false);
    return chooseRobot(robot.committed || null, false);
  }

  robotInput.addEventListener('input', () => {
    const typed = clean(robotInput.value, ROBOT_MAX);
    if (!robot.typed) { robot.committed = state.robot; robot.typed = true; }
    if (!state.robot || state.robot.name !== typed) state.robot = null;
    syncRobotSizer();
    openRobot(robotInput.value);
    update();
  });

  robotInput.addEventListener('pointerdown', () => {
    if (!robot.open) window.setTimeout(() => { if (document.activeElement === robotInput && !robot.open) openRobot(''); }, 0);
  });

  // Focusing or plainly clicking a settled robot selects the whole name, so typing replaces it.
  // The check waits a tick because Chrome collapses a clicked selection only after the click event.
  robotInput.addEventListener('focus', () => {
    robot.committed = state.robot;
    robot.typed = false;
    robotInput.select();
  });

  robotInput.addEventListener('click', () => {
    window.setTimeout(() => {
      const collapsed = robotInput.selectionStart === robotInput.selectionEnd;
      if (collapsed && !robot.typed && state.robot && document.activeElement === robotInput) robotInput.select();
    }, 0);
  });

  robotInput.addEventListener('blur', () => {
    if (robot.typed) settleRobotText();
    closeRobot();
  });

  robotInput.addEventListener('keydown', (event) => {
    const count = robot.options.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!robot.open) { openRobot(robot.typed ? robotInput.value : ''); if (robot.active >= 0) return; }
        if (!robot.options.length) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const n = robot.options.length;
        const next = robot.active < 0 ? (step > 0 ? 0 : n - 1) : (robot.active + step + n) % n;
        setRobotActive(next, true);
        return;
      }
      case 'Enter': {
        event.preventDefault();
        if (robot.open && robot.active >= 0 && count) chooseRobot(robot.options[robot.active].robot, true);
        else if (robot.typed) { settleRobotText(); if (state.robot) focusTask(); } else if (state.robot) focusTask();
        return;
      }
      case 'Tab': {
        if (robot.open && robot.typed && robot.active >= 0 && count) chooseRobot(robot.options[robot.active].robot, false);
        return;
      }
      case 'Escape': {
        if (robot.open) { event.preventDefault(); event.stopPropagation(); closeRobot(); }
        return;
      }
      default:
    }
  });

  robotList.addEventListener('mousedown', (event) => event.preventDefault());
  robotList.addEventListener('mousemove', (event) => {
    const option = event.target.closest('.opt');
    if (option) { const i = Number(option.dataset.index); if (i !== robot.active) setRobotActive(i, false); }
  });
  robotList.addEventListener('click', (event) => {
    const option = event.target.closest('.opt');
    if (!option) return;
    const entry = robot.options[Number(option.dataset.index)];
    if (entry) chooseRobot(entry.robot, true);
  });

  robotChev.addEventListener('mousedown', (event) => event.preventDefault());
  robotChev.addEventListener('click', () => {
    if (robot.open) { closeRobot(); return; }
    robotInput.focus();
    openRobot('');
  });

  /* ------------------------------------------------------------ task field */

  try { taskEl.contentEditable = 'plaintext-only'; } catch (_) { taskEl.contentEditable = 'true'; }
  if (taskEl.contentEditable !== 'plaintext-only') taskEl.contentEditable = 'true';

  function caretToEnd(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function focusTask() {
    taskEl.focus();
    caretToEnd(taskEl);
  }

  function readTask() {
    const raw = taskEl.textContent.replace(/[\x00-\x1f\x7f\xa0]/g, ' ');
    if (!raw.trim()) {
      if (taskEl.childNodes.length) taskEl.replaceChildren();
      return '';
    }
    if (raw.length > TASK_MAX) {
      taskEl.textContent = raw.slice(0, TASK_MAX);
      caretToEnd(taskEl);
      return taskEl.textContent;
    }
    return raw;
  }

  taskEl.addEventListener('input', () => {
    state.task = readTask();
    update();
  });

  taskEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      tierBtn.focus();
    }
  });

  taskEl.addEventListener('paste', (event) => {
    event.preventDefault();
    const pasted = clean((event.clipboardData || window.clipboardData).getData('text'), TASK_MAX);
    if (!pasted) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(pasted);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    taskEl.normalize();
    state.task = readTask();
    update();
  });

  taskEl.addEventListener('drop', (event) => event.preventDefault());

  taskEl.addEventListener('blur', () => {
    const tidy = clean(state.task, TASK_MAX);
    if (tidy !== taskEl.textContent) taskEl.textContent = tidy;
    state.task = tidy;
    update();
  });

  // Placeholder examples, cycling slowly while the field is empty and at rest.
  let placeholderIndex = 0;
  window.setInterval(() => {
    if (taskEl.textContent || document.activeElement === taskEl || document.hidden) return;
    placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length;
    const swap = () => {
      taskEl.dataset.placeholder = PLACEHOLDERS[placeholderIndex];
      taskEl.classList.remove('is-swapping');
    };
    if (reducedMotion.matches) { swap(); return; }
    taskEl.classList.add('is-swapping');
    window.setTimeout(swap, 420);
  }, 4200);

  /* ---------------------------------------------------------- tier listbox */

  const tier = { open: false, active: 1, nodes: [] };

  function buildTierList() {
    tierList.append(el('div', { class: 'sheet-head', role: 'presentation' }, el('span', { text: 'Data quality' })));
    TIERS.forEach((t, index) => {
      const option = el('div', { class: 'opt', role: 'option', id: `tier-opt-${t.id}`, 'aria-selected': 'false', 'data-index': String(index) },
        el('span', { class: 'opt-body' },
          el('span', { class: 'opt-title', text: t.title }),
          el('span', { class: 'opt-desc', text: t.desc })),
        el('span', { class: 'tag', text: t.tag }));
      tier.nodes.push(option);
      tierList.append(option);
    });
  }

  function setTierActive(index) {
    tier.active = index;
    tier.nodes.forEach((node, i) => node.classList.toggle('is-active', i === index));
    tierBtn.setAttribute('aria-activedescendant', tier.nodes[index].id);
    tier.nodes[index].scrollIntoView({ block: 'nearest' });
  }

  function positionTierList() {
    if (smallScreen.matches) { clearPopStyles(tierList); syncSheetVars(); return; }
    tierList.style.maxHeight = '';
    const space = placePop(tierList, tierBtn, 440, tierList.offsetHeight);
    tierList.style.maxHeight = `${Math.max(space, 240)}px`;
  }

  function openTier() {
    closeRobot();
    positionTierList();
    if (!tier.open) sfx('open');
    tier.open = true;
    tierList.dataset.open = 'true';
    scrim.dataset.open = 'true';
    tierBtn.setAttribute('aria-expanded', 'true');
    setTierActive(TIERS.findIndex((t) => t.id === state.tier));
  }

  function closeTier() {
    if (!tier.open) return;
    tier.open = false;
    sfx('close');
    tierList.dataset.open = 'false';
    scrim.dataset.open = 'false';
    tierBtn.setAttribute('aria-expanded', 'false');
    tierBtn.removeAttribute('aria-activedescendant');
  }

  function chooseTier(index) {
    state.tier = TIERS[index].id;
    closeTier();
    update();
  }

  tierBtn.addEventListener('click', () => { if (tier.open) closeTier(); else openTier(); });

  tierBtn.addEventListener('keydown', (event) => {
    const n = TIERS.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!tier.open) { openTier(); return; }
        setTierActive((tier.active + (event.key === 'ArrowDown' ? 1 : -1) + n) % n);
        return;
      case 'Home':
      case 'End':
        if (!tier.open) return;
        event.preventDefault();
        setTierActive(event.key === 'Home' ? 0 : n - 1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (tier.open) chooseTier(tier.active); else openTier();
        return;
      case 'Tab':
        if (tier.open) chooseTier(tier.active);
        return;
      case 'Escape':
        if (tier.open) { event.preventDefault(); event.stopPropagation(); closeTier(); }
        return;
      default:
    }
  });

  tierBtn.addEventListener('blur', () => closeTier());

  tierList.addEventListener('mousedown', (event) => event.preventDefault());
  tierList.addEventListener('mousemove', (event) => {
    const option = event.target.closest('.opt');
    if (option) { const i = Number(option.dataset.index); if (i !== tier.active) setTierActive(i); }
  });
  tierList.addEventListener('click', (event) => {
    const option = event.target.closest('.opt');
    if (option) { chooseTier(Number(option.dataset.index)); tierBtn.focus(); }
  });

  scrim.addEventListener('click', () => closeTier());

  /* ------------------------------------------------------- global closing */

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (robot.open && !robotBlank.contains(target) && !robotList.contains(target)) closeRobot();
    if (tier.open && !tierBtn.contains(target) && !tierList.contains(target)) closeTier();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || viewer.open) return;
    const hadMenu = robot.open || tier.open;
    closeRobot();
    closeTier();
    if (!hadMenu && run.playing) skipRun();
  });

  // The task's underline hangs off an inline box, the other two off boxes whose height is
  // computed in em. Browsers round those differently, so the rules can land a pixel apart.
  // Measure each box against the words beside it and trim it until its rule sits where the
  // task's does: one border below the text's own box.
  function textBottomBeside(box) {
    const frame = box.getBoundingClientRect();
    for (const node of [box.nextSibling, box.previousSibling]) {
      if (!node || node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const mid = (r.top + r.bottom) / 2;
        if (r.width > 0 && mid > frame.top && mid < frame.bottom) return r.bottom;
      }
    }
    return null;
  }

  function alignUnderlines() {
    const boxes = [robotBlank, tierBtn];
    boxes.forEach((box) => { box.style.lineHeight = ''; });
    // An inline blank's rule sits one border below the text's own box. Close in on that.
    for (const box of boxes) {
      for (let pass = 0; pass < 8; pass += 1) {
        const beside = textBottomBeside(box);
        if (beside == null) break;
        const off = box.getBoundingClientRect().bottom - (beside + 1);
        if (Math.abs(off) < 0.04 || Math.abs(off) > 4) break;
        box.style.lineHeight = `${parseFloat(window.getComputedStyle(box).lineHeight) - off}px`;
      }
    }
  }

  const reposition = () => {
    alignUnderlines();
    if (robot.open) positionRobotList();
    if (tier.open) positionTierList();
    if (viewer.open) sizeViewer();
  };
  window.addEventListener('resize', reposition);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', reposition);

  /* ----------------------------------------------------------------- brief */

  function shellQuote(text) {
    // Inside double quotes the shell still expands \ " $ and backticks, so escape all four.
    const escaped = text.replace(/[\\"$`]/g, '\\$&');
    return '"' + escaped + '"';
  }

  // The command as tokens, so the block can keep each flag on one line while the task wraps.
  function commandTokens() {
    const t = tierById(state.tier);
    if (!state.robot || state.robot.status !== 'live' || t.level === 1) return [];
    const tokens = [
      { text: 'pnpm dlx tsx', solid: true },
      { text: 'scripts/agent/agent.mts', solid: true },
      { text: shellQuote(clean(state.task, TASK_MAX)), solid: false },
      { text: `--robot ${state.robot.id}`, solid: true },
      { text: '--max-videos 8', solid: true },
      { text: '--seconds 6', solid: true }
    ];
    if (t.level === 3) tokens.push({ text: '--allow-standard-license', solid: true });
    return tokens;
  }

  function buildCommand() {
    return commandTokens().map((token) => token.text).join(' ');
  }

  function briefJson() {
    return JSON.stringify({
      robot: state.robot.name,
      robotStatus: state.robot.status,
      task: clean(state.task, TASK_MAX),
      specificity: scoreTask(state.task).score,
      tier: tierById(state.tier).title
    }, null, 2);
  }

  function shareUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('robot', state.robot.name);
    url.searchParams.set('task', clean(state.task, TASK_MAX));
    url.searchParams.set('tier', state.tier);
    if (FILM) url.searchParams.set('film', '1');
    return url.toString();
  }

  // The sentence again, with the three answers picked out.
  function sentenceInto(node, robotName, task, tierTitle) {
    node.replaceChildren(
      `I want to train ${articleFor(robotName)} `, el('em', { text: robotName }),
      ' to ', el('em', { text: task }),
      ' with ', el('em', { text: tierTitle.toLowerCase() }), ' data.'
    );
  }

  function renderBrief() {
    const t = tierById(state.tier);
    const spec = scoreTask(state.task);
    const live = state.robot.status === 'live';

    sentenceInto($('brief-sentence'), state.robot.name, clean(state.task, TASK_MAX), t.title);

    $('brief-robot').textContent = state.robot.name;
    const status = $('brief-status');
    status.textContent = state.robot.status;
    status.className = `tag tag--${state.robot.status}`;
    $('brief-robot-line').textContent = live ? 'Runs today.' : 'Not wired up yet. The brief is saved for when it is.';

    $('brief-tier').textContent = t.title;
    $('brief-tier-tag').textContent = t.tag;
    $('brief-tier-line').textContent = t.line;

    $('brief-spec').textContent = `${spec.score} of 5`;
    $('brief-spec-line').textContent = spec.hint;

    const command = buildCommand();
    $('brief-run-row').hidden = !live;
    $('cmd-block').hidden = !command;
    const code = $('cmd');
    code.replaceChildren();
    commandTokens().forEach((token, index) => {
      if (index) code.append(' ');
      code.append(token.solid ? el('span', { class: 'tok', text: token.text }) : token.text);
    });
    $('brief-operator-line').hidden = !(live && t.level === 1);
  }

  const output = $('output');
  const runWrap = $('run-wrap');
  let settleTimer = 0;

  function showBrief(show) {
    briefWrap.inert = !show;
    briefWrap.classList.toggle('is-open', show);
  }

  function revealOutput(target, block) {
    output.classList.add('is-open');
    try { window.history.replaceState(null, '', shareUrl()); } catch (_) { /* file:// and friends */ }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block });
    }, reducedMotion.matches ? 0 : 420);
  }

  function openBrief() {
    state.composed = true;
    stopRun();
    runWrap.hidden = true;
    output.querySelector('.output-panel').classList.remove('is-run');
    renderBrief();
    showBrief(true);
    revealOutput($('brief'), 'nearest');
    announce.textContent = 'Run brief composed below.';
  }

  function closeOutput() {
    state.composed = false;
    stopRun();
    window.clearTimeout(settleTimer);
    output.classList.remove('is-open');
    runWrap.hidden = true;
    showBrief(false);
  }

  $('composer').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isValid()) return;
    finishFill();
    const demo = findDemo();
    if (demo) openRun(demo); else openBrief();
  });

  function legacyCopy(text) {
    const area = el('textarea', { readonly: '', 'aria-hidden': 'true' });
    area.value = text;
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove();
    return ok;
  }

  async function copyText(text, button) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (_) {
      ok = legacyCopy(text);
    }
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.textContent = ok ? 'Copied' : 'Copy failed';
    button.classList.toggle('is-done', ok);
    announce.textContent = ok ? 'Copied to clipboard.' : 'Copy failed.';
    window.clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(window.setTimeout(() => {
      button.textContent = button.dataset.label;
      button.classList.remove('is-done');
    }, 1600));
  }

  $('copy-cmd').addEventListener('click', (event) => copyText(buildCommand(), event.currentTarget));
  $('copy-json').addEventListener('click', (event) => copyText(briefJson(), event.currentTarget));
  $('copy-link').addEventListener('click', (event) => copyText(shareUrl(), event.currentTarget));

  /* -------------------------------------------------------- recorded demos */

  // media/demo/manifest.json always wins. This stand-in only keeps the page whole without it:
  // it has no footage and no numbers, and the results view says so.
  const FALLBACK = {
    placeholder: true,
    demos: [
      {
        id: 'sample-g1', robot: 'Unitree G1', robotId: 'g1', task: 'wave hello with its right hand, twice', tier: 'curated',
        match: ['wave hello'],
        summary: { found: 0, judged: 0, accepted: 0, rejected: 0, episodes: 0, seconds: 0 },
        steps: ['Plan', 'Search', 'Fetch and track', 'Judge footage', 'Retarget', 'Write dataset'].map((name) => ({ name, detail: 'No recorded run is loaded, so this step has nothing to report.' })),
        rejections: [],
        clips: [1, 2, 3].map((n) => ({ file: '', poster: '', title: `Sample clip ${n}`, seconds: 6, source: '', url: '', licence: '', author: '', stats: {} }))
      },
      {
        id: 'sample-so101', robot: 'SO-101', robotId: 'so101', task: 'follow a slow arm raise to the side', tier: 'curated',
        match: ['arm raise'],
        summary: { found: 0, judged: 0, accepted: 0, rejected: 0, episodes: 0, seconds: 0 },
        steps: ['Plan', 'Search', 'Fetch and track', 'Judge footage', 'Retarget', 'Write dataset'].map((name) => ({ name, detail: 'No recorded run is loaded, so this step has nothing to report.' })),
        rejections: [],
        clips: [1, 2, 3].map((n) => ({ file: '', poster: '', title: `Sample clip ${n}`, seconds: 6, source: '', url: '', licence: '', author: '', stats: {} }))
      }
    ]
  };

  // The manifest is data, not markup: every string is cleaned and set as text, media paths must
  // stay inside media/demo/, and links must be http or https.
  const safePath = (value) => {
    const path = String(value == null ? '' : value);
    return /^media\/demo\/[A-Za-z0-9._/-]+$/.test(path) && !path.includes('..') ? path : '';
  };

  const safeUrl = (value) => {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (_) { return ''; }
  };

  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const count = (value) => Math.max(0, Math.round(num(value) || 0));

  function tidyDemo(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const robotName = clean(raw.robot, ROBOT_MAX);
    const task = clean(raw.task, TASK_MAX);
    if (!robotName || !task) return null;
    const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
    const list = (value) => (Array.isArray(value) ? value : []);
    return {
      id: clean(raw.id, 80),
      robot: robotName,
      robotId: clean(raw.robotId, 40).toLowerCase(),
      task,
      tier: resolveTier(raw.tier) || 'curated-video',
      date: clean(raw.recordedAt || raw.date || raw.ranAt, 40),
      match: list(raw.match).map((entry) => clean(entry, 80).toLowerCase()).filter(Boolean),
      summary: {
        found: count(summary.found), judged: count(summary.judged), accepted: count(summary.accepted),
        rejected: count(summary.rejected), episodes: count(summary.episodes), seconds: count(summary.seconds)
      },
      steps: list(raw.steps).slice(0, 8).map((step) => ({
        name: clean(step && step.name, 40), detail: clean(step && step.detail, 400), ms: num(step && step.ms)
      })).filter((step) => step.name),
      rejections: list(raw.rejections).slice(0, 12).map((item) => ({
        title: clean(item && item.title, 120), reason: clean(item && item.reason, 240)
      })).filter((item) => item.title || item.reason),
      clips: list(raw.clips).slice(0, 48).map((clip) => {
        const stats = clip && clip.stats && typeof clip.stats === 'object' ? clip.stats : {};
        return {
          file: safePath(clip && clip.file), poster: safePath(clip && clip.poster),
          title: clean(clip && clip.title, 120) || 'Untitled clip', seconds: num(clip && clip.seconds),
          source: clean(clip && clip.source, 80), url: safeUrl(clip && clip.url),
          licence: clean(clip && clip.licence, 80), author: clean(clip && clip.author, 80),
          quality: num(clip && clip.quality),
          stats: {
            tracked: num(stats.tracked), lagBefore: num(stats.lagBefore), lagAfter: num(stats.lagAfter),
            speedCap: num(stats.speedCap), trackErrCm: num(stats.trackErrCm)
          }
        };
      })
    };
  }

  let manifest = { placeholder: true, demos: FALLBACK.demos.map(tidyDemo).filter(Boolean) };

  const manifestReady = (async () => {
    try {
      const response = await fetch('media/demo/manifest.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      const demos = (Array.isArray(data && data.demos) ? data.demos : []).map(tidyDemo).filter(Boolean);
      if (demos.length) manifest = { placeholder: false, demos };
    } catch (_) { /* no manifest: the stand-in stays */ }
    renderChips();
  })();

  // A run matches a demo when the robot is the same and the task has every word of one entry.
  function findDemo() {
    if (!state.robot) return null;
    const words = clean(state.task, TASK_MAX).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const has = (word) => words.some((w) => w === word || (word.length > 3 && w.startsWith(word)));
    const robotName = state.robot.name.toLowerCase();
    return manifest.demos.find((demo) => (demo.robot.toLowerCase() === robotName || (state.robot.id && state.robot.id === demo.robotId))
      && demo.match.some((entry) => { const need = entry.split(/[^a-z0-9]+/).filter(Boolean); return need.length > 0 && need.every(has); })) || null;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function formatSpan(seconds) {
    if (seconds < 90) return `${seconds} s`;
    const rest = seconds % 60;
    return rest ? `${Math.floor(seconds / 60)} min ${rest} s` : `${Math.floor(seconds / 60)} min`;
  }

  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

  /* ----------------------------------------------------------------- chips */

  const chipsEl = $('chips');
  const fill = { token: 0, active: false, skip: false, finish: null };

  function renderChips() {
    chipsEl.replaceChildren(...manifest.demos.slice(0, 3).map((demo, index) => {
      const chip = el('button', { type: 'button', class: 'chip', 'data-demo': String(index), text: `Try: ${articleFor(demo.robot)} ${demo.robot} to ${demo.task}` });
      chip.addEventListener('click', () => fillFromDemo(demo));
      return chip;
    }));
  }

  // Finish a chip's typing at once: the user has started doing something else.
  function finishFill() {
    if (fill.active) fill.skip = true;
    if (fill.finish) fill.finish();
  }

  async function fillFromDemo(demo) {
    finishFill();
    const token = ++fill.token;
    const target = resolveRobot(demo.robot);
    const task = clean(demo.task, TASK_MAX);
    const instant = () => fill.skip || reducedMotion.matches || token !== fill.token;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      fill.finish = null;
      fill.active = false;
      if (token !== fill.token) return;
      chooseRobot(target, false);
      taskEl.textContent = task;
      state.task = task;
      state.tier = demo.tier;
      update();
    };

    closeRobot();
    closeTier();
    fill.active = true;
    fill.skip = false;
    fill.finish = settle;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

    // Robot and task are typed out; the tier simply changes, the way a picked option does.
    state.robot = null;
    robot.typed = false;
    for (let i = 0; i <= target.name.length && !instant(); i += 1) {
      robotInput.value = target.name.slice(0, i);
      syncRobotSizer();
      update();
      await wait(i ? 26 : 120);
    }
    if (token !== fill.token) return;
    if (!instant()) chooseRobot(target, false);
    for (let i = 0; i <= task.length && !instant(); i += 1) {
      taskEl.textContent = task.slice(0, i);
      state.task = taskEl.textContent;
      update();
      await wait(i ? 22 : 140);
    }
    if (token !== fill.token) return;
    const interrupted = fill.skip;
    if (!instant()) await wait(160);
    if (token !== fill.token) return;
    settle();
    if (interrupted || fill.skip) return;
    if (!FILM) composeBtn.focus({ preventScroll: true });
    announce.textContent = `Filled in: ${demo.robot}, ${task}.`;
  }

  for (const node of [robotInput, taskEl, tierBtn]) {
    node.addEventListener('pointerdown', finishFill);
    node.addEventListener('keydown', finishFill);
  }

  /* ------------------------------------------------------------------- run */

  const STEP_MS = [900, 1100, 1300, 1300, 1100, 900];
  const stepsEl = $('steps');
  const stepStatus = $('step-status');
  const resultsEl = $('results');
  const gridEl = $('grid');
  const run = { demo: null, index: -1, playing: false, timer: 0, nodes: [], waiters: [], statusTimer: 0, settleTimer: 0 };

  const MARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="ring" cx="10" cy="10" r="9"/><path class="tick" d="m6 10.4 2.7 2.7L14.2 7.4"/></svg>';

  function setStatus(name, detail, swap, took) {
    const apply = () => {
      $('step-status-name').textContent = name;
      $('step-status-detail').textContent = detail;
      $('step-took').textContent = took || '';
      stepStatus.classList.remove('is-swapping');
    };
    window.clearTimeout(run.statusTimer);
    if (!swap || reducedMotion.matches) { apply(); return; }
    stepStatus.classList.add('is-swapping');
    run.statusTimer = window.setTimeout(apply, 140);
  }

  // How long the step really took, from the agent's trace.
  const stepTook = (step) => (step.ms != null && step.ms >= 50 ? `${(step.ms / 1000).toFixed(1)} s` : '');

  function countTo(node, to) {
    if (reducedMotion.matches || to === 0) { node.textContent = String(to); return; }
    const started = performance.now();
    const frame = (now) => {
      const p = clamp((now - started) / 600, 0, 1);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1 && run.demo) window.requestAnimationFrame(frame); else node.textContent = String(to);
    };
    window.requestAnimationFrame(frame);
  }

  function revealStat(key, animate) {
    const cell = document.querySelector(`#stats [data-key="${key}"]`);
    if (!cell || cell.classList.contains('is-known')) return;
    cell.classList.add('is-known');
    const value = run.demo.summary[key];
    cell.classList.toggle('is-zero', value === 0);
    if (animate) countTo(cell.querySelector('dd'), value); else cell.querySelector('dd').textContent = String(value);
  }

  // Which numbers become known once a step has finished.
  function statsAfter(index, total) {
    const keys = [];
    if (index === Math.min(1, total - 1)) keys.push('found');
    if (index === Math.min(3, total - 1)) keys.push('judged', 'accepted', 'rejected');
    if (index === total - 1) keys.push('episodes');
    return keys;
  }

  function markStep(index, stateName) {
    const node = run.nodes[index];
    if (!node) return;
    node.classList.toggle('is-active', stateName === 'active');
    node.classList.toggle('is-done', stateName === 'done');
    if (stateName === 'active') node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
  }

  function advanceRun() {
    const { demo } = run;
    const total = demo.steps.length;
    if (run.index >= 0) {
      markStep(run.index, 'done');
      statsAfter(run.index, total).forEach((key) => revealStat(key, true));
      sfx('tick');
    }
    run.index += 1;
    if (run.index >= total) { finishRun(false); return; }
    markStep(run.index, 'active');
    setStatus(demo.steps[run.index].name, demo.steps[run.index].detail, run.index > 0, stepTook(demo.steps[run.index]));
    run.timer = window.setTimeout(advanceRun, STEP_MS[run.index] || 1000);
  }

  function finishRun(skipped) {
    const { demo } = run;
    if (!demo || !run.playing) return;
    window.clearTimeout(run.timer);
    run.playing = false;
    run.index = demo.steps.length;
    demo.steps.forEach((_, index) => markStep(index, 'done'));
    ['found', 'judged', 'accepted', 'rejected', 'episodes'].forEach((key) => revealStat(key, !skipped));
    runWrap.classList.add('is-done');
    const s = demo.summary;
    setStatus(manifest.placeholder ? 'Nothing to show.' : `Finished in ${formatSpan(s.seconds)}.`,
      manifest.placeholder ? 'Add media/demo/manifest.json to see a recorded run here.' : `${s.accepted} accepted, ${s.rejected} rejected, ${s.episodes} episodes written. Select a step to read what it did.`, true);
    resultsEl.inert = false;
    resultsEl.classList.add('is-open');
    window.clearTimeout(run.settleTimer);
    run.settleTimer = window.setTimeout(() => {
      resultsEl.classList.add('is-settled');
      gridEl.querySelectorAll('.tile').forEach((tile) => tile.classList.add('is-in'));
    }, reducedMotion.matches ? 0 : 480 + demo.clips.length * 50 + 200);
    sfx('success');
    announce.textContent = `Run finished. ${demo.clips.length} clips below.`;
    run.waiters.splice(0).forEach((resolve) => resolve());
  }

  function skipRun() { if (run.playing) finishRun(true); }

  function stopRun() {
    window.clearTimeout(run.timer);
    window.clearTimeout(run.settleTimer);
    window.clearTimeout(run.statusTimer);
    stopPeek();
    run.playing = false;
    run.demo = null;
    run.waiters.splice(0).forEach((resolve) => resolve());
  }

  const whenRunDone = () => new Promise((resolve) => { if (run.playing) run.waiters.push(resolve); else resolve(); });

  function openRun(demo) {
    stopRun();
    state.composed = true;
    run.demo = demo;
    run.index = -1;
    run.playing = true;

    showBrief(false);
    output.querySelector('.output-panel').classList.add('is-run');
    runWrap.hidden = false;
    runWrap.inert = false;
    runWrap.classList.remove('is-done', 'is-stale');
    resultsEl.classList.remove('is-open', 'is-settled');
    resultsEl.inert = true;

    const date = formatDate(demo.date);
    $('run-kicker-text').textContent = manifest.placeholder ? 'Sample layout. No recorded run is loaded.' : (date ? `Recorded run, ${date}` : 'Recorded run');
    sentenceInto($('run-title'), demo.robot, demo.task, tierById(demo.tier).title);

    stepsEl.style.gridTemplateColumns = `repeat(${demo.steps.length}, minmax(0, 1fr))`;
    run.nodes = demo.steps.map((step, index) => {
      const button = el('button', { type: 'button', class: 'step-btn' });
      const mark = el('span', { class: 'mark' });
      mark.innerHTML = MARK;
      button.append(mark, el('span', { class: 'step-name', text: step.name }));
      button.addEventListener('click', () => {
        if (run.playing) { skipRun(); return; }
        run.nodes.forEach((node, i) => node.classList.toggle('is-picked', i === index));
        setStatus(step.name, step.detail, true, stepTook(step));
      });
      return el('li', { class: 'step' }, button);
    });
    stepsEl.replaceChildren(...run.nodes);

    document.querySelectorAll('#stats .stat').forEach((cell) => {
      cell.classList.remove('is-known', 'is-zero');
      cell.querySelector('dd').textContent = '0';
    });

    buildGrid(demo);
    revealOutput(output.querySelector('.output-panel'), 'start');
    announce.textContent = 'Playing a recorded run.';
    advanceRun();
  }

  $('run-skip').addEventListener('click', skipRun);
  $('timeline').addEventListener('click', skipRun);

  $('see-brief').addEventListener('click', () => {
    if (!isValid()) return;
    renderBrief();
    showBrief(true);
    $('brief').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    $('brief').focus({ preventScroll: true });
  });

  /* --------------------------------------------------------------- library */

  const GLYPH = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13 10.5v11l9-5.5z" fill="currentColor"/></svg>';
  const peek = { tile: null, timer: 0, frame: 0 };
  let tiles = [];

  function buildGrid(demo) {
    stopPeek();
    tiles = demo.clips.map((clip, index) => {
      const tile = el('button', { type: 'button', class: 'tile', 'data-index': String(index), 'aria-label': `Open clip ${index + 1} of ${demo.clips.length}: ${clip.title}` });
      tile.style.setProperty('--i', String(Math.min(index, 9)));
      if (clip.poster) {
        const img = el('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false', src: clip.poster });
        img.addEventListener('error', () => tile.classList.add('no-poster'));
        tile.append(img);
      } else {
        tile.classList.add('no-poster');
      }
      if (clip.file) {
        const video = el('video', { preload: 'none', playsinline: '', loop: '', tabindex: '-1', 'aria-hidden': 'true', 'data-src': clip.file });
        video.muted = true;
        tile.append(video);
      }
      const glyph = el('span', { class: 'tile-glyph' });
      glyph.innerHTML = GLYPH;
      const meta = el('span', { class: 'tile-meta' },
        clip.licence ? el('span', { class: 'pill pill--lic', text: shortLicence(clip.licence) }) : el('span'),
        clip.seconds != null ? el('span', { class: 'pill pill--time', text: clock(clip.seconds) }) : null);
      tile.append(glyph, meta, el('span', { class: 'tile-scrub' }));

      // A peek starts when the pointer really moves onto a tile, not when the page scrolls one under it.
      tile.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse') return;
        if (!tile.classList.contains('is-hover')) { if (event.movementX || event.movementY) startPeek(tile); return; }
        scrubPeek(tile, event.clientX);
      });
      tile.addEventListener('pointerleave', () => endPeek(tile));
      tile.addEventListener('click', () => openViewer(index, tile));
      return tile;
    });
    gridEl.replaceChildren(...tiles);
    tiles.forEach((tile) => offscreen.observe(tile));

    const shown = demo.clips.length;
    const accepted = demo.summary.accepted;
    $('grid-note').hidden = !(accepted > shown && shown > 0);
    $('grid-note').textContent = `${shown} of the ${accepted} accepted clips are shown here.`;

    const rejects = demo.rejections;
    $('rejects').hidden = !rejects.length;
    $('rejects-title').textContent = `${rejects.length} rejected by the judge`;
    $('rejects-list').replaceChildren(...rejects.map((item) => el('li', { class: 'reject' },
      item.title ? el('b', { text: item.reason ? `${item.title}: ` : item.title }) : null, item.reason)));
  }

  // "Creative Commons Attribution (CC BY)" reads as "CC BY" on a tile; the viewer has the full name.
  function shortLicence(text) {
    const inner = text.match(/\(([^)]{2,16})\)/);
    return inner ? inner[1] : text;
  }

  // Apple's peek: rest on a tile for a moment and it plays, muted, in place.
  function startPeek(tile) {
    if (viewer.open) return;
    tile.classList.add('is-hover');
    window.clearTimeout(peek.timer);
    peek.timer = window.setTimeout(() => playPeek(tile), 150);
  }

  function playPeek(tile) {
    const video = tile.querySelector('video');
    if (!video || viewer.open || !tile.classList.contains('is-hover')) return;
    if (peek.tile && peek.tile !== tile) haltTile(peek.tile);
    peek.tile = tile;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    const started = video.play();
    const onPlaying = () => { if (peek.tile === tile) tile.classList.add('is-playing'); };
    if (started && started.then) started.then(onPlaying).catch(() => {}); else onPlaying();
    window.cancelAnimationFrame(peek.frame);
    const scrub = tile.querySelector('.tile-scrub');
    const follow = () => {
      if (peek.tile !== tile) return;
      if (video.duration) scrub.style.setProperty('--x', `${(video.currentTime / video.duration) * tile.clientWidth}px`);
      peek.frame = window.requestAnimationFrame(follow);
    };
    peek.frame = window.requestAnimationFrame(follow);
  }

  // The scrubber is the playhead. Moving the pointer moves it; resting lets it run on.
  function scrubPeek(tile, clientX) {
    if (peek.tile !== tile || tile.scrubPending) return;
    tile.scrubPending = true;
    window.requestAnimationFrame(() => {
      tile.scrubPending = false;
      const video = tile.querySelector('video');
      if (peek.tile !== tile || !video || !video.duration || video.seeking) return;
      const box = tile.getBoundingClientRect();
      const ratio = clamp((clientX - box.left) / box.width, 0, 0.999);
      if (Math.abs(ratio * video.duration - video.currentTime) > 0.12) video.currentTime = ratio * video.duration;
    });
  }

  function haltTile(tile) {
    const video = tile.querySelector('video');
    tile.classList.remove('is-playing');
    if (video && !video.paused) video.pause();
  }

  function endPeek(tile) {
    tile.classList.remove('is-hover');
    if (peek.tile === tile || !peek.tile) window.clearTimeout(peek.timer);
    if (peek.tile !== tile) return;
    window.cancelAnimationFrame(peek.frame);
    haltTile(tile);
    peek.tile = null;
  }

  function stopPeek() {
    window.clearTimeout(peek.timer);
    if (peek.tile) endPeek(peek.tile);
  }

  // Nothing plays off screen.
  const offscreen = new IntersectionObserver((entries) => {
    for (const entry of entries) if (!entry.isIntersecting && peek.tile === entry.target) endPeek(entry.target);
  });

  /* ---------------------------------------------------------------- viewer */

  const ql = $('ql');
  const qlFrame = $('ql-frame');
  const qlStage = $('ql-stage');
  const qlMedia = $('ql-media');
  const qlPoster = $('ql-poster');
  const qlVideo = $('ql-video');
  const viewer = { open: false, index: 0, ratio: 16 / 9, returnFocus: null, flight: null, closeFlight: null, frame: 0, closing: false };
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

  function fitViewer() {
    const style = window.getComputedStyle(qlStage);
    const width = qlStage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = qlStage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (width <= 0 || (height <= 0 && !smallScreen.matches)) return;
    // On a phone the stage takes its height from the clip, up to a little over half the screen.
    const room = smallScreen.matches ? window.innerHeight * 0.56 : height;
    let w = width;
    let h = width / viewer.ratio;
    if (h > room) { h = room; w = room * viewer.ratio; }
    qlMedia.style.aspectRatio = 'auto';
    qlMedia.style.width = `${Math.round(w)}px`;
    qlMedia.style.height = `${Math.round(h)}px`;
  }

  // On a desk the window hugs the clip, the way Quick Look does. On a phone it fills the screen.
  function sizeViewer() {
    qlFrame.style.height = '';
    if (!smallScreen.matches) {
      const style = window.getComputedStyle(qlStage);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const room = ql.clientHeight - 48;
      const ideal = (qlStage.clientWidth - padX) / viewer.ratio + padY;
      qlFrame.style.height = '0px';
      const needed = Math.max(ideal, $('ql-info').scrollHeight);
      qlFrame.style.height = `${Math.round(clamp(needed, Math.min(480, room), room))}px`;
    }
    fitViewer();
  }

  function statCell(value, unit, label, wide) {
    const dd = el('dd');
    dd.append(...value, unit ? el('small', { text: ` ${unit}` }) : '');
    return el('div', { class: wide ? 'ql-stat ql-stat--wide' : 'ql-stat' }, dd, el('dt', { text: label }));
  }

  function showClip(index) {
    const { clips } = run.demo;
    const clip = clips[index];
    viewer.index = index;

    $('ql-count').textContent = `${index + 1} of ${clips.length}`;
    $('ql-title').textContent = clip.title;
    const source = $('ql-source');
    source.textContent = clip.source || clip.url || 'Not recorded';
    if (clip.url) source.setAttribute('href', clip.url); else source.removeAttribute('href');
    $('ql-licence').textContent = clip.licence || 'Not recorded';
    $('ql-author').textContent = clip.author || 'Not recorded';

    const s = clip.stats;
    const cells = [];
    if (s.tracked != null) cells.push(statCell([String(s.tracked)], '%', 'Frames tracked'));
    if (s.speedCap != null) cells.push(statCell([String(s.speedCap)], '%', 'Time at the speed cap'));
    if (s.lagBefore != null && s.lagAfter != null) {
      cells.push(statCell([String(s.lagBefore), el('small', { text: ' ms' }), el('span', { class: 'arrow', text: '\u2192' }), String(s.lagAfter)], 'ms', 'Arm lag, before and after alignment', true));
    }
    if (s.trackErrCm != null) cells.push(statCell([String(s.trackErrCm)], 'cm', 'Tracking error'));
    if (clip.quality != null) cells.push(statCell([clip.quality.toFixed(2)], '', 'Judge score'));
    $('ql-stats').replaceChildren(...cells);
    document.querySelector('.ql-sub').hidden = !cells.length;

    const tileImg = tiles[index] && tiles[index].querySelector('img');
    viewer.ratio = tileImg && tileImg.naturalWidth ? tileImg.naturalWidth / tileImg.naturalHeight : 16 / 9;
    sizeViewer();

    qlMedia.classList.remove('is-playing');
    qlPoster.hidden = !clip.poster;
    if (clip.poster) qlPoster.setAttribute('src', clip.poster); else qlPoster.removeAttribute('src');
    $('ql-missing').hidden = Boolean(clip.file || clip.poster);
    qlVideo.pause();
    if (clip.file) {
      qlVideo.src = clip.file;
      qlVideo.muted = true;
      const started = qlVideo.play();
      if (started && started.catch) started.catch(() => {});
    } else {
      qlVideo.removeAttribute('src');
      qlVideo.load();
    }

    const many = clips.length > 1;
    $('ql-prev').disabled = !many;
    $('ql-next').disabled = !many;
  }

  qlVideo.addEventListener('playing', () => { if (viewer.open && !viewer.closing) qlMedia.classList.add('is-playing'); });
  qlVideo.addEventListener('loadedmetadata', () => {
    if (!viewer.open || !qlVideo.videoWidth) return;
    const ratio = qlVideo.videoWidth / qlVideo.videoHeight;
    if (Math.abs(ratio - viewer.ratio) > 0.02) { viewer.ratio = ratio; sizeViewer(); }
  });

  function followProgress() {
    if (!viewer.open) return;
    if (qlVideo.duration) $('ql-progress-bar').style.setProperty('--p', String(qlVideo.currentTime / qlVideo.duration));
    viewer.frame = window.requestAnimationFrame(followProgress);
  }

  // Where the media would be if it were still the tile: same centre, cropped to the tile's shape.
  function tileFrame(tile) {
    const t = tile.getBoundingClientRect();
    const m = qlMedia.getBoundingClientRect();
    if (!t.width || !m.width) return null;
    const scale = Math.max(t.width / m.width, t.height / m.height);
    const dx = t.left + t.width / 2 - (m.left + m.width / 2);
    const dy = t.top + t.height / 2 - (m.top + m.height / 2);
    const insetX = Math.max((m.width - t.width / scale) / 2, 0);
    const insetY = Math.max((m.height - t.height / scale) / 2, 0);
    const radius = parseFloat(window.getComputedStyle(tile).borderTopLeftRadius) / scale;
    return { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(${insetY}px ${insetX}px round ${radius}px)` };
  }

  const REST = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px round 12px)' };

  function openViewer(index, tile) {
    if (viewer.open || !run.demo || !run.demo.clips[index]) return;
    stopPeek();
    viewer.open = true;
    viewer.closing = false;
    viewer.returnFocus = tile || document.activeElement;
    $('page').inert = true;
    $('foot').inert = true;
    document.body.classList.add('is-locked');
    ql.dataset.open = 'true';
    showClip(index);
    sfx('open');

    if (viewer.flight) viewer.flight.cancel();
    if (viewer.closeFlight) { viewer.closeFlight.cancel(); viewer.closeFlight = null; }
    const from = tile && !reducedMotion.matches ? tileFrame(tile) : null;
    if (from) {
      tile.classList.add('is-origin');
      viewer.flight = qlMedia.animate([from, REST], { duration: 440, easing: EASE_OUT });
    } else if (!reducedMotion.matches) {
      viewer.flight = qlMedia.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, easing: EASE_OUT });
    }
    // Focus moves into the viewer. If styles have not settled yet, try again in a moment.
    const closeBtn = $('ql-close');
    closeBtn.focus({ preventScroll: true });
    if (document.activeElement !== closeBtn) window.setTimeout(() => { if (viewer.open && !ql.contains(document.activeElement)) closeBtn.focus({ preventScroll: true }); }, 60);
    window.cancelAnimationFrame(viewer.frame);
    viewer.frame = window.requestAnimationFrame(followProgress);
    announce.textContent = `Viewing clip ${index + 1} of ${run.demo.clips.length}.`;
  }

  function closeViewer(how) {
    if (!viewer.open || viewer.closing) return;
    viewer.closing = true;
    sfx('close');
    const tile = tiles[viewer.index];
    const done = () => {
      if (!viewer.closing) return;
      if (viewer.closeFlight) { viewer.closeFlight.onfinish = null; viewer.closeFlight.oncancel = null; }
      viewer.open = false;
      viewer.closing = false;
      window.cancelAnimationFrame(viewer.frame);
      tiles.forEach((node) => node.classList.remove('is-origin'));
      qlVideo.pause();
      qlVideo.removeAttribute('src');
      qlVideo.load();
      qlFrame.style.transform = '';
      ql.style.removeProperty('--dim');
      ql.classList.remove('is-dragging');
      $('page').inert = false;
      $('foot').inert = false;
      document.body.classList.remove('is-locked');
      const back = tile || viewer.returnFocus;
      if (back && back.focus) back.focus({ preventScroll: true });
    };

    qlVideo.pause();
    qlMedia.classList.remove('is-playing');
    ql.dataset.open = 'false';
    if (viewer.flight) viewer.flight.cancel();
    if (reducedMotion.matches) { done(); return; }

    if (how === 'down') {
      viewer.closeFlight = qlFrame.animate([{ transform: qlFrame.style.transform || 'none', opacity: 1 }, { transform: 'translateY(60vh) scale(0.9)', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    } else {
      if (tile) {
        tiles.forEach((node) => node.classList.toggle('is-origin', node === tile));
        tile.scrollIntoView({ block: 'nearest' });
      }
      const to = tile ? tileFrame(tile) : null;
      viewer.closeFlight = to
        ? qlMedia.animate([REST, to], { duration: 320, easing: 'cubic-bezier(0.3, 0.1, 0.2, 1)', fill: 'forwards' })
        : qlMedia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease', fill: 'forwards' });
    }
    viewer.closeFlight.onfinish = done;
    viewer.closeFlight.oncancel = done;
  }

  // Moving between clips is a quick cross-fade, with a short slide when it follows a swipe.
  async function stepViewer(direction, slide) {
    const { clips } = run.demo;
    if (!viewer.open || viewer.closing || clips.length < 2) return;
    const next = (viewer.index + direction + clips.length) % clips.length;
    tiles.forEach((node) => node.classList.remove('is-origin'));
    if (reducedMotion.matches) { showClip(next); return; }
    const shift = slide ? 48 * direction : 12 * direction;
    if (viewer.flight) viewer.flight.cancel();
    viewer.flight = qlMedia.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-shift}px)` }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
    try { await viewer.flight.finished; } catch (_) { return; }
    if (!viewer.open) return;
    showClip(next);
    viewer.flight.cancel();
    viewer.flight = qlMedia.animate([{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 240, easing: EASE_OUT });
    announce.textContent = `Clip ${next + 1} of ${clips.length}.`;
  }

  $('ql-prev').addEventListener('click', () => stepViewer(-1, false));
  $('ql-next').addEventListener('click', () => stepViewer(1, false));
  $('ql-close').addEventListener('click', () => closeViewer());
  $('ql-backdrop').addEventListener('click', () => closeViewer());
  qlStage.addEventListener('click', (event) => { if (event.target === qlStage) closeViewer(); });

  function togglePlayback() {
    if (!qlVideo.getAttribute('src')) return;
    if (qlVideo.paused) { const started = qlVideo.play(); if (started && started.catch) started.catch(() => {}); } else qlVideo.pause();
  }

  // Keys belong to the viewer while it is open, wherever focus happens to be.
  document.addEventListener('keydown', (event) => {
    if (!viewer.open) return;
    const onControl = event.target.closest ? event.target.closest('button, a') : null;
    switch (event.key) {
      case 'Escape': event.preventDefault(); closeViewer(); return;
      case 'ArrowLeft': event.preventDefault(); stepViewer(-1, false); return;
      case 'ArrowRight': event.preventDefault(); stepViewer(1, false); return;
      case ' ':
        if (!onControl || onControl === $('ql-close')) { event.preventDefault(); togglePlayback(); }
        return;
      case 'Tab': {
        const stops = [...ql.querySelectorAll('button:not(:disabled), a[href]')].filter((node) => node.offsetParent !== null);
        if (!stops.length) return;
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      default:
    }
  });

  // Touch: swipe sideways to move, pull down to close. The frame follows the finger.
  const drag = { id: null, x: 0, y: 0, t: 0, axis: null, dx: 0, dy: 0 };

  qlStage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !viewer.open || viewer.closing || event.target.closest('button')) return;
    Object.assign(drag, { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), axis: null, dx: 0, dy: 0 });
  });

  qlStage.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag.id) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    if (!drag.axis) {
      if (Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) < 8) return;
      drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? 'x' : 'y';
      try { qlStage.setPointerCapture(event.pointerId); } catch (_) { /* pointer already gone */ }
      ql.classList.add('is-dragging');
      qlMedia.style.transition = 'none';
      qlFrame.style.transition = 'none';
    }
    if (drag.axis === 'x') {
      qlMedia.style.transform = `translateX(${drag.dx}px)`;
    } else {
      const pull = Math.max(drag.dy, 0);
      qlFrame.style.transform = `translateY(${pull}px) scale(${1 - Math.min(pull / 2400, 0.08)})`;
      ql.style.setProperty('--dim', String(clamp(1 - pull / 420, 0.25, 1)));
    }
  });

  function endDrag(event) {
    if (event.pointerId !== drag.id) return;
    drag.id = null;
    if (!drag.axis) return;
    const speed = Math.hypot(drag.dx, drag.dy) / Math.max(performance.now() - drag.t, 1);
    ql.classList.remove('is-dragging');
    const settle = (node) => {
      node.style.transition = `transform 280ms ${EASE_OUT}`;
      node.style.transform = '';
      window.setTimeout(() => { node.style.transition = ''; }, 300);
    };
    if (drag.axis === 'x') {
      const go = Math.abs(drag.dx) > 56 || (speed > 0.5 && Math.abs(drag.dx) > 24);
      qlMedia.style.transition = '';
      qlMedia.style.transform = '';
      if (go) stepViewer(drag.dx < 0 ? 1 : -1, true); else settle(qlMedia);
    } else if (drag.dy > 110 || (speed > 0.6 && drag.dy > 40)) {
      qlFrame.style.transition = '';
      closeViewer('down');
    } else {
      settle(qlFrame);
      ql.style.removeProperty('--dim');
    }
    // The click that follows a drag is not a tap.
    window.setTimeout(() => { drag.axis = null; }, 0);
  }

  qlStage.addEventListener('pointerup', endDrag);
  qlStage.addEventListener('pointercancel', endDrag);
  qlMedia.addEventListener('click', () => { if (!drag.axis) togglePlayback(); });

  /* ---------------------------------------------------------------- update */

  const segs = Array.from(document.querySelectorAll('#meter .seg'));
  const meter = $('meter');

  function update() {
    const robotText = state.robot ? state.robot.name : robotInput.value;
    const article = articleFor(robotText);
    if (articleEl.textContent !== article) easeWidth(articleEl, () => { articleEl.textContent = article; });
    const label = tierById(state.tier).title.toLowerCase();
    if (tierLabel.textContent !== label) easeWidth(tierLabel, () => { tierLabel.textContent = label; });
    tier.nodes.forEach((node, i) => node.setAttribute('aria-selected', String(TIERS[i].id === state.tier)));

    const spec = scoreTask(state.task);
    segs.forEach((seg) => seg.classList.toggle('is-on', Boolean(spec.checks[seg.dataset.check])));
    meter.setAttribute('aria-valuenow', String(spec.score));
    meter.setAttribute('aria-valuetext', `${spec.score} of 5`);
    $('spec-score').textContent = `${spec.score}/5`;
    const hint = $('spec-hint');
    if (hint.textContent !== spec.hint) hint.textContent = spec.hint;

    const valid = isValid();
    composeBtn.disabled = !valid;
    // Open output follows the blanks. While they no longer describe it, it dims instead of jumping away.
    if (state.composed) {
      if (valid) renderBrief();
      briefWrap.classList.toggle('is-stale', !valid);
      $('brief').inert = !valid;
      if (run.demo) {
        const current = valid && findDemo() === run.demo;
        runWrap.classList.toggle('is-stale', !current);
        runWrap.inert = !current;
        if (!current) stopPeek();
      }
    }

    save();
  }

  /* ------------------------------------------------------------ film driver */

  // Open the site with ?film=1, then call filmDemo(0) or filmDemo(1) from the console or a script.
  // It drives the real page: same handlers, same states. Only the cursor is drawn.
  if (FILM) {
    root.classList.add('is-film');
    const cursor = el('div', { class: 'film-cursor', 'aria-hidden': 'true' });
    cursor.innerHTML = '<svg viewBox="0 0 28 28"><path d="M6 3v19.2l4.7-4.5 3.1 7.2 3.2-1.4-3.1-7.1 6.5-.2z" fill="#0b0d12" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);
    const at = { x: Math.round(window.innerWidth * 0.74), y: Math.round(window.innerHeight * 0.58) };
    const place = () => { cursor.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`; };
    place();

    // Same takes every time: the "random" rhythm comes from a seeded generator.
    const seeded = (seed) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const glide = (x, y, ms, onMove) => new Promise((resolve) => {
      const from = { ...at };
      const distance = Math.hypot(x - from.x, y - from.y);
      const duration = ms || clamp(260 + distance * 0.6, 320, 920);
      const bow = Math.min(distance * 0.06, 28);
      const nx = distance ? -(y - from.y) / distance : 0;
      const ny = distance ? (x - from.x) / distance : 0;
      const started = performance.now();
      const frame = (now) => {
        const p = clamp((now - started) / duration, 0, 1);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const arc = ms ? 0 : Math.sin(Math.PI * e) * bow;
        at.x = from.x + (x - from.x) * e + nx * arc;
        at.y = from.y + (y - from.y) * e + ny * arc;
        place();
        if (onMove) onMove(at.x, at.y);
        if (p < 1) window.requestAnimationFrame(frame); else resolve();
      };
      window.requestAnimationFrame(frame);
    });

    const pointOn = (node, fx = 0.5, fy = 0.5) => {
      const box = node.getBoundingClientRect();
      return [box.left + box.width * fx, box.top + box.height * fy];
    };

    const moveTo = (node, fx, fy) => glide(...pointOn(node, fx, fy));

    const press = async (node, act) => {
      cursor.classList.add('is-down');
      node.classList.add('is-pressed');
      sfx('click');
      await wait(120);
      cursor.classList.remove('is-down');
      node.classList.remove('is-pressed');
      act();
    };

    const intoView = async (node) => {
      const box = node.getBoundingClientRect();
      if (box.top >= 72 && box.bottom <= window.innerHeight - 72) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(760);
    };

    let busy = null;

    window.filmDemo = (which = 0) => {
      if (busy) return busy;
      busy = (async () => {
        await manifestReady;
        const demo = manifest.demos[which];
        if (!demo) throw new Error(`filmDemo: there is no demo ${which}. The manifest has ${manifest.demos.length}.`);
        const random = seeded(0x51f15e + which * 7919);
        const keyDelay = (ch) => 45 + random() * 50 + (ch === ' ' ? 40 + random() * 90 : 0) + (ch === ',' ? 140 : 0);

        // A clean page.
        if (viewer.open) closeViewer();
        finishFill();
        closeOutput();
        chooseRobot(null, false);
        taskEl.textContent = '';
        state.task = '';
        update();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await wait(900);

        // Robot: open the list, type a few letters, pick it from the list.
        await moveTo(robotBlank, 0.5, 0.55);
        await press(robotBlank, () => { robotInput.focus(); openRobot(''); });
        await wait(520);
        const name = demo.robot;
        let typed = '';
        for (const ch of name.toLowerCase()) {
          typed += ch;
          robotInput.value = typed;
          robotInput.dispatchEvent(new Event('input', { bubbles: true }));
          sfx('key');
          await wait(keyDelay(ch));
          const place = robot.options.findIndex((o) => o.robot.name === name);
          if (typed.length >= 3 && place >= 0 && place <= 2) break;
        }
        await wait(420);
        const pick = robot.options.findIndex((o) => o.robot.name === name);
        if (pick >= 0) {
          await moveTo(robot.options[pick].node, 0.32, 0.5);
          setRobotActive(pick, false);
          await wait(260);
          await press(robot.options[pick].node, () => robot.options[pick].node.click());
        } else {
          chooseRobot(resolveRobot(name), true);
        }
        await wait(520);

        // Task: typed like a person types.
        focusTask();
        for (const ch of demo.task) {
          taskEl.textContent += ch;
          caretToEnd(taskEl);
          taskEl.dispatchEvent(new Event('input', { bubbles: true }));
          sfx('key');
          await wait(keyDelay(ch));
        }
        await wait(560);

        // Data quality: open the menu and choose.
        await moveTo(tierBtn, 0.5, 0.55);
        await press(tierBtn, () => { tierBtn.focus(); tierBtn.click(); });
        await wait(620);
        const tierIndex = Math.max(TIERS.findIndex((t) => t.id === demo.tier), 0);
        await moveTo(tier.nodes[tierIndex], 0.3, 0.4);
        setTierActive(tierIndex);
        await wait(320);
        await press(tier.nodes[tierIndex], () => tier.nodes[tierIndex].click());
        await wait(640);

        // Compose, then let the timeline play.
        await moveTo(composeBtn);
        await wait(180);
        await press(composeBtn, () => { composeBtn.blur(); composeBtn.click(); });
        await whenRunDone();
        await wait(1500);

        // Rest on two tiles so they play, sweeping across each one.
        for (const tile of tiles.slice(0, 2)) {
          await intoView(tile);
          await moveTo(tile, 0.22, 0.56);
          startPeek(tile);
          sfx('hover');
          await wait(700);
          const [x, y] = pointOn(tile, 0.8, 0.5);
          await glide(x, y, 1900, (cx) => scrubPeek(tile, cx));
          await wait(500);
          endPeek(tile);
        }

        // Open one, move to the next, close.
        const chosen = tiles[Math.min(1, tiles.length - 1)];
        if (chosen) {
          await moveTo(chosen, 0.5, 0.5);
          startPeek(chosen);
          await wait(240);
          await press(chosen, () => { endPeek(chosen); chosen.click(); });
          await wait(2600);
          if (tiles.length > 1) {
            await moveTo($('ql-next'));
            await wait(160);
            await press($('ql-next'), () => $('ql-next').click());
            await wait(2600);
          }
          await moveTo($('ql-close'));
          await wait(160);
          await press($('ql-close'), () => $('ql-close').click());
          await wait(900);
        }
        await glide(window.innerWidth * 0.8, window.innerHeight * 0.7);
      })().finally(() => { busy = null; });
      return busy;
    };
  }

  /* ------------------------------------------------------------------ init */

  buildTierList();
  restore();
  robotInput.value = state.robot ? state.robot.name : '';
  syncRobotSizer();
  if (state.task) taskEl.textContent = state.task;
  update();
  alignUnderlines();
  booted = true;

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reposition).catch(() => {});
})();
