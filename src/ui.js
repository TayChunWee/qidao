// 界面层：全部是叠在画布上的普通网页元素。
import { MODULES, NAMES, TABS } from './config.js';
import { TIER_NAMES } from './wishes.js';
import { LEVELS, unlockLevel } from './progression.js';
import { FPS_CHOICES } from './perf.js';

const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const ICON = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  remove: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
  camLeft: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  camRight: svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8"/><path d="M12 17v.2"/>'),
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  sound: svg('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6"/>'),
  gauge: svg('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  move: svg('<rect x="3.5" y="3.5" width="11" height="11" rx="2" stroke-dasharray="3 2.6"/><path d="M12.5 12.5 20 20M20 14.5V20h-5.5"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};

// 四档心情 + 难过，对应嘴巴的形状
const MOUTH = ['M15 26h10', 'M14 25q6 4 12 0', 'M13 24q7 8 14 0', 'M12 23q8 12 16 0z', 'M14 28q6-5 12 0'];
const face = (mood) =>
  `<svg viewBox="0 0 40 40"><circle cx="14" cy="17" r="2.3" fill="#4a3a32"/><circle cx="26" cy="17" r="2.3" fill="#4a3a32"/>` +
  (mood === 3 ? '<circle cx="9" cy="23" r="3" fill="#fff" opacity=".35"/><circle cx="31" cy="23" r="3" fill="#fff" opacity=".35"/>' : '') +
  `<path d="${MOUTH[mood]}" fill="${mood === 3 ? '#4a3a32' : 'none'}" stroke="#4a3a32" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const TUTORIAL = [
  ['摆一间房间', '在下方选一个模块，点一下小岛把它放下。模块分「建筑」和「地面」两页，按 <kbd>Tab</kbd> 切换。路、花园和树可以按住拖动连续摆。'],
  ['转一转', '<kbd>R</kbd> 旋转朝向。<kbd>Q</kbd> <kbd>E</kbd> 转动镜头，滚轮缩放，右键拖动平移。<kbd>Z</kbd> 撤销。<kbd>M</kbd> 圈出一块地，整块搬到别处或转个方向。'],
  ['看看会长出什么', '把房间叠高、挨在一起，或者把路铺到门口。屋顶、连廊和门会自己长出来。'],
  ['听听居民想要什么', '左上角是居民的愿望，摆放前留意他们的表情。大家都住下以后，会有新居民上岛。这里没有失败，慢慢来。'],
  ['让小岛长大', '居民住得越满意，顶上的繁荣度就越高。繁荣度够了小岛会升级：解锁新模块、住下更多人，周围的沙洲还会长成新的陆地。'],
];

const $ = (s) => document.querySelector(s);

export class UI {
  constructor(h) {
    this.h = h;
    this.toolEls = new Map();
    this.tabEls = new Map();
    this.wishEls = new Map();
    this.bubbleEls = new Map();
    this.lastClock = '';
    this.tab = TABS[0].id;
    this.unlocked = new Set();
    this.buildToolbar();
    this.buildTop();
    this.wishBox = $('#wishes');
    this.arrival = document.createElement('div');
    this.arrival.className = 'arrival';
    this.wishBox.appendChild(this.arrival);
    this.hint = $('#hint');
    this.toastEl = $('#toast');
    this.tooltip = $('#tooltip');
    $('#btn-start').addEventListener('click', () => h.start());
  }

  // ---------- 工具栏 ----------

  buildToolbar() {
    const tabs = $('#tabs');
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.innerHTML = `${t.name}<i class="dot"></i>`;
      b.addEventListener('click', () => this.h.setTab(t.id));
      tabs.appendChild(b);
      this.tabEls.set(t.id, b);
    }
    const tip = document.createElement('span');
    tip.className = 'tab-tip';
    tip.innerHTML = '<kbd>Tab</kbd> 切换';
    tabs.appendChild(tip);

    const bar = $('#toolbar');
    for (const m of MODULES) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.innerHTML =
        `<span class="key">${m.key}</span><img alt="" draggable="false"><span class="name">${NAMES[m.id]}</span>` +
        `<span class="need">${ICON.lock}<em>${LEVELS[unlockLevel(m.id)].need}</em></span>`;
      b.addEventListener('click', () => this.h.selectTool(m.id));
      this.bindTip(b, NAMES[m.id], () =>
        this.unlocked.has(m.id) ? m.desc : `繁荣度达到 ${LEVELS[unlockLevel(m.id)].need} 时解锁。`,
      );
      bar.appendChild(b);
      this.toolEls.set(m.id, b);
    }
    const sep = document.createElement('span');
    sep.className = 'tb-sep';
    bar.appendChild(sep);
    const act = (id, icon, key, name, desc, fn) => {
      const b = document.createElement('button');
      b.className = 'tool act';
      b.dataset.id = id;
      b.innerHTML = `<span class="key">${key}</span><span class="glyph">${icon}</span><span class="name">${name}</span>`;
      b.addEventListener('click', fn);
      this.bindTip(b, name, () => desc);
      bar.appendChild(b);
      this.toolEls.set(id, b);
      return b;
    };
    act('move', ICON.move, 'M', '搬动', '按住拖动圈出一块地，再拖动圈住的区域，上面的东西会整块搬走；按 R 整块旋转。Esc 取消圈选。', () => this.h.selectTool('move'));
    act('remove', ICON.remove, 'X', '拆除', '点一下拆掉最上面的一块。阳台可以单独拆。', () => this.h.selectTool('remove'));
    this.undoBtn = act('undo', ICON.undo, 'Z', '撤销', '撤销上一步。', () => this.h.undo());
    this.redoBtn = act('redo', ICON.redo, 'Y', '重做', '恢复刚撤销的一步。', () => this.h.redo());
    this.setTab(this.tab);
  }

  bindTip(el, title, desc) {
    el.addEventListener('pointerenter', () => {
      this.h.hoverSound();
      this.tooltip.innerHTML = `<b>${title}</b><span>${desc()}</span>`;
      const r = el.getBoundingClientRect();
      const w = this.tooltip.offsetWidth;
      const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      // 提示放在工具栏上面那排分页按钮的上方，免得被挡住
      const top = Math.min(r.top, $('#tabs').getBoundingClientRect().top);
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.bottom = `${window.innerHeight - top + 10}px`;
      this.tooltip.classList.add('show');
    });
    el.addEventListener('pointerleave', () => this.tooltip.classList.remove('show'));
  }

  setThumbs(map) {
    for (const [id, url] of Object.entries(map)) {
      const el = this.toolEls.get(id);
      if (el) el.querySelector('img').src = url;
    }
  }

  // 切到工具栏的某一页
  setTab(id) {
    this.tab = id;
    for (const [k, el] of this.tabEls) {
      el.classList.toggle('on', k === id);
      if (k === id) el.classList.remove('fresh');
    }
    for (const m of MODULES) this.toolEls.get(m.id).hidden = m.tab !== id;
  }

  // 哪些模块已经解锁。fresh：这次刚解锁的，高亮提示一下
  setUnlocked(set, fresh = []) {
    this.unlocked = set;
    if (!fresh.length) for (const el of this.tabEls.values()) el.classList.remove('fresh');
    for (const m of MODULES) {
      const el = this.toolEls.get(m.id);
      el.classList.toggle('locked', !set.has(m.id));
      if (!set.has(m.id)) el.classList.remove('fresh');
      if (fresh.includes(m.id)) {
        el.classList.add('fresh');
        if (m.tab !== this.tab) this.tabEls.get(m.tab).classList.add('fresh');
        // 一直没去点的话，过一阵也不再闪
        setTimeout(() => el.classList.remove('fresh'), 45000);
      }
    }
  }

  setTool(id) {
    for (const [k, el] of this.toolEls) {
      el.classList.toggle('on', k === id);
      if (k === id) el.classList.remove('fresh');
    }
  }

  setUndoState(canUndo, canRedo) {
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
  }

  // ---------- 顶部 ----------

  buildTop() {
    $('#cam-left').innerHTML = ICON.camLeft;
    $('#cam-right').innerHTML = ICON.camRight;
    $('#btn-help').innerHTML = ICON.help;
    $('#btn-settings').innerHTML = ICON.settings;
    $('#ico-music').innerHTML = ICON.music;
    $('#ico-sfx').innerHTML = ICON.sound;
    $('#cam-left').addEventListener('click', () => this.h.rotateCam(-1));
    $('#cam-right').addEventListener('click', () => this.h.rotateCam(1));
    $('#btn-help').addEventListener('click', () => {
      this.h.clickSound();
      this.showTutorial();
    });
    const panel = $('#settings');
    $('#btn-settings').addEventListener('click', () => {
      this.h.clickSound();
      panel.hidden = !panel.hidden;
    });
    $('#vol-music').addEventListener('input', (e) => this.h.setMusic(e.target.value / 100));
    $('#vol-sfx').addEventListener('input', (e) => this.h.setSfx(e.target.value / 100));
    $('#vol-sfx').addEventListener('change', () => this.h.clickSound());
    $('#ico-fps').innerHTML = ICON.gauge;
    const seg = $('#fps-seg');
    seg.innerHTML = FPS_CHOICES.map((f) => `<button data-fps="${f}">${f}</button>`).join('');
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.h.clickSound();
      this.h.setFps(+b.dataset.fps);
    });
    $('#show-fps').addEventListener('change', (e) => this.h.setShowFps(e.target.checked));
    this.fpsEl = $('#fps');
    this.fpsCap = 144;
    this.hz = 0;
    this.fpsNote = '';
    const reset = $('#btn-reset');
    let armed = 0;
    reset.addEventListener('click', () => {
      if (Date.now() < armed) {
        reset.textContent = '重新开始';
        reset.classList.remove('confirm');
        armed = 0;
        panel.hidden = true;
        this.h.reset();
      } else {
        armed = Date.now() + 3000;
        reset.textContent = '再点一次确认';
        reset.classList.add('confirm');
        setTimeout(() => {
          if (Date.now() >= armed) {
            reset.textContent = '重新开始';
            reset.classList.remove('confirm');
          }
        }, 3100);
      }
    });
    this.clockIcon = $('#clock-icon');
    this.clockText = $('#clock-text');
    this.dial = $('#dial');
    this.sunDot = $('#sun-dot');
    this.prosper = $('#prosper');
    this.prLv = $('#pr-lv');
    this.prFill = $('#pr-fill');
    this.prNum = $('#pr-num');
    this.prDelta = $('#pr-delta');
    this.prNext = $('#pr-next');
  }

  setVolumes(music, sfx) {
    $('#vol-music').value = Math.round(music * 100);
    $('#vol-sfx').value = Math.round(sfx * 100);
  }

  // 帧率上限选了哪个、要不要在角落显示实际帧率
  setFpsChoice(fps, show) {
    this.fpsCap = fps;
    for (const b of $('#fps-seg').children) b.classList.toggle('on', +b.dataset.fps === fps);
    $('#show-fps').checked = show;
    this.fpsEl.hidden = !show;
    this.refreshFpsNote();
  }

  // 每秒一次。fps：实际帧率；hz：屏幕刷新率；scale：现在的渲染分辨率倍数（掉帧时会自动调低）
  setPerf({ fps, hz, scale }) {
    this.hz = hz;
    if (!this.fpsEl.hidden) this.fpsEl.textContent = `${fps} 帧/秒${scale < 1 ? `\n分辨率 ${Math.round(scale * 100)}%` : ''}`;
    this.refreshFpsNote();
  }

  refreshFpsNote() {
    const text = this.hz && this.fpsCap > this.hz * 1.03 ? `这块屏幕每秒刷新约 ${this.hz} 次，帧率最高到 ${this.hz}` : '';
    if (text === this.fpsNote) return;
    this.fpsNote = text;
    const note = $('#fps-note');
    note.textContent = text;
    note.hidden = !text;
  }

  setClock(t, isDay) {
    const hours = (6 + t * 24) % 24;
    const hh = Math.floor(hours);
    const mm = Math.floor(((hours - hh) * 60) / 10) * 10;
    const label = hh < 5 ? '夜晚' : hh < 8 ? '清晨' : hh < 11 ? '上午' : hh < 13 ? '中午' : hh < 17 ? '下午' : hh < 20 ? '傍晚' : '夜晚';
    const text = `${label} ${hh}:${String(mm).padStart(2, '0')}`;
    if (text !== this.lastClock) {
      this.lastClock = text;
      this.clockText.textContent = text;
    }
    if (isDay !== this.lastDay) {
      this.lastDay = isDay;
      this.clockIcon.innerHTML = isDay ? ICON.sun : ICON.moon;
      this.clockIcon.classList.toggle('moon', !isDay);
      $('#vignette').style.opacity = isDay ? 1 : 1.6;
    }
  }

  // az：镜头方位角；sunTheta：太阳在东→西弧线上的位置
  setCompass(az, sunTheta, isDay) {
    // 这里每帧都会调用：数值没变就不碰样式
    const rot = az.toFixed(4);
    if (rot !== this.lastRot) {
      this.lastRot = rot;
      this.dial.style.setProperty('--rot', `${rot}rad`);
    }
    const sun = isDay ? sunTheta.toFixed(3) : 'night';
    if (sun === this.lastSun) return;
    this.lastSun = sun;
    // 太阳标在罗盘外圈：东边升起，经过南边，西边落下
    const a = Math.PI / 2 + sunTheta;
    this.sunDot.style.left = `${22 + Math.sin(a) * 26}px`;
    this.sunDot.style.top = `${22 - Math.cos(a) * 26}px`;
    this.sunDot.style.opacity = isDay ? 1 : 0;
  }

  // 繁荣度。p：现在的繁荣度；level：等级（从 0 起）；from、to：这一级的起点和升下一级要的数；
  // next：下一级会带来什么；没有下一级时 to 为 null
  setProsperity({ p, level, from, to, next }) {
    this.prLv.textContent = `小岛 ${level + 1} 级`;
    if (to === null) {
      this.prNum.textContent = `繁荣度 ${p}`;
      this.prFill.style.width = '100%';
      this.prNext.textContent = '小岛已经建成，接下来随你喜欢';
    } else {
      this.prNum.textContent = `繁荣度 ${p} / ${to}`;
      this.prFill.style.width = `${Math.max(0, Math.min(1, (p - from) / (to - from))) * 100}%`;
      this.prNext.innerHTML = `<b>到 ${to}</b>${next.map((t) => `<span>${t}</span>`).join('')}`;
    }
    if (this.lastP !== undefined && p > this.lastP) {
      this.prosper.classList.remove('bump');
      void this.prosper.offsetWidth;
      this.prosper.classList.add('bump');
    }
    this.lastP = p;
  }

  // 摆放前的预览：这一步会让繁荣度变多少
  setProsperPreview(delta) {
    this.prDelta.textContent = delta ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : '';
    this.prDelta.className = `pr-delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`;
  }

  // 升级提示：盖在画面中间，几秒后自己消失
  levelUp(level, p, lines, final) {
    const box = $('#levelup');
    box.innerHTML =
      `<div class="lu-card"><div class="lu-kicker">繁荣度 ${p}</div><h2>${final ? '小岛建成了' : `小岛升到 ${level + 1} 级`}</h2>` +
      `<ul>${lines.map((t) => `<li>${t}</li>`).join('')}</ul></div>`;
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(this.luTimer);
    this.luTimer = setTimeout(() => box.classList.remove('show'), final ? 7000 : 4600);
  }

  // ---------- 居民愿望 ----------

  // spec：wishes.js 里的居民模板。animate：新来的居民卡片会滑进来
  addResident(spec, animate) {
    const el = document.createElement('button');
    el.className = `wish${animate ? ' enter' : ''}`;
    el.innerHTML =
      `<div class="avatar" style="--c:${spec.look.body}"></div>` +
      `<div class="wish-body"><div class="wish-top"><b>${spec.name}</b><span class="tier"></span><span class="pips"><i></i><i></i><i></i><i class="star"></i></span></div>` +
      `<div class="wish-text">${spec.wish}</div><div class="wish-need"></div><div class="wish-bonus"></div><div class="wish-preview"></div></div>`;
    el.addEventListener('click', () => this.h.focusResident(spec.id));
    this.wishBox.insertBefore(el, this.arrival);
    this.wishEls.set(spec.id, { el, mood: -1, tier: 0, bonus: false });
    const b = document.createElement('div');
    b.className = 'bubble';
    $('#bubbles').appendChild(b);
    this.bubbleEls.set(spec.id, { el: b, text: '', name: spec.name });
    if (animate) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  clearResidents() {
    for (const w of this.wishEls.values()) w.el.remove();
    for (const b of this.bubbleEls.values()) b.el.remove();
    this.wishEls.clear();
    this.bubbleEls.clear();
  }

  setWishes(results) {
    for (const r of results) {
      const w = this.wishEls.get(r.id);
      if (!w) continue;
      w.tier = r.tier;
      w.bonus = !!(r.bonus && r.bonus.done);
      const el = w.el;
      // 已经满意的居民收成一行，鼠标移上去再展开；还需要照顾的排在前面
      el.classList.toggle('compact', r.tier >= 2);
      el.style.order = r.tier < 2 ? 0 : r.bonus && !r.bonus.done ? 1 : 2;
      el.querySelector('.tier').textContent = TIER_NAMES[r.tier];
      el.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < 3 ? i < r.tier : w.bonus));
      el.querySelector('.wish-need').innerHTML = r.need.map((n) => `<span>${n}</span>`).join('');
      el.classList.toggle('has-bonus', !!r.bonus);
      el.classList.toggle('bonus-done', w.bonus);
      el.querySelector('.wish-bonus').innerHTML = r.bonus ? `<em>${w.bonus ? '新想法实现了' : '新想法'}</em>${r.bonus.text}` : '';
      this.setMood(w, r.tier);
    }
  }

  // 列表底部的一行小字：还有没有新居民要来
  setArrival(state, n, max) {
    const text = {
      waiting: '先让大家都住下，才会有新居民来',
      coming: '新居民正在路上',
      noroom: '岛上暂时没有适合新居民的空地',
      cap: '繁荣度再高一些，小岛才住得下更多人',
      full: '居民都到齐了',
    }[state];
    this.arrival.className = `arrival show ${state}`;
    this.arrival.innerHTML = `<b>居民 ${n} / ${max}</b><span>${text}</span>`;
  }

  setMood(w, mood) {
    if (w.mood === mood) return;
    w.mood = mood;
    w.el.querySelector('.avatar').innerHTML = face(mood);
  }

  // 摆放前的预览：这一步会让居民的评价变成什么。preview：[{ id, tier, bonus }]
  setPreview(preview) {
    for (const [id, w] of this.wishEls) {
      const p = preview && preview.find((x) => x.id === id);
      const delta = p ? p.tier - w.tier : 0;
      const bonus = p && !delta ? Number(p.bonus) - Number(w.bonus) : 0;
      w.el.classList.toggle('up', delta > 0 || bonus > 0);
      w.el.classList.toggle('down', delta < 0 || bonus < 0);
      const tag = w.el.querySelector('.wish-preview');
      if (delta) {
        tag.textContent = `${delta > 0 ? '放在这里会变成' : '放在这里会降到'}「${TIER_NAMES[p.tier]}」`;
        this.setMood(w, delta < 0 ? 4 : p.tier);
      } else if (bonus) {
        tag.textContent = bonus > 0 ? '放在这里能实现新想法' : '放在这里新想法会落空';
        this.setMood(w, bonus < 0 ? 4 : 3);
      } else {
        this.setMood(w, w.tier);
      }
    }
  }

  celebrate(id) {
    const w = this.wishEls.get(id);
    if (!w) return;
    const el = w.el;
    el.classList.remove('celebrate');
    void el.offsetWidth;
    el.classList.add('celebrate');
  }

  setBubble(id, text, x, y) {
    const b = this.bubbleEls.get(id);
    if (!b) return;
    if (!text) {
      if (b.text) {
        b.text = '';
        b.el.classList.remove('show');
      }
      return;
    }
    if (b.text !== text) {
      b.text = text;
      b.el.innerHTML = `<b>${b.name}</b>${text}`;
      b.el.classList.add('show');
      // 尺寸只在文字变了的时候量一次，不要每帧都逼浏览器重新排版
      b.w = b.el.offsetWidth;
      b.h = b.el.offsetHeight;
    }
    const px = Math.min(window.innerWidth - b.w - 8, Math.max(8, x + 6));
    const py = Math.max(8, y - b.h - 6);
    b.el.style.transform = `translate(${px}px, ${py}px)`;
  }

  // ---------- 提示 ----------

  setHint(text, x, y, bad) {
    if (!text) {
      this.hint.classList.remove('show');
      return;
    }
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle('bad', !!bad);
    this.hint.classList.add('show');
    this.hint.style.transform = `translate(${x + 18}px, ${y + 20}px)`;
  }

  toast(text, seconds = 1.8) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  hideStart() {
    $('#start').classList.add('gone');
  }

  // from：从第几步开始（老玩家只需要看新加的最后一步）
  showTutorial(onDone, from = 0) {
    const box = $('#tutorial');
    let i = from < 0 ? TUTORIAL.length + from : from;
    const done = () => {
      box.hidden = true;
      if (onDone) onDone();
    };
    const render = () => {
      const [title, text] = TUTORIAL[i];
      const last = i === TUTORIAL.length - 1;
      box.innerHTML =
        `<h3>${title}</h3><p>${text}</p><div class="tut-foot"><span class="dots">` +
        (from ? '' : TUTORIAL.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')) +
        `</span>${last ? '' : '<button class="tut-skip">跳过</button>'}<button class="tut-next">${last ? '开始吧' : '下一步'}</button></div>`;
      box.querySelector('.tut-next').addEventListener('click', () => {
        this.h.clickSound();
        if (last) done();
        else {
          i++;
          render();
        }
      });
      const skip = box.querySelector('.tut-skip');
      if (skip) skip.addEventListener('click', done);
    };
    box.hidden = false;
    render();
  }
}
