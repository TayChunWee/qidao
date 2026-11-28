// 界面层：全部是叠在画布上的普通网页元素。
import { MODULES, TABS, VERSION, AUTHOR } from './config.js';
import { avatar } from './avatars.js';
import { LEVELS, unlockLevel } from './progression.js';
import { FPS_CHOICES, QUALITY_MODES } from './perf.js';
import { TRACKS } from './music.js';
import { t, nameOf, descOf, LANGS, getLang } from './i18n.js';
import { feedbackOn, cooling, KINDS, MAX_LEN, MIN_LEN } from './feedback.js';

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
  gauge: svg('<path d="M3.34 19a10 10 0 1 1 17.32 0"/><path d="m12 14 4-4"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  move: svg('<rect x="3.5" y="3.5" width="11" height="11" rx="2" stroke-dasharray="3 2.6"/><path d="M12.5 12.5 20 20M20 14.5V20h-5.5"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  next: svg('<path d="M6 5.5 15 12l-9 6.5z"/><path d="M18.5 5.5v13"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  turn: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
  hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.3 14a1.5 1.5 0 0 1 2.5-1.6L8 15"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c-5 5-5 13 0 18c5-5 5-13 0-18"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  leaf: svg('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19 13 11"/>'),
  cloud: svg('<path d="M7 17a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17.5 17z"/><path d="M9 20v1M13 20v1M17 20v1"/>'),
};

const $ = (s) => document.querySelector(s);
// 界面的明暗。每一项：样式变量、白天的颜色、夜里的颜色、是不是"字"；写成 rgb 的三个数，中间的过渡现算。
// 名字以 -rgb 结尾的只给三个数（样式里配上各自的透明度用），--edge 另带透明度。
// 底色在整段时间里慢慢变；字要从深色翻成浅色，翻到一半时和底色最接近、最难认，
// 所以字只在底色变到一半的那一小段里很快翻过去
const THEME = [
  ['--ink', [90, 74, 64], [240, 231, 219], true],
  ['--ink-soft', [141, 123, 110], [176, 168, 170], true],
  ['--tint-rgb', [120, 90, 60], [255, 238, 220], true],
  ['--good', [79, 138, 66], [163, 214, 146], true],
  ['--warn', [185, 84, 63], [244, 164, 146], true],
  ['--paper-rgb', [255, 249, 238], [44, 43, 64], false],
  ['--raise-rgb', [255, 255, 255], [82, 79, 110], false],
  ['--edge', [255, 255, 255, 0.75], [255, 255, 255, 0.12], false],
];
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const THEMES = ['auto', 'light', 'dark'];
const THEME_FADE = 5; // 入夜、天亮时界面换颜色用几秒
const THEME_QUICK = 0.5; // 玩家自己在设置里换的时候

// 手机的版式（和 styles.css 里那条 @media 一致）：竖着拿的窄屏，或者横着拿的矮屏
const PHONE = '(max-width: 700px), (max-height: 500px)';
// 其中横着拿的那一种（和 styles.css 里横屏那条 @media 一致）。竖着拿的才用单手版式
const LANDSCAPE = '(max-height: 500px) and (min-width: 560px)';
const HANDS = ['left', 'right'];

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
    this.toolNames = new Map(); // 工具栏每个按钮的名字（换语言时要重新取）
    this.touch = false;
    this.themeMode = 'auto';
    this.themeAt = null; // 界面现在有多"夜"：0 浅色，1 深色；null 是还没定过
    this.themeK = -1;
    this.themeInk = -1;
    this.themeQuick = false;
    this.phone = window.matchMedia ? window.matchMedia(PHONE) : { matches: false };
    this.land = window.matchMedia ? window.matchMedia(LANDSCAPE) : { matches: false };
    this.dock = false; // 单手版式：头像和转镜头的按钮挪到了工具栏上方
    this.lastAim = null;
    this.hand = 'right';
    this.hzPeak = 0;
    this.chrome = '';
    this.openWishId = null;
    this.wishDetail = $('#wish-detail');
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
    this.wishDetail.addEventListener('click', () => this.openWish(null));
    const relayout = () => this.relayout();
    for (const q of [this.phone, this.land]) {
      if (q.addEventListener) q.addEventListener('change', relayout);
      else if (q.addListener) q.addListener(relayout);
    }
    this.relayout();
    this.guardPage();
    this.applyLang();
  }

  // ---------- 语言 ----------

  // 把界面上已经写出来的文字按当前语言重写一遍。居民的评价、繁荣度这些由 game.js 重新算了再送进来
  applyLang() {
    document.title = t('title');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    for (const b of $('#fb-kind').children) b.textContent = t(`fb.kind.${b.dataset.kind}`);
    this.setFeedbackMsg();
    this.renderCredits();
    for (const [id, el] of this.tabEls) el.querySelector('span').textContent = t(`tab.${id}`);
    this.tabTip.innerHTML = t('tab.tip');
    for (const [id, name] of this.toolNames) this.toolEls.get(id).querySelector('.name').textContent = name();
    this.resetBtn.textContent = t('set.reset');
    this.resetBtn.classList.remove('confirm');

    const track = $('#track');
    const chosen = track.value || 'shuffle';
    track.innerHTML =
      `<option value="shuffle">${t('music.shuffle')}</option>` +
      TRACKS.map((k, i) => `<option value="${k.id}">${String(i + 1).padStart(2, '0')} ${k.title}</option>`).join('') +
      `<option value="synth">${t('music.synth')}</option>`;
    track.value = chosen;
    this.setNowPlaying(this.nowTrack, this.nowResting);

    for (const b of $('#hand-seg').children) b.textContent = t(`hand.${b.dataset.hand}`);
    for (const b of $('#quality-seg').children) b.textContent = t(`q.${b.dataset.v}`);
    for (const b of $('#season-seg').children) b.textContent = t('season', +b.dataset.v);
    for (const b of $('#wx-seg').children) b.textContent = t(`wx.${b.dataset.v}`);
    if (this.season !== undefined) this.setSeason(this.season);
    $('#theme').innerHTML = THEMES.map((m) => `<option value="${m}">${t(`theme.${m}`)}</option>`).join('');
    $('#theme').value = this.themeMode;

    const lang = getLang();
    $('#lang').value = lang;
    for (const b of $('#start-langs').children) b.classList.toggle('on', b.dataset.lang === lang);

    this.fpsNote = null;
    this.refreshFpsNote();
    this.lastClock = '';
    for (const w of this.wishEls.values()) {
      w.el.querySelector('.wish-top b').textContent = w.spec.name;
      w.el.querySelector('.wish-text').textContent = w.spec.wish;
    }
    for (const b of this.bubbleEls.values()) b.shown = '';
    if (this.lastArrival) this.setArrival(...this.lastArrival);
    if (this.tutRender) this.tutRender();
  }

  // ---------- 工具栏 ----------

  buildToolbar() {
    const tabs = $('#tabs');
    for (const tab of TABS) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.innerHTML = '<span></span><i class="dot"></i>';
      b.addEventListener('click', () => this.h.setTab(tab.id));
      tabs.appendChild(b);
      this.tabEls.set(tab.id, b);
    }
    this.tabTip = document.createElement('span');
    this.tabTip.className = 'tab-tip';
    tabs.appendChild(this.tabTip);

    const bar = $('#tool-list');
    const acts = $('#acts');
    this.toolBar = bar;
    // 这一排放不下所有模块的时候可以左右滚。barGoal：正在滑向的位置，没在滑就是 null
    this.barGoal = null;
    const maxScroll = () => Math.max(0, bar.scrollWidth - bar.clientWidth);
    // 哪一头还有没露出来的模块（样式据此把那一头淡出）
    this.syncBar = () => {
      bar.classList.toggle('more-l', bar.scrollLeft > 2);
      bar.classList.toggle('more-r', bar.scrollLeft < maxScroll() - 2);
    };
    const glide = () => {
      if (this.barGoal === null) return;
      const d = this.barGoal - bar.scrollLeft;
      const was = bar.scrollLeft;
      if (Math.abs(d) >= 1) bar.scrollLeft += Math.abs(d * 0.28) < 1 ? Math.sign(d) : d * 0.28;
      // 到了，或者挪不动了
      if (Math.abs(d) < 1 || bar.scrollLeft === was) {
        this.barGoal = null;
        return;
      }
      requestAnimationFrame(glide);
    };
    this.scrollBar = (to) => {
      const idle = this.barGoal === null;
      this.barGoal = Math.min(maxScroll(), Math.max(0, to));
      if (idle) requestAnimationFrame(glide);
    };
    // 鼠标停在这一排上滚滚轮，或者触控板双指左右滑，都是左右滚
    bar.addEventListener(
      'wheel',
      (e) => {
        if (maxScroll() <= 0) return;
        e.preventDefault();
        e.stopPropagation();
        const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? bar.clientWidth : 1;
        const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
        if (!d) return;
        if (e.deltaMode === 0 && Math.abs(d) < 40) {
          // 触控板一次只挪一点点：直接跟着手指走
          this.barGoal = null;
          bar.scrollLeft += d;
        } else {
          // 鼠标滚轮一格跳得远：滑过去
          this.scrollBar((this.barGoal ?? bar.scrollLeft) + d);
        }
      },
      { passive: false },
    );
    bar.addEventListener('scroll', this.syncBar, { passive: true });
    window.addEventListener('resize', this.syncBar);
    for (const m of MODULES) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.innerHTML =
        `<span class="key">${m.key}</span><img alt="" draggable="false"><span class="name"></span>` +
        `<span class="need">${ICON.lock}<em>${LEVELS[unlockLevel(m.id)].need}</em></span>`;
      b.addEventListener('click', () => this.h.selectTool(m.id));
      const name = () => nameOf(m.id);
      this.bindTip(b, name, () => (this.unlocked.has(m.id) ? descOf(m.id) : t('tool.locked', LEVELS[unlockLevel(m.id)].need)));
      bar.appendChild(b);
      this.toolEls.set(m.id, b);
      this.toolNames.set(m.id, name);
    }
    const act = (id, icon, key, fn) => {
      const b = document.createElement('button');
      b.className = 'tool act';
      b.dataset.id = id;
      b.innerHTML = `<span class="key">${key}</span><span class="glyph">${icon}</span><span class="name"></span>`;
      b.addEventListener('click', fn);
      const name = () => t(`act.${id}`);
      this.bindTip(b, name, () => t(`act.${id}.desc`));
      acts.appendChild(b);
      this.toolEls.set(id, b);
      this.toolNames.set(id, name);
      return b;
    };
    act('move', ICON.move, 'M', () => this.h.selectTool('move'));
    act('remove', ICON.remove, 'X', () => this.h.selectTool('remove'));
    this.undoBtn = act('undo', ICON.undo, 'Z', () => this.h.undo());
    this.redoBtn = act('redo', ICON.redo, 'Y', () => this.h.redo());
    this.setTab(this.tab);

    // 触屏上工具栏上方的那一条
    this.aimBar = $('#aimbar');
    this.aimText = $('#aim-text');
    this.aimRot = $('#aim-rot');
    this.aimOk = $('#aim-ok');
    this.aimNo = $('#aim-no');
    this.aimRot.innerHTML = ICON.turn;
    this.aimOk.innerHTML = `${ICON.check}<span></span>`;
    this.aimNo.innerHTML = ICON.close;
    this.aimRot.addEventListener('click', () => this.h.rotate());
    this.aimOk.addEventListener('click', () => this.h.aimConfirm());
    this.aimNo.addEventListener('click', () => this.h.aimCancel());
  }

  // title、desc 都是函数：提示出现的那一刻才按当前语言取文字
  bindTip(el, title, desc) {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return; // 手指点上去不算"移上去"，说明改在选中时弹出
      this.h.hoverSound();
      this.tooltip.innerHTML = `<b>${title()}</b><span>${desc()}</span>`;
      const r = el.getBoundingClientRect();
      const w = this.tooltip.offsetWidth;
      const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      // 提示放在工具栏上面那排分页按钮的上方，免得被挡住
      const top = Math.min(r.top, $('#tabs').getBoundingClientRect().top);
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.bottom = `${window.innerHeight - top + 10}px`;
      this.tooltip.classList.add('show');
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.tooltip.classList.remove('show'); // 手指抬起不算"移开"：触屏的说明由 showTip 自己计时收起
    });
  }

  // 触屏上选中一个模块或工具：在它上方弹出名字、说明和用法，三秒后淡出；手指一碰小岛也会收起
  showTip(id, desc, how) {
    const el = this.toolEls.get(id);
    if (!el) return;
    this.tooltip.innerHTML = `<b>${this.toolNames.get(id)()}</b>${desc ? `<span>${desc}</span>` : ''}${how ? `<span class="how">${how}</span>` : ''}`;
    const r = el.getBoundingClientRect();
    const w = this.tooltip.offsetWidth;
    const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    // 贴在分页那一排的上面：单手版式里正好盖住头像那一排，不再多占小岛的画面
    const top = Math.min(r.top, $('#tabrow').getBoundingClientRect().top);
    const box = $('#ui').getBoundingClientRect();
    this.tooltip.style.left = `${x - box.left}px`;
    this.tooltip.style.bottom = `${box.bottom - top + 6}px`;
    this.tooltip.classList.add('show');
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => this.tooltip.classList.remove('show'), 3000);
  }

  hideTip() {
    if (!this.touch) return;
    clearTimeout(this.tipTimer);
    this.tooltip.classList.remove('show');
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
    // 换了一页：从头看起；这一页里有刚解锁的就直接滚到它那儿
    const bar = this.toolBar;
    this.barGoal = null;
    bar.scrollLeft = 0;
    this.revealFresh();
    this.syncBar();
  }

  // 把某个模块滚进这一排看得见的地方（本来就看得见的不动）
  revealTool(el) {
    const bar = this.toolBar;
    if (!el || !el.offsetParent || bar.scrollWidth <= bar.clientWidth) return;
    const r = el.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const pad = 40; // 两头淡出的那一段不算看得见
    if (r.left < br.left + pad) this.scrollBar(bar.scrollLeft - (br.left + pad - r.left));
    else if (r.right > br.right - pad) this.scrollBar(bar.scrollLeft + (r.right - (br.right - pad)));
  }

  // 当前这一页里刚解锁的模块如果在外面，滚过去让玩家看见
  revealFresh() {
    for (const m of MODULES) {
      const el = this.toolEls.get(m.id);
      if (m.tab === this.tab && el.classList.contains('fresh')) {
        this.revealTool(el);
        return;
      }
    }
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
    if (fresh.length) this.revealFresh();
  }

  setTool(id) {
    for (const [k, el] of this.toolEls) {
      el.classList.toggle('on', k === id);
      if (k !== id) continue;
      el.classList.remove('fresh');
      // 选中的模块如果在外面或者压在淡出的边上，把它挪进来
      this.revealTool(el);
    }
  }

  // ---------- 触屏 ----------

  // 玩家这会儿用的是手指还是鼠标
  setTouch(on) {
    this.touch = on;
    document.body.classList.toggle('touch', on);
    this.tooltip.classList.remove('show');
    if (this.tutRender) this.tutRender();
  }

  // 工具栏上方的那一条。s 为空就收起；text 一句话，bad 标红，rot、cancel 要不要转向和取消按钮，ok 是确认按钮上的字
  setAim(s) {
    this.lastAim = s;
    if (!s) {
      this.aimBar.hidden = true;
      document.body.classList.remove('aiming');
      this.aimKey = '';
      clearTimeout(this.aimTimer);
      return;
    }
    // 单手版式里这一条挤在分页那一排，地方小：只留要紧的字（朝向、第几层、摆放时放不下的原因）
    const text = this.dock && s.short !== undefined ? s.short : s.text;
    const plain = !s.rot && !s.cancel && !s.ok;
    if (plain && !text) {
      // 没有字也没有按钮：不用出现
      this.aimBar.hidden = true;
      document.body.classList.remove('aiming');
      this.aimKey = '';
      clearTimeout(this.aimTimer);
      return;
    }
    this.aimBar.hidden = false;
    document.body.classList.add('aiming'); // 电脑版式里，提示条要给这一条让位
    // 只有一句提示、没有按钮的时候：露两秒就慢慢淡出，不一直挡着小岛。换了一句话会重新露出来
    const key = `${plain ? 1 : 0}${text}`;
    if (key !== this.aimKey) {
      this.aimKey = key;
      clearTimeout(this.aimTimer);
      this.aimBar.classList.remove('fade');
      this.aimBar.classList.toggle('plain', plain);
      if (plain) this.aimTimer = setTimeout(() => this.aimBar.classList.add('fade'), 2000);
    }
    if (this.aimText.textContent !== text) this.aimText.textContent = text;
    this.aimBar.classList.toggle('bad', !!s.bad);
    this.aimRot.hidden = !s.rot;
    this.aimNo.hidden = !s.cancel;
    this.aimOk.hidden = !s.ok;
    if (s.ok) this.aimOk.lastChild.textContent = s.ok;
  }

  // 窗口大小或手机方向变了：竖着拿的手机用单手版式，把居民头像、愿望和转镜头的两个按钮
  // 挪进屏幕下方工具栏那一摞里（位置由 styles.css 里 body.dock 那几条管）；别的版式再挪回原处
  relayout() {
    const dock = this.phone.matches && !this.land.matches;
    if (dock !== this.dock) {
      this.dock = dock;
      document.body.classList.toggle('dock', dock);
      const cams = [$('#cam-left'), $('#cam-right')];
      const wrap = $('#toolbar-wrap');
      const row = $('#tabrow');
      if (dock) {
        // 头像那一排：居民数固定在一头，头像在剩下的地方左右滑
        const people = $('#people');
        people.appendChild(this.arrival);
        people.appendChild(this.wishBox);
        wrap.insertBefore(this.toastEl, people);
        row.insertBefore(this.aimBar, row.firstChild); // 确认、转向、取消这几个按钮并进分页那一排，不另占一行
        for (const b of cams) $('#cams').appendChild(b);
      } else {
        const ui = $('#ui');
        this.wishBox.appendChild(this.arrival);
        ui.insertBefore(this.wishBox, this.wishDetail);
        ui.insertBefore(this.toastEl, this.hint.nextSibling);
        wrap.insertBefore(this.aimBar, row);
        const pill = $('#topbar .pill');
        pill.insertBefore(cams[1], pill.firstChild);
        pill.insertBefore(cams[0], cams[1]);
      }
      this.aimKey = '';
      if (this.lastAim) this.setAim(this.lastAim);
    }
    this.renderWishDetail();
    if (this.tutRender) this.tutRender();
  }

  setQuality(mode) {
    for (const b of $('#quality-seg').children) b.classList.toggle('on', b.dataset.v === mode);
  }

  // 时钟旁边写着现在是哪个季节
  setSeason(s) {
    this.season = s;
    $('#clock-season').textContent = t('season', s);
  }

  // 测试用的那两行开关：只在测试地址和本机上露出来
  showTest(on) {
    for (const el of document.querySelectorAll('.test-only')) el.hidden = !on;
  }

  setTest(season, wx) {
    for (const b of $('#season-seg').children) b.classList.toggle('on', +b.dataset.v === season);
    for (const b of $('#wx-seg').children) b.classList.toggle('on', b.dataset.v === wx);
  }

  // 用哪只手拿手机：常点的按钮靠那一边
  setHand(hand) {
    this.hand = HANDS.includes(hand) ? hand : 'right';
    document.body.classList.toggle('hand-left', this.hand === 'left');
    for (const b of $('#hand-seg').children) b.classList.toggle('on', b.dataset.hand === this.hand);
  }

  // 手机上居民只显示头像，点一下在屏幕上方展开他的愿望；露三秒后淡出、自己收起，不一直挡着小岛。id 为空就收起
  openWish(id) {
    this.openWishId = id;
    clearTimeout(this.wishTimer);
    this.wishDetail.classList.remove('fade');
    this.renderWishDetail();
    if (!id || !this.phone.matches) return;
    this.wishTimer = setTimeout(() => {
      this.wishDetail.classList.add('fade');
      this.wishTimer = setTimeout(() => this.openWish(null), 900);
    }, 3000);
  }

  renderWishDetail() {
    const box = this.wishDetail;
    const w = this.phone.matches ? this.wishEls.get(this.openWishId) : null;
    for (const [id, x] of this.wishEls) x.el.classList.toggle('open', !!w && id === this.openWishId);
    if (!w) {
      box.hidden = true;
      return;
    }
    const has = (c) => (w.el.classList.contains(c) ? ` ${c}` : '');
    box.className = `panel${has('has-bonus')}${has('bonus-done')}${has('up')}${has('down')}${box.classList.contains('fade') ? ' fade' : ''}`;
    box.innerHTML = '';
    box.appendChild(w.el.querySelector('.wish-body').cloneNode(true));
    box.hidden = false;
  }

  // 手机浏览器会把手势当成"缩放网页""下拉刷新""拖动整页"，这里拦掉；能滚动的几块照常滚
  guardPage() {
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener(
      'touchmove',
      (e) => {
        if (!e.target.closest || !e.target.closest('#wishes, #tool-list, #settings, #feedback, #credits, #backup')) e.preventDefault();
      },
      { passive: false },
    );
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
    $('#ico-lang').innerHTML = ICON.globe;
    $('#ico-theme').innerHTML = ICON.moon;
    $('#ico-hand').innerHTML = ICON.hand;
    // 左手还是右手：只在手机版式里出现。按钮上的字在 applyLang 里填
    const hands = $('#hand-seg');
    hands.innerHTML = HANDS.map((x) => `<button data-hand="${x}"></button>`).join('');
    hands.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.h.clickSound();
      this.h.setHand(b.dataset.hand);
    });
    // 设置开着的时候，点它以外的地方就关掉
    $('#shade').addEventListener('click', () => (panel.hidden = true));
    this.themeMeta = document.querySelector('meta[name="theme-color"]');
    // 界面明暗：跟着游戏里的昼夜，或者固定浅色、深色。选项在 applyLang 里填
    $('#theme').addEventListener('change', (e) => {
      this.h.clickSound();
      this.h.setTheme(e.target.value);
    });
    // 弹窗后面的暗幕：点一下就把弹窗关掉
    $('#scrim').addEventListener('click', () => {
      $('#feedback').hidden = true;
      $('#credits').hidden = true;
      $('#backup').hidden = true;
      this.setFeedbackMsg('');
    });
    $('#btn-next').innerHTML = ICON.next;
    // 曲目：随机轮播、指定一首单曲循环，或者换回合成音乐。选项在 applyLang 里填
    $('#track').addEventListener('change', (e) => {
      this.h.clickSound();
      this.h.setTrack(e.target.value);
    });
    $('#btn-next').addEventListener('click', () => this.h.nextTrack());
    this.nowTrack = null;
    this.nowResting = false;
    // 语言：设置里一个选单，开始画面上再放一排按钮，第一次打开就能换
    $('#lang').innerHTML = LANGS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
    $('#lang').addEventListener('change', (e) => this.h.setLang(e.target.value));
    const langs = $('#start-langs');
    langs.innerHTML = LANGS.map((l) => `<button data-lang="${l.id}">${l.name}</button>`).join('');
    langs.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.h.setLang(b.dataset.lang);
    });
    const seg = $('#fps-seg');
    seg.innerHTML = FPS_CHOICES.map((f) => `<button data-fps="${f}">${f}</button>`).join('');
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.h.clickSound();
      this.h.setFps(+b.dataset.fps);
    });
    $('#show-fps').addEventListener('change', (e) => this.h.setShowFps(e.target.checked));
    // 画质，以及测试地址上才有的换季节、换天气。按钮上的字在 applyLang 里填
    $('#ico-quality').innerHTML = ICON.layers;
    $('#ico-season').innerHTML = ICON.leaf;
    $('#ico-wx').innerHTML = ICON.cloud;
    const segOf = (id, values, pick) => {
      const el = $(id);
      el.innerHTML = values.map((v) => `<button data-v="${v}"></button>`).join('');
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.h.clickSound();
        pick(b.dataset.v);
      });
    };
    segOf('#quality-seg', QUALITY_MODES, (v) => this.h.setQuality(v));
    segOf('#season-seg', [0, 1, 2, 3], (v) => this.h.setSeason(+v));
    segOf('#wx-seg', ['auto', 'clear', 'wet'], (v) => this.h.setWx(v));
    this.fpsEl = $('#fps');
    this.fpsCap = 144;
    this.hz = 0;
    this.fpsNote = '';
    const reset = (this.resetBtn = $('#btn-reset'));
    let armed = 0;
    reset.addEventListener('click', () => {
      if (Date.now() < armed) {
        reset.textContent = t('set.reset');
        reset.classList.remove('confirm');
        armed = 0;
        panel.hidden = true;
        this.h.reset();
      } else {
        armed = Date.now() + 3000;
        reset.textContent = t('set.resetConfirm');
        reset.classList.add('confirm');
        setTimeout(() => {
          if (Date.now() >= armed) {
            reset.textContent = t('set.reset');
            reset.classList.remove('confirm');
          }
        }, 3100);
      }
    });
    this.buildFeedback(panel);
    this.buildCredits(panel);
    this.buildBackup(panel);
    this.clockIcon = $('#clock-icon');
    this.clockText = $('#clock-text');
    this.dial = $('#dial');
    this.skySun = $('#sky-sun');
    this.skyMoon = $('#sky-moon');
    this.prosper = $('#prosper');
    this.prLv = $('#pr-lv');
    this.prFill = $('#pr-fill');
    this.prNum = $('#pr-num');
    this.prNumS = $('#pr-num-s'); // 手机上地方小，只写数字
    this.prDelta = $('#pr-delta');
    this.prNext = $('#pr-next');
  }

  setVolumes(music, sfx) {
    $('#vol-music').value = Math.round(music * 100);
    $('#vol-sfx').value = Math.round(sfx * 100);
  }

  // 背景音乐选了哪种放法
  setTrack(mode) {
    $('#track').value = mode;
    $('#btn-next').disabled = mode === 'synth';
  }

  // 设置里的一行小字：现在放的是哪一首。resting：两首之间的空当
  setNowPlaying(track, resting) {
    this.nowTrack = track;
    this.nowResting = resting;
    const el = $('#now-playing');
    el.textContent = track ? t('music.now', track.title, track.by) : resting ? t('music.rest') : '';
    el.hidden = !el.textContent;
  }

  // 界面明暗选了哪种。quick：玩家刚在设置里换的，很快换过去，不用等几秒
  setThemeMode(mode, quick = false) {
    this.themeMode = THEMES.includes(mode) ? mode : 'auto';
    this.themeQuick = quick;
    $('#theme').value = this.themeMode;
  }

  // 每帧调用。night：场景现在有多暗（0 白天，1 深夜）。
  // 天黑过半以后界面在几秒钟里从浅色换成深色，天亮时再换回来；不是一直跟着天色变，
  // 因为底色和字的颜色换到一半的时候最难认，那一段要尽快过去
  updateTheme(night, dt) {
    const goal = this.themeMode === 'dark' ? 1 : this.themeMode === 'light' ? 0 : night > 0.5 ? 1 : 0;
    if (this.themeAt === goal) return;
    const step = Math.min(dt, 0.1) / (this.themeQuick ? THEME_QUICK : THEME_FADE);
    if (this.themeAt === null) this.themeAt = goal;
    else this.themeAt = goal > this.themeAt ? Math.min(goal, this.themeAt + step) : Math.max(goal, this.themeAt - step);
    const a = this.themeAt;
    if (a === goal) this.themeQuick = false;
    const k = ease(a);
    const ink = ease((a - 0.44) / 0.12);
    // 颜色几乎没变的那几帧不去动样式
    if (a !== goal && Math.abs(k - this.themeK) < 0.003 && Math.abs(ink - this.themeInk) < 0.003) return;
    this.themeK = k;
    this.themeInk = ink;
    const root = document.documentElement;
    for (const [name, day, dark, isInk] of THEME) {
      const f = isInk ? ink : k;
      const v = day.map((d, i) => (i < 3 ? Math.round(d + (dark[i] - d) * f) : +(d + (dark[i] - d) * f).toFixed(3)));
      root.style.setProperty(name, name.endsWith('-rgb') ? v.join(', ') : `${v.length > 3 ? 'rgba' : 'rgb'}(${v.join(', ')})`);
    }
    // 滑杆、选单这些浏览器自带的控件也跟着换
    root.style.colorScheme = a > 0.5 ? 'dark' : 'light';
  }

  // 浏览器自己的边栏（手机底部的导航条、顶上的状态栏）和网页的底色跟着海面的颜色走，
  // 不然到了晚上，深色的小岛下面会露出一条白天的浅蓝
  setChrome(hex) {
    if (hex === this.chrome) return;
    this.chrome = hex;
    if (this.themeMeta) this.themeMeta.content = hex;
    document.documentElement.style.backgroundColor = hex;
    document.body.style.backgroundColor = hex;
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
    // 不少手机闲下来会自己把刷新降到 60，手指一碰又升回去；提示按见过的最高值算，不跟着来回变
    this.hzPeak = Math.max(this.hzPeak, hz);
    this.hz = this.hzPeak;
    if (!this.fpsEl.hidden) this.fpsEl.textContent = t('perf.fps', fps) + (scale < 1 ? `\n${t('perf.scale', Math.round(scale * 100))}` : '');
    this.refreshFpsNote();
  }

  refreshFpsNote() {
    const text = this.hz && this.fpsCap > this.hz * 1.03 ? t('set.fpsNote', this.hz) : '';
    if (text === this.fpsNote) return;
    this.fpsNote = text;
    const note = $('#fps-note');
    note.textContent = text;
    note.hidden = !text;
  }

  setClock(time, isDay) {
    const hours = (6 + time * 24) % 24;
    const hh = Math.floor(hours);
    const mm = Math.floor(((hours - hh) * 60) / 10) * 10;
    const text = t('clock', hh, String(mm).padStart(2, '0'));
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
    const sun = (isDay ? 'd' : 'n') + sunTheta.toFixed(3);
    if (sun === this.lastSun) return;
    this.lastSun = sun;
    // 太阳骑在罗盘外圈上：东边升起，经过南边，西边落下；夜里换成月亮，标的是月光照过来的方向。
    // 只挪当前亮着的那一个，另一个留在原地慢慢淡掉
    (isDay ? this.skySun : this.skyMoon).style.setProperty('--a', `${(Math.PI / 2 + sunTheta).toFixed(3)}rad`);
    this.skySun.classList.toggle('on', isDay);
    this.skyMoon.classList.toggle('on', !isDay);
  }

  // 繁荣度。p：现在的繁荣度；level：等级（从 0 起）；from、to：这一级的起点和升下一级要的数；
  // next：下一级会带来什么；没有下一级时 to 为 null
  setProsperity({ p, level, from, to, next }) {
    this.prLv.textContent = t('pr.level', level + 1);
    if (to === null) {
      this.prNum.textContent = t('pr.num', p, null);
      this.prNumS.textContent = `${p}`;
      this.prFill.style.width = '100%';
      this.prNext.textContent = t('pr.done');
    } else {
      this.prNum.textContent = t('pr.num', p, to);
      this.prNumS.textContent = `${p} / ${to}`;
      this.prFill.style.width = `${Math.max(0, Math.min(1, (p - from) / (to - from))) * 100}%`;
      this.prNext.innerHTML = `<b>${t('pr.to', to)}</b>${next.map((line) => `<span>${line}</span>`).join('')}`;
    }
    if (this.lastP !== undefined && p > this.lastP) {
      this.prosper.classList.remove('bump');
      void this.prosper.offsetWidth;
      this.prosper.classList.add('bump');
    }
    this.lastP = p;
  }

  // 放下之后：繁荣度变了多少，在数字旁边弹一下，过一会儿自己消失
  popProsper(delta) {
    const el = this.prDelta;
    el.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
    el.className = `pr-delta ${delta > 0 ? 'up' : 'down'}`;
    void el.offsetWidth; // 连着弹两次时，动画从头再来
    el.classList.add('pop');
    clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => {
      el.textContent = '';
      el.className = 'pr-delta';
    }, 1900);
  }

  // 升级提示：盖在画面中间，几秒后自己消失
  levelUp(level, p, lines, final) {
    const box = $('#levelup');
    box.innerHTML =
      `<div class="lu-card"><div class="lu-kicker">${t('lu.kicker', p)}</div><h2>${final ? t('lu.final') : t('lu.title', level + 1)}</h2>` +
      `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul></div>`;
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
    el.addEventListener('click', () => {
      this.h.focusResident(spec.id);
      this.openWish(this.openWishId === spec.id ? null : spec.id);
    });
    // 单手版式里那行"居民数"不在这个盒子里
    if (this.arrival.parentNode === this.wishBox) this.wishBox.insertBefore(el, this.arrival);
    else this.wishBox.appendChild(el);
    this.wishEls.set(spec.id, { el, spec, mood: -1, tier: 0, bonus: false });
    const b = document.createElement('div');
    b.className = 'bubble';
    $('#bubbles').appendChild(b);
    this.bubbleEls.set(spec.id, { el: b, text: '', shown: '', spec });
    if (animate) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  clearResidents() {
    for (const w of this.wishEls.values()) w.el.remove();
    for (const b of this.bubbleEls.values()) b.el.remove();
    this.wishEls.clear();
    this.bubbleEls.clear();
    this.openWish(null);
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
      el.querySelector('.tier').textContent = t('tier', r.tier);
      el.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < 3 ? i < r.tier : w.bonus));
      el.querySelector('.wish-need').innerHTML = r.need.map((n) => `<span>${n}</span>`).join('');
      el.classList.toggle('has-bonus', !!r.bonus);
      el.classList.toggle('bonus-done', w.bonus);
      el.querySelector('.wish-bonus').innerHTML = r.bonus ? `<em>${t(w.bonus ? 'wish.bonusDone' : 'wish.bonus')}</em>${r.bonus.text}` : '';
      this.setMood(w, r.tier);
    }
    this.renderWishDetail();
  }

  // 居民数，以及还有没有新居民要来。电脑版式里那句说明收起来了，光标指上去才浮现（和繁荣度一样用浏览器自带的提示）
  setArrival(state, n, max) {
    this.lastArrival = [state, n, max];
    this.arrival.className = `arrival show ${state}`;
    this.arrival.innerHTML = `<b>${t('arrival.count', n, max)}</b><span>${t(`arrival.${state}`)}</span>`;
    this.arrival.title = t(`arrival.${state}`);
  }

  setMood(w, mood) {
    if (w.mood === mood) return;
    w.mood = mood;
    w.el.querySelector('.avatar').innerHTML = avatar(w.spec.id, w.spec.look, mood);
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
        tag.textContent = t(delta > 0 ? 'preview.up' : 'preview.down', t('tier', p.tier));
        this.setMood(w, delta < 0 ? 4 : p.tier);
      } else if (bonus) {
        tag.textContent = t(bonus > 0 ? 'preview.bonusUp' : 'preview.bonusDown');
        this.setMood(w, bonus < 0 ? 4 : 3);
      } else {
        this.setMood(w, w.tier);
      }
    }
    if (this.openWishId) this.renderWishDetail();
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
        b.text = b.shown = '';
        b.el.classList.remove('show');
      }
      return;
    }
    // shown：气泡里现在写着的那句。换了语言会被清掉，名字就按新语言重写
    if (b.shown !== text) {
      b.text = b.shown = text;
      b.el.innerHTML = `<b>${b.spec.name}</b>${text}`;
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

  // ---------- 反馈与建议 ----------

  buildFeedback(settingsPanel) {
    const box = $('#feedback');
    const text = $('#fb-text');
    const contact = $('#fb-contact');
    const send = $('#fb-send');
    const kinds = $('#fb-kind');
    this.fbMsg = $('#fb-msg');
    let kind = ''; // 一开始哪类都不选：要玩家自己点一下，寄来的信标题里的分类才可信
    let busy = false;
    text.maxLength = MAX_LEN;
    kinds.innerHTML = KINDS.map((k) => `<button data-kind="${k}"></button>`).join('');
    const pick = (k) => {
      kind = k;
      for (const b of kinds.children) b.classList.toggle('on', b.dataset.kind === k);
      kinds.classList.remove('ask');
    };
    kinds.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.h.clickSound();
      pick(b.dataset.kind);
      this.setFeedbackMsg('');
      text.focus();
    });
    const close = () => {
      box.hidden = true;
      this.setFeedbackMsg('');
    };
    // 没配收件钥匙的版本不出现入口
    const open = $('#btn-feedback');
    open.hidden = !feedbackOn();
    open.addEventListener('click', () => {
      this.h.clickSound();
      settingsPanel.hidden = true;
      $('#credits').hidden = true;
      box.hidden = false;
      if (kind) text.focus();
    });
    $('#fb-cancel').addEventListener('click', close);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    text.addEventListener('input', () => this.setFeedbackMsg(''));
    send.addEventListener('click', async () => {
      if (busy) return;
      if (!kind) {
        kinds.classList.add('ask');
        return this.setFeedbackMsg('fb.pick', true);
      }
      const body = text.value.trim();
      if (body.length < MIN_LEN) return this.setFeedbackMsg('fb.short', true);
      if (cooling()) return this.setFeedbackMsg('fb.wait', true);
      busy = true;
      send.disabled = true;
      this.setFeedbackMsg('fb.sending');
      const ok = await this.h.sendFeedback({ kind, text: body, contact: contact.value.trim() });
      busy = false;
      send.disabled = false;
      if (ok) {
        text.value = '';
        pick('');
        close();
        this.toast(t('fb.sent'), 2.6);
      } else this.setFeedbackMsg('fb.fail', true);
    });
  }

  // 面板底下那行小字。记的是文字的键，换语言时能跟着换
  setFeedbackMsg(key, bad = false) {
    if (!this.fbMsg) return;
    if (key !== undefined) this.fbMsgKey = [key, bad];
    const [k, isBad] = this.fbMsgKey || ['', false];
    this.fbMsg.textContent = k ? t(k) : '';
    this.fbMsg.classList.toggle('bad', isBad);
  }

  // ---------- 存档备份 ----------

  // 导出：把小岛写成一段文字让玩家自己收好；导入：贴回这段文字，先看一眼里面是什么，再按一次才真的换掉
  buildBackup(settingsPanel) {
    const box = $('#backup');
    const text = $('#bk-text');
    const go = $('#bk-go');
    const modes = $('#bk-mode');
    const msg = $('#bk-msg');
    let mode = 'out';
    let ready = null; // 已经检查通过、等玩家再按一次确认的那段文字
    const say = (s, bad = false) => {
      msg.textContent = s;
      msg.classList.toggle('bad', bad);
    };
    const setMode = (m) => {
      mode = m;
      ready = null;
      for (const b of modes.children) b.classList.toggle('on', b.dataset.mode === m);
      text.readOnly = m === 'out';
      text.value = m === 'out' ? this.h.exportSave() : '';
      text.placeholder = m === 'in' ? t('bk.paste') : '';
      text.scrollTop = 0;
      $('#bk-note').textContent = t(m === 'out' ? 'bk.outNote' : 'bk.inNote');
      go.textContent = t(m === 'out' ? 'bk.copy' : 'bk.load');
      say('');
    };
    const close = () => (box.hidden = true);
    const selectAll = () => {
      text.focus();
      text.setSelectionRange(0, text.value.length);
    };
    const copy = async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text.value);
        ok = true;
      } catch (e) {
        // 有些内置浏览器不给用剪贴板接口：退回老办法，选中后让浏览器复制
        try {
          selectAll();
          ok = document.execCommand('copy');
        } catch (e2) {
          /* 两种都不行，就请玩家自己长按复制 */
        }
      }
      if (!ok) selectAll();
      say(t(ok ? 'bk.copied' : 'bk.copyFail'), !ok);
    };
    $('#btn-backup').addEventListener('click', () => {
      this.h.clickSound();
      settingsPanel.hidden = true;
      $('#feedback').hidden = true;
      $('#credits').hidden = true;
      setMode('out');
      box.hidden = false;
    });
    modes.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.mode === mode) return;
      this.h.clickSound();
      setMode(b.dataset.mode);
      if (mode === 'in') text.focus();
    });
    // 导出时点一下文字就整段选中，手动复制也方便
    text.addEventListener('click', () => {
      if (mode === 'out') selectAll();
    });
    text.addEventListener('input', () => {
      if (mode !== 'in') return;
      ready = null;
      go.textContent = t('bk.load');
      say('');
    });
    go.addEventListener('click', () => {
      this.h.clickSound();
      if (mode === 'out') return copy();
      const code = text.value;
      if (!code.trim()) return say(t('bk.empty'), true);
      if (ready === code) {
        if (!this.h.applyImport(code)) say(t('bk.fail'), true);
        return;
      }
      const res = this.h.checkImport(code);
      if (!res.ok) return say(t(res.why), true);
      ready = code;
      say(t('bk.found', res.level, res.people));
      go.textContent = t('bk.replace');
    });
    $('#bk-close').addEventListener('click', close);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  // ---------- 制作与鸣谢 ----------

  buildCredits(settingsPanel) {
    const box = $('#credits');
    const close = () => (box.hidden = true);
    $('#btn-credits').addEventListener('click', () => {
      this.h.clickSound();
      settingsPanel.hidden = true;
      $('#feedback').hidden = true;
      box.hidden = false;
      $('#cr-close').focus();
    });
    $('#cr-close').addEventListener('click', close);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  // 名单按 music.js 里的曲目现排，换了曲目不用另外改这里
  renderCredits() {
    $('#cr-body').innerHTML =
      `<h4>${t('cr.by')}</h4><p>${AUTHOR}</p><h4>${t('cr.music')}</h4><ul class="cr-list">` +
      TRACKS.map((k) => `<li><a href="${k.url}" target="_blank" rel="noopener">${k.title}</a><span>${k.by}</span></li>`).join('') +
      `</ul><p class="s-note">${t('cr.musicNote')}</p><h4>${t('cr.tech')}</h4><p>${t('cr.techNote')}</p><p>${t('cr.thanks')}</p>`;
    $('#cr-ver').textContent = t('cr.version', VERSION);
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
    // 触屏的说法不一样；其中"居民在哪"那一步只有手机版式才换
    const tutSteps = () => {
      if (!this.touch) return t('tut');
      if (this.dock) return t('tut.dock');
      return t('tut.touch').map((s, k) => (k === 3 && !this.phone.matches ? t('tut')[3] : s));
    };
    let i = from < 0 ? t('tut').length + from : from;
    const done = () => {
      box.hidden = true;
      this.tutRender = null;
      if (onDone) onDone();
    };
    const render = () => {
      const steps = tutSteps();
      const [title, text] = steps[i];
      const last = i === steps.length - 1;
      box.innerHTML =
        `<h3>${title}</h3><p>${text}</p><div class="tut-foot"><span class="dots">` +
        (from ? '' : steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')) +
        `</span>${last ? '' : `<button class="tut-skip">${t('tut.skip')}</button>`}<button class="tut-next">${t(last ? 'tut.go' : 'tut.next')}</button></div>`;
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
    this.tutRender = render; // 说明开着的时候换语言，要重画这一步
    render();
  }
}
