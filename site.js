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
    object: /\b(hands?|arms?|fingers?|thumbs?|wrists?|elbows?|shoulders?|legs?|foot|feet|knees?|hips?|head|torso|waist|body|palms?|fists?|grippers?|cups?|mugs?|bottles?|cans|glass(es)?|plates?|bowls?|spoons?|forks?|kni(fe|ves)|t-?shirts?|shirts?|towels?|cloths?|socks?|pants|jackets?|doors?|drawers?|handles?|knobs?|buttons?|switch(es)?|levers?|box(es)?|blocks?|cubes?|balls?|toys?|books?|pens?|pencils?|markers?|tables?|desks?|shel(f|ves)|bins?|baskets?|trays?|lids?|caps?|bags?|cables?|plugs?|screws?|bolts?|pegs?|keys?|phones?|remotes?|apples?|bananas?|oranges?|eggs?|sponges?|brush(es)?|cards?|coins?|chairs?|hammers?|screwdrivers?|wrench(es)?|dish(es)?|pots?|pans?)\b/i,
    side: /\b(left|right|up|down|upwards?|downwards?|forwards?|backwards?|back|sideways|clockwise|counter-?clockwise|anti-?clockwise|towards?|away|above|below|behind|front|top|bottom|overhead|inwards?|outwards?|horizontal(ly)?|vertical(ly)?|diagonal(ly)?|north|south|east|west)\b/i,
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
    robotList.replaceChildren();

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

  function positionRobotList() {
    const space = placePop(robotList, robotBlank, smallScreen.matches ? 9999 : 360, 300);
    robotList.style.maxHeight = `${clamp(space, 200, smallScreen.matches ? 560 : 440)}px`;
  }

  function openRobot(query) {
    closeTier();
    renderRobotList(query);
    positionRobotList();
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
    robotList.dataset.open = 'false';
    robotInput.setAttribute('aria-expanded', 'false');
    robotInput.removeAttribute('aria-activedescendant');
    robot.active = -1;
  }

  function chooseRobot(choice, moveOn) {
    state.robot = choice;
    robot.typed = false;
    robotInput.value = choice ? choice.name : '';
    syncRobotSizer();
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
    tierList.append(el('div', { class: 'sheet-head', role: 'presentation' },
      el('span', { class: 'eyebrow eyebrow--sm', text: 'Data quality' })));
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
    if (smallScreen.matches) {
      for (const prop of ['width', 'left', 'top', 'bottom', 'maxHeight']) tierList.style[prop] = '';
      return;
    }
    tierList.style.maxHeight = '';
    const space = placePop(tierList, tierBtn, 440, tierList.offsetHeight);
    tierList.style.maxHeight = `${Math.max(space, 240)}px`;
  }

  function openTier() {
    closeRobot();
    positionTierList();
    tier.open = true;
    tierList.dataset.open = 'true';
    scrim.dataset.open = 'true';
    tierBtn.setAttribute('aria-expanded', 'true');
    setTierActive(TIERS.findIndex((t) => t.id === state.tier));
  }

  function closeTier() {
    if (!tier.open) return;
    tier.open = false;
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
    if (event.key !== 'Escape') return;
    closeRobot();
    closeTier();
  });

  const reposition = () => {
    if (robot.open) positionRobotList();
    if (tier.open) positionTierList();
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

  function composedSentence() {
    const t = tierById(state.tier);
    return `I want to train ${articleFor(state.robot.name)} ${state.robot.name} to ${clean(state.task, TASK_MAX)} with ${t.title.toLowerCase()} data.`;
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
    return url.toString();
  }

  function renderBrief() {
    const t = tierById(state.tier);
    const spec = scoreTask(state.task);
    const live = state.robot.status === 'live';

    const sentence = $('brief-sentence');
    sentence.replaceChildren(
      `I want to train ${articleFor(state.robot.name)} `, el('em', { text: state.robot.name }),
      ' to ', el('em', { text: clean(state.task, TASK_MAX) }),
      ' with ', el('em', { text: t.title.toLowerCase() }), ' data.'
    );

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

  let settleTimer = 0;

  function openBrief() {
    state.composed = true;
    renderBrief();
    briefWrap.inert = false;
    briefWrap.classList.add('is-open');
    try { window.history.replaceState(null, '', shareUrl()); } catch (_) { /* file:// and friends */ }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      briefWrap.classList.add('is-settled');
      $('brief').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
    }, reducedMotion.matches ? 0 : 640);
    announce.textContent = 'Run brief composed below.';
  }

  $('composer').addEventListener('submit', (event) => {
    event.preventDefault();
    if (isValid()) openBrief();
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

  /* ---------------------------------------------------------------- update */

  const segs = Array.from(document.querySelectorAll('#meter .seg'));
  const meter = $('meter');

  function update() {
    const robotText = state.robot ? state.robot.name : robotInput.value;
    articleEl.textContent = articleFor(robotText);
    tierLabel.textContent = tierById(state.tier).title.toLowerCase();
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
    // An open brief follows the blanks. While they are incomplete it dims instead of jumping away.
    if (state.composed) {
      if (valid) renderBrief();
      briefWrap.classList.toggle('is-stale', !valid);
      $('brief').inert = !valid;
    }

    save();
  }

  /* ------------------------------------------------------------------ init */

  buildTierList();
  restore();
  robotInput.value = state.robot ? state.robot.name : '';
  syncRobotSizer();
  if (state.task) taskEl.textContent = state.task;
  update();

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reposition).catch(() => {});
})();
