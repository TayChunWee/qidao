// 界面层：全部是叠在画布上的普通网页元素。
import { MODULES, TABS, VERSION, AUTHOR } from './config.js';
import { LEVELS, unlockLevel } from './progression.js';
import { FPS_CHOICES } from './perf.js';
import { TRACKS } from './music.js';
import { t, nameOf, LANGS, getLang } from './i18n.js';
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
  gauge: svg('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  move: svg('<rect x="3.5" y="3.5" width="11" height="11" rx="2" stroke-dasharray="3 2.6"/><path d="M12.5 12.5 20 20M20 14.5V20h-5.5"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  next: svg('<path d="M6 5.5 15 12l-9 6.5z"/><path d="M18.5 5.5v13"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c-5 5-5 13 0 18c5-5 5-13 0-18"/>'),
};

// 四档心情 + 难过，对应嘴巴的形状
const MOUTH = ['M15 26h10', 'M14 25q6 4 12 0', 'M13 24q7 8 14 0', 'M12 23q8 12 16 0z', 'M14 28q6-5 12 0'];
const face = (mood) =>
  `<svg viewBox="0 0 40 40"><circle cx="14" cy="17" r="2.3" fill="#4a3a32"/><circle cx="26" cy="17" r="2.3" fill="#4a3a32"/>` +
  (mood === 3 ? '<circle cx="9" cy="23" r="3" fill="#fff" opacity=".35"/><circle cx="31" cy="23" r="3" fill="#fff" opacity=".35"/>' : '') +
  `<path d="${MOUTH[mood]}" fill="${mood === 3 ? '#4a3a32' : 'none'}" stroke="#4a3a32" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
    this.toolNames = new Map(); // 工具栏每个按钮的名字（换语言时要重新取）
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

    const bar = $('#toolbar');
    for (const m of MODULES) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.innerHTML =
        `<span class="key">${m.key}</span><img alt="" draggable="false"><span class="name"></span>` +
        `<span class="need">${ICON.lock}<em>${LEVELS[unlockLevel(m.id)].need}</em></span>`;
      b.addEventListener('click', () => this.h.selectTool(m.id));
      const name = () => nameOf(m.id);
      this.bindTip(b, name, () => (this.unlocked.has(m.id) ? t(`desc.${m.id}`) : t('tool.locked', LEVELS[unlockLevel(m.id)].need)));
      bar.appendChild(b);
      this.toolEls.set(m.id, b);
      this.toolNames.set(m.id, name);
    }
    const sep = document.createElement('span');
    sep.className = 'tb-sep';
    bar.appendChild(sep);
    const act = (id, icon, key, fn) => {
      const b = document.createElement('button');
      b.className = 'tool act';
      b.dataset.id = id;
      b.innerHTML = `<span class="key">${key}</span><span class="glyph">${icon}</span><span class="name"></span>`;
      b.addEventListener('click', fn);
      const name = () => t(`act.${id}`);
      this.bindTip(b, name, () => t(`act.${id}.desc`));
      bar.appendChild(b);
      this.toolEls.set(id, b);
      this.toolNames.set(id, name);
      return b;
    };
    act('move', ICON.move, 'M', () => this.h.selectTool('move'));
    act('remove', ICON.remove, 'X', () => this.h.selectTool('remove'));
    this.undoBtn = act('undo', ICON.undo, 'Z', () => this.h.undo());
    this.redoBtn = act('redo', ICON.redo, 'Y', () => this.h.redo());
    this.setTab(this.tab);
  }

  // title、desc 都是函数：提示出现的那一刻才按当前语言取文字
  bindTip(el, title, desc) {
    el.addEventListener('pointerenter', () => {
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
    $('#ico-lang').innerHTML = ICON.globe;
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
    this.prLv.textContent = t('pr.level', level + 1);
    if (to === null) {
      this.prNum.textContent = t('pr.num', p, null);
      this.prFill.style.width = '100%';
      this.prNext.textContent = t('pr.done');
    } else {
      this.prNum.textContent = t('pr.num', p, to);
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

  // 摆放前的预览：这一步会让繁荣度变多少
  setProsperPreview(delta) {
    this.prDelta.textContent = delta ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : '';
    this.prDelta.className = `pr-delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`;
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
    el.addEventListener('click', () => this.h.focusResident(spec.id));
    this.wishBox.insertBefore(el, this.arrival);
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
  }

  // 列表底部的一行小字：还有没有新居民要来
  setArrival(state, n, max) {
    this.lastArrival = [state, n, max];
    this.arrival.className = `arrival show ${state}`;
    this.arrival.innerHTML = `<b>${t('arrival.count', n, max)}</b><span>${t(`arrival.${state}`)}</span>`;
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
        tag.textContent = t(delta > 0 ? 'preview.up' : 'preview.down', t('tier', p.tier));
        this.setMood(w, delta < 0 ? 4 : p.tier);
      } else if (bonus) {
        tag.textContent = t(bonus > 0 ? 'preview.bonusUp' : 'preview.bonusDown');
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
    let i = from < 0 ? t('tut').length + from : from;
    const done = () => {
      box.hidden = true;
      this.tutRender = null;
      if (onDone) onDone();
    };
    const render = () => {
      const steps = t('tut');
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
