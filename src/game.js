// 把逻辑、画面、声音和界面接在一起：工具、输入、撤销、存档、居民到来、愿望变化、小岛升级。
import { FPS_CHOICES } from './perf.js';
import { World, SOLIDS, SOLO, START_CENTER } from './world.js';
import { evaluateAll, canHouse, eligibleIds, makeBonus, bonusConflicts, ARCHETYPES, FIRST_RESIDENTS } from './wishes.js';
import { MODULES, TABS, H, DAY_LENGTH, SIZE, VERSION } from './config.js';
import { t, nameOf, descOf, getLang, setLang } from './i18n.js';
import { LEVELS, MAX_LV, prosperityOf, levelFor, stageFor, unlockedAt, unlockLevel, rewardsOf } from './progression.js';
import { thumbParts } from './viewmodel.js';
import { Resident, arrivalCell, walkable } from './residents.js';
import { UI } from './ui.js';
import { TRACKS } from './music.js';
import { sendFeedback } from './feedback.js';

const SAVE_KEY = 'qidao-save-v2';
const TAP_SLOP = 10; // 触屏上手指挪动不超过这么多像素，还算"点了一下"
const SETTINGS_KEY = 'qidao-settings-v1';
const MOD = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const ARRIVE_DELAY = 8; // 所有人都住下之后，过多少秒来下一位
const IDEA_DELAY = 45; // 居民住得满意多少秒之后，会冒出一个新想法
const IDEA_GAP = 20; // 两个新想法之间至少隔多少秒
// 把一个矩形和里面的点顺时针转 90°（取整的规矩和 world.rotatePairs 一样，连转四次回到原处）
const rotateRect = (r, pts, flip) => {
  const w = r.x1 - r.x0 + 1;
  const d = r.z1 - r.z0 + 1;
  const round = flip ? Math.floor : Math.ceil;
  const nx0 = round(r.x0 + (w - d) / 2);
  const nz0 = round(r.z0 + (d - w) / 2);
  return {
    rect: { x0: nx0, z0: nz0, x1: nx0 + d - 1, z1: nz0 + w - 1 },
    pts: pts.map((p) => ({ x: nx0 + (d - 1 - (p.z - r.z0)), z: nz0 + (p.x - r.x0) })),
  };
};
const FIRST_SPOTS = [
  { x: 8, z: 8 },
  { x: 9, z: 9 },
];

export class Game {
  constructor(view, audio, pacer) {
    this.view = view;
    this.audio = audio;
    this.pacer = pacer;
    this.tool = null;
    this.tab = TABS[0].id;
    this.rot = 2;
    this.rotOverride = false;
    this.undoStack = [];
    this.redoStack = [];
    this.t = 0.1;
    this.started = false;
    this.tiers = {};
    this.bonusDone = {};
    this.hover = null;
    this.hoverKey = '';
    this.pickKey = '';
    this.mouse = null;
    this.drag = null;
    this.painting = false;
    this.strokePushed = false;
    this.clockTimer = 0;
    // 搬动工具：sel 是圈住的矩形，selDrag 是正在进行的拖动（圈选或搬运）
    this.sel = null;
    this.selDrag = null;
    this.selTipShown = false;

    // 居民：roster 是逻辑上的名单（按到来先后），residents 是对应的小人
    this.roster = [];
    this.residents = [];
    this.arriveTimer = ARRIVE_DELAY;
    this.arriveList = null; // 正在挨个试的候选居民
    this.arrivalKey = '';
    this.noRoom = false;
    this.worldVer = 0;
    this.ideaTick = 1;
    this.ideaCooldown = IDEA_GAP;

    // 小岛的成长
    this.level = 0;
    this.prosperity = 0;
    this.done = false;

    // track：背景音乐的放法（'shuffle' 随机轮播、某一首的 id、'synth' 合成音乐）；lang：没选过语言时是 null，跟着浏览器走
    this.settings = { music: 0.7, sfx: 0.8, track: 'shuffle', lang: null, fps: 144, showFps: false, theme: 'auto', hand: 'right', tutorialDone: false, growthTipDone: false };
    try {
      Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      /* 读不到设置就用默认值 */
    }
    // 语言要在搭界面之前定下来
    setLang(this.settings.lang || getLang());
    audio.musicVol = this.settings.music;
    audio.sfxVol = this.settings.sfx;
    if (!['shuffle', 'synth'].includes(this.settings.track) && !TRACKS.some((k) => k.id === this.settings.track)) this.settings.track = 'shuffle';
    audio.trackMode = this.settings.track;
    audio.music.onChange = (track) => this.ui.setNowPlaying(track, !track && this.audio.trackMode !== 'synth' && !this.audio.synthOn);
    if (!FPS_CHOICES.includes(this.settings.fps)) this.settings.fps = 144;

    this.ui = new UI({
      start: () => this.start(),
      selectTool: (id) => this.selectTool(id, true),
      setTab: (id) => this.setTab(id, true),
      undo: () => this.undo(),
      redo: () => this.redo(),
      rotateCam: (d) => {
        this.view.rotateCam(d);
        this.audio.rotate();
      },
      setMusic: (v) => {
        this.audio.setMusic(v);
        this.settings.music = v;
        this.saveSettings();
      },
      setSfx: (v) => {
        this.audio.setSfx(v);
        this.settings.sfx = v;
        this.saveSettings();
      },
      setTrack: (mode) => this.setTrack(mode),
      nextTrack: () => {
        this.audio.click();
        this.setTrack(this.audio.nextTrack(), true);
      },
      setLang: (id) => {
        this.settings.lang = setLang(id);
        this.saveSettings();
        this.applyLang();
      },
      setFps: (v) => {
        this.settings.fps = v;
        this.pacer.setCap(v);
        this.ui.setFpsChoice(v, this.settings.showFps);
        this.saveSettings();
      },
      setShowFps: (on) => {
        this.settings.showFps = on;
        this.ui.setFpsChoice(this.settings.fps, on);
        this.saveSettings();
      },
      setHand: (hand) => {
        this.settings.hand = hand;
        this.ui.setHand(hand);
        this.saveSettings();
      },
      setTheme: (mode) => {
        this.settings.theme = mode;
        this.ui.setThemeMode(mode, true);
        this.saveSettings();
      },
      reset: () => this.reset(),
      rotate: () => this.rotate(),
      aimConfirm: () => (this.tool === 'move' ? this.confirmMove() : this.confirmAim()),
      aimCancel: () => this.cancelAim(),
      sendFeedback: (data) => sendFeedback({ ...data, info: this.feedbackInfo() }),
      focusResident: (id) => this.focusResident(id),
      hoverSound: () => this.audio.hover(),
      clickSound: () => this.audio.click(),
    });
    this.ui.setVolumes(this.settings.music, this.settings.sfx);
    this.ui.setTrack(this.settings.track);
    this.ui.setFpsChoice(this.settings.fps, this.settings.showFps);
    this.ui.setThemeMode(this.settings.theme);
    this.ui.setHand(this.settings.hand);
    pacer.onStats = (s) => this.ui.setPerf(s);
    pacer.setCap(this.settings.fps);

    const save = this.loadSave();
    if (!save) {
      this.world = new World(0);
      this.world.seedStart();
    }
    const saved = save ? save.roster.filter((r) => ARCHETYPES[r.id]) : [];
    const list = saved.length ? saved : FIRST_RESIDENTS.map((id) => ({ id }));
    list.forEach((r, i) => this.addResident(r.id, FIRST_SPOTS[i], false, r));
    // 存档里如果有和愿望互相打架的新想法，去掉，让这位居民过一会儿换一个
    for (const r of this.roster) {
      if (bonusConflicts(this.roster, r)) {
        r.bonus = null;
        r.happy = IDEA_DELAY - 10;
      }
    }

    this.results = this.evaluate();
    this.adoptResults();
    this.prosperity = prosperityOf(this.results);
    this.unlocked = unlockedAt(this.level);
    this.view.setWorld(this.world);
    this.view.sync(this.world, this.ctx(), 'init');
    this.ui.setThumbs(this.view.makeThumbs(Object.fromEntries(MODULES.map((m) => [m.id, thumbParts(m.id)]))));
    this.ui.setUnlocked(this.unlocked);
    this.ui.setWishes(this.results);
    this.refreshProsperity();
    this.ui.setTool(null);
    this.ui.setUndoState(false, false);
    // 触屏：手指和鼠标的操作方式不一样。先按设备猜一个，之后以玩家实际用的为准
    this.touch = false;
    this.pointers = new Map(); // 屏幕上的每根手指：pointerId → { x, y }
    this.aim = null; // 触屏上点了一下、还没确认放下的那个位置
    this.bindInput();
    this.setTouch(!!window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }

  // ---------- 开始、存档 ----------

  start() {
    if (this.started) return;
    this.started = true;
    this.pacer.active = true;
    this.audio.init();
    this.audio.setIntensity(this.world.count());
    this.audio.click();
    this.ui.hideStart();
    // 手机上居民的愿望收在头像里：开局先替玩家点开一位还没安顿好的
    const needy = this.results.find((r) => r.tier < 2);
    if (needy) this.ui.openWish(needy.id);
    this.refreshAim();
    // 第一次玩看完整的说明；玩过旧版本的只补看"让小岛长大"那一步
    if (!this.settings.tutorialDone || !this.settings.growthTipDone) {
      const from = this.settings.tutorialDone ? -1 : 0;
      setTimeout(
        () =>
          this.ui.showTutorial(() => {
            this.settings.tutorialDone = true;
            this.settings.growthTipDone = true;
            this.saveSettings();
          }, from),
        900,
      );
    }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.roster)) return null;
      const level = Math.min(MAX_LV, Math.max(0, data.level | 0));
      const world = new World(stageFor(level));
      world.load(data.world);
      this.world = world;
      this.level = level;
      this.done = !!data.done;
      if (typeof data.t === 'number') this.t = data.t;
      return data;
    } catch (e) {
      return null;
    }
  }

  save() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          v: 3,
          world: this.world.serialize(),
          level: this.level,
          t: this.t,
          roster: this.roster.map((r) => ({ id: r.spec.id, bonus: r.bonus, happy: r.happy })),
          done: this.done,
        }),
      );
    } catch (e) {
      /* 存不了也不影响游玩 */
    }
  }

  queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 400);
  }

  // 随反馈一起寄出的几行情况：玩家说"卡""放不了"的时候，不用再回头问他用的什么浏览器、玩到哪了
  feedbackInfo() {
    return [
      `版本 ${VERSION}，语言 ${getLang()}`,
      `小岛 ${this.level + 1} 级，繁荣度 ${this.prosperity}，建造规模 ${this.world.count()}`,
      `帧率上限 ${this.settings.fps}，音乐 ${this.settings.track}，界面 ${this.settings.theme}，${this.ui.dock ? `单手版式 ${this.settings.hand}` : '非单手版式'}`,
      `窗口 ${window.innerWidth}×${window.innerHeight}（像素比 ${window.devicePixelRatio}）`,
      navigator.userAgent,
    ].join('\n');
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      /* 同上 */
    }
  }

  // 换背景音乐的放法。already：声音那边已经换好了（按"下一首"时），这里只需要记下来
  setTrack(mode, already = false) {
    if (!already) this.audio.setTrack(mode);
    this.settings.track = this.audio.trackMode;
    this.ui.setTrack(this.settings.track);
    this.saveSettings();
  }

  // 换了语言：界面上已经写出来的文字全部重写一遍。居民的评价里带着句子，所以重新算一次
  applyLang() {
    this.ui.applyLang();
    this.clockTimer = 0;
    this.results = this.evaluate();
    this.ui.setWishes(this.results);
    this.refreshProsperity();
    this.refreshHover();
  }

  reset() {
    this.clearSelection();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.world = new World(0);
    this.world.seedStart();
    for (const r of this.residents) r.dispose();
    this.ui.clearResidents();
    this.roster = [];
    this.residents = [];
    this.tiers = {};
    this.bonusDone = {};
    this.level = 0;
    this.done = false;
    this.unlocked = unlockedAt(0);
    this.arriveTimer = ARRIVE_DELAY;
    this.arriveList = null;
    this.arrivalKey = '';
    this.noRoom = false;
    this.ideaCooldown = IDEA_GAP;
    if (this.tool && MOD[this.tool] && !this.unlocked.has(this.tool)) this.tool = null;
    this.ui.setTool(this.tool);
    this.ui.setUnlocked(this.unlocked);
    this.view.setWorld(this.world);
    FIRST_RESIDENTS.forEach((id, i) => this.addResident(id, FIRST_SPOTS[i], false));
    this.audio.remove();
    this.commit('bulk');
  }

  // ---------- 居民 ----------

  evaluate(world = this.world) {
    return evaluateAll(world, this.roster);
  }

  // 记住每位居民现在住在哪，下次评估时同等条件下不搬家
  adoptResults() {
    this.results.forEach((r, i) => {
      this.roster[i].homeKey = r.key;
      this.tiers[r.id] = r.tier;
      this.bonusDone[r.id] = !!(r.bonus && r.bonus.done);
    });
  }

  // saved：存档里这位居民的新想法和已经满意了多久
  addResident(id, start, announce, saved = null) {
    const spec = ARCHETYPES[id];
    let cell = start && walkable(this.world, start.x, start.z) ? start : null;
    if (!cell && announce) cell = arrivalCell(this.world);
    if (!cell) {
      const free = [];
      for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) if (walkable(this.world, x, z)) free.push({ x, z });
      cell = free.length ? free[Math.floor(Math.random() * free.length)] : { x: Math.floor(START_CENTER.x), z: Math.floor(START_CENTER.z) };
    }
    this.roster.push({ spec, homeKey: null, bonus: (saved && saved.bonus) || null, happy: (saved && saved.happy) || 0 });
    this.residents.push(new Resident(spec, this.view.scene, cell, announce));
    this.ui.addResident(spec, announce);
  }

  // 每帧检查：是不是该来新居民了
  updateArrival(dt) {
    if (!this.started) return;
    const cap = LEVELS[this.level].cap;
    let state;
    if (this.roster.length >= cap) {
      state = cap >= LEVELS[MAX_LV].cap ? 'full' : 'cap';
    } else if (this.results.some((r) => r.tier < 1)) {
      state = 'waiting';
      this.arriveTimer = ARRIVE_DELAY;
      this.arriveList = null;
      this.noRoom = false;
    } else {
      // 上次没找到合适的空地时，等岛上有了变化再试，不必反复重算
      if (this.noRoom && this.noRoomVer !== this.worldVer) {
        this.noRoom = false;
        this.arriveTimer = 3;
      }
      state = this.noRoom ? 'noroom' : 'coming';
      if (!this.noRoom) {
        this.arriveTimer -= dt;
        if (this.arriveTimer <= 0) this.tryArrive();
      }
    }
    const key = `${state}|${this.roster.length}|${cap}`;
    if (key !== this.arrivalKey) {
      this.arrivalKey = key;
      this.ui.setArrival(state, this.roster.length, cap);
    }
  }

  // 候选居民的先后：需要的模块解锁得越晚，越容易先来，这样新模块很快就有人用得上
  arrivalOrder() {
    const pool = eligibleIds(
      this.unlocked,
      this.roster.map((r) => r.spec.id),
    ).map((id) => ({ id, w: 1 + 1.5 * Math.max(0, ...ARCHETYPES[id].needs.map(unlockLevel)) }));
    const out = [];
    while (pool.length) {
      let roll = Math.random() * pool.reduce((s, o) => s + o.w, 0);
      let i = 0;
      while (i < pool.length - 1 && roll > pool[i].w) roll -= pool[i++].w;
      out.push(pool.splice(i, 1)[0].id);
    }
    return out;
  }

  // 每次只试一位候选居民，避免一帧里算太久。只请得来"岛上盖得出住处"的居民。
  tryArrive() {
    if (!this.arriveList) this.arriveList = this.arrivalOrder();
    const id = this.arriveList.shift();
    if (id === undefined) {
      this.arriveList = null;
      this.noRoom = true;
      this.noRoomVer = this.worldVer;
      return;
    }
    if (!canHouse(this.world, this.roster, this.results, ARCHETYPES[id])) return;
    this.arriveList = null;
    this.arriveTimer = ARRIVE_DELAY;
    this.addResident(id, null, true);
    this.commit('arrive');
    const i = this.roster.length - 1;
    const res = this.residents[i];
    this.audio.arrive();
    this.ui.toast(t('toast.arrive', res.def.name), 2.4);
    // 刚上岛先说自己想要什么；如果正好有现成的地方能住，就说住进去的感受
    res.say(this.results[i].tier >= 1 ? this.results[i].text : res.def.ask, 8);
  }

  // 每秒一次：住得满意的居民过一阵会冒出一个新想法
  tickIdeas() {
    if (!this.started || this.level < 1) return;
    this.ideaCooldown -= 1;
    let pick = -1;
    this.roster.forEach((r, i) => {
      r.happy = this.results[i].tier >= 2 ? r.happy + 1 : 0;
      if (pick < 0 && !r.bonus && r.happy >= IDEA_DELAY) pick = i;
    });
    if (pick < 0 || this.ideaCooldown > 0) return;
    const r = this.roster[pick];
    const bonus = makeBonus(this.world, this.roster, this.results, pick, this.unlocked);
    if (!bonus) {
      r.happy = IDEA_DELAY - 30; // 暂时想不出来，过一会儿再说
      return;
    }
    r.bonus = bonus;
    this.ideaCooldown = IDEA_GAP;
    this.commit('idea');
    this.residents[pick].say(this.results[pick].bonus.say, 7);
    this.audio.idea();
    this.ui.celebrate(r.spec.id);
    this.ui.toast(t('toast.idea', r.spec.name), 2.6);
  }

  // ---------- 繁荣度与升级 ----------

  refreshProsperity() {
    const lv = this.level;
    const next = lv < MAX_LV ? LEVELS[lv + 1] : null;
    this.ui.setProsperity({
      p: this.prosperity,
      level: lv,
      from: LEVELS[lv].need,
      to: next ? next.need : null,
      next: next ? rewardsOf(lv + 1) : [],
    });
  }

  // 繁荣度够了就升级：解锁模块、提高居民上限，有的等级还会让小岛长出新陆地
  checkLevel() {
    const p = prosperityOf(this.results);
    this.prosperity = p;
    const target = levelFor(p);
    if (target <= this.level) return;
    const fresh = [];
    const lines = [];
    for (let lv = this.level + 1; lv <= target; lv++) {
      fresh.push(...LEVELS[lv].unlock);
      lines.push(...rewardsOf(lv));
    }
    this.level = target;
    this.unlocked = unlockedAt(target);
    this.ui.setUnlocked(this.unlocked, fresh);
    this.arriveList = null;
    this.noRoom = false;

    const stage = stageFor(target);
    const grew = stage > this.world.stage;
    if (grew) {
      const old = this.world.stage;
      this.world.setStage(stage);
      for (let zone = old + 1; zone <= stage; zone++) {
        this.world.seedZone(zone);
        this.view.raiseZone(this.world, zone, 1.3 + (zone - old - 1) * 0.9);
      }
      // 撤销记录里没有新陆地上的树，升级后从头记
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.view.frameStage(stage);
      this.results = this.evaluate();
      this.adoptResults();
      this.view.sync(this.world, this.ctx(), 'bulk');
    }

    const final = !!LEVELS[target].final;
    if (final) this.done = true;
    setTimeout(() => {
      this.audio.levelUp();
      this.ui.levelUp(target, p, lines, final);
      if (grew) setTimeout(() => this.audio.rise(), 450);
      if (final) for (const r of this.results) if (r.home) this.view.sparkle(r.home.x, r.home.z, r.home.level * H + 0.5);
    }, 750);
  }

  // ---------- 工具 ----------

  setTab(id, fromUi = false) {
    if (this.tab === id) return;
    this.tab = id;
    this.ui.setTab(id);
    if (fromUi || this.started) this.audio.click();
  }

  selectTool(id, fromUi = false) {
    const m = MOD[id];
    if (m && !this.unlocked.has(id)) {
      this.audio.invalid();
      this.ui.toast(t('toast.locked', LEVELS[unlockLevel(id)].need, nameOf(id)), 2.2);
      return;
    }
    this.tool = this.tool === id ? null : id;
    if (this.tool !== 'move') this.clearSelection();
    this.rotOverride = false;
    if (m && this.tool && m.tab !== this.tab) {
      this.tab = m.tab;
      this.ui.setTab(m.tab);
    }
    this.ui.setTool(this.tool);
    if (fromUi || this.started) this.audio.click();
    this.aim = null;
    this.pickKey = '';
    this.ui.setAim(null);
    // 触屏上没有"鼠标移上去看说明"：选中的时候在按钮上方弹出说明和用法，几秒后自己淡出
    if (this.touch && this.started) {
      if (!this.tool) this.ui.hideTip();
      else if (m) this.ui.showTip(id, descOf(id, true), t(m.paint ? 'aim.paint' : 'aim.tap'));
      else this.ui.showTip(id, '', t(id === 'move' ? 'aim.box' : 'aim.remove'));
    }
    this.refreshHover();
  }

  rotate() {
    if (this.tool === 'move') {
      this.rotateSelection();
      return;
    }
    if (!this.tool || !MOD[this.tool] || !MOD[this.tool].rot) return;
    this.rot = (this.rot + 1) % 4;
    this.rotOverride = true;
    this.audio.rotate();
    this.refreshHover();
  }

  pushUndo() {
    this.undoStack.push(this.world.serialize());
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    if (!this.undoStack.length) return;
    this.clearSelection();
    this.redoStack.push(this.world.serialize());
    this.world.load(this.undoStack.pop());
    this.audio.undo();
    this.commit('bulk');
  }

  redo() {
    if (!this.redoStack.length) return;
    this.clearSelection();
    this.undoStack.push(this.world.serialize());
    this.world.load(this.redoStack.pop());
    this.audio.redo();
    this.commit('bulk');
  }

  // ---------- 悬停与摆放 ----------

  // 把拾取结果翻译成"这一下点下去会发生什么"
  computeHover(pick) {
    const tool = this.tool;
    if (!pick || !tool) return null;
    const { x, z } = pick;
    const c = this.world.cell(x, z);

    if (tool === 'remove') {
      if (pick.balcony) return { kind: 'removeBalcony', x, z, level: pick.balcony.level, dir: pick.balcony.dir, valid: true };
      if (c.s.length) return { kind: 'remove', x, z, level: c.s.length - 1, solid: true, tall: SOLO[c.s[0].t] || 1, valid: true };
      if (c.g) return { kind: 'remove', x, z, level: 0, solid: false, valid: true };
      return { kind: 'remove', x, z, level: 0, valid: false, reason: t('hint.nothing') };
    }

    if (tool === 'balcony') {
      let level;
      let dir;
      if (pick.balcony) {
        level = pick.balcony.level;
        dir = pick.balcony.dir;
      } else if (pick.face >= 0 && !this.rotOverride) {
        // 指着哪面墙，阳台就装在哪面墙上
        level = pick.level;
        dir = pick.face;
        this.rot = dir;
      } else {
        level = pick.face >= 0 ? pick.level : Math.max(0, c.s.length - 1);
        dir = this.rot;
      }
      const r = this.world.check('balcony', x, z, { level, dir });
      return { kind: 'place', type: 'balcony', x, z, level, dir, rot: true, valid: r.ok, reason: r.reason };
    }

    const r = this.world.check(tool, x, z);
    const level = r.ok ? r.level : SOLIDS.includes(tool) ? Math.min(this.world.heightOf(c), 4) : 0;
    const dir = tool === 'dock' ? this.world.dockDir(x, z) : this.rot;
    return { kind: 'place', type: tool, x, z, level, dir, rot: !!MOD[tool].rot, valid: r.ok, reason: r.reason };
  }

  refreshHover() {
    if (this.touch) {
      // 触屏没有悬停：预览跟着"点中的位置"走
      const on = this.started && this.tool && this.tool !== 'move' && this.aim;
      this.setHover(on ? this.computeHover(this.aim) : null);
      return;
    }
    if (!this.mouse || !this.mouse.inside || !this.started || this.drag) {
      this.setHover(null);
      return;
    }
    if (this.tool === 'move') {
      this.setHover(null);
      this.moveHint();
      return;
    }
    const pick = this.view.pick(this.mouse.x, this.mouse.y);
    const pk = pick ? `${pick.x},${pick.z},${pick.level},${pick.face}` : '';
    if (pk !== this.pickKey) {
      this.pickKey = pk;
      this.rotOverride = false;
    }
    this.setHover(this.computeHover(pick));
  }

  setHover(h) {
    const key = h ? `${h.kind}|${h.type}|${h.x}|${h.z}|${h.level}|${h.dir}|${h.valid}` : '';
    if (key !== this.hoverKey) {
      const moved = !!h && !!this.hoverKey;
      this.hoverKey = key;
      this.updatePreview(h);
      if (moved && h.valid) this.audio.snap();
    }
    this.hover = h;
    this.view.setHover(h);
    if (this.touch) {
      this.ui.setHint(null);
      this.refreshAim();
      return;
    }
    if (!h || !this.mouse) {
      this.ui.setHint(null);
      return;
    }
    this.ui.setHint(this.hoverText(h), this.mouse.x, this.mouse.y, !h.valid);
  }

  // 预览旁边的一句话：放不了的原因，或者朝向、第几层
  hoverText(h) {
    if (!h.valid) return h.reason;
    if (h.type === 'balcony') return `${t('hint.facing', h.dir)} · ${t('hint.floor', h.level + 1)}`;
    if (h.kind === 'place' && h.rot) return t('hint.facing', h.dir);
    if (h.kind === 'place' && h.level >= 1) return t('hint.floor', h.level + 1);
    return '';
  }

  // 摆放前先在副本上算一遍，让居民的表情和繁荣度提前变化
  updatePreview(h) {
    if (!h || !h.valid) {
      this.ui.setPreview(null);
      return;
    }
    const w = this.world.clone();
    this.applyTo(w, h);
    const res = this.evaluate(w);
    this.ui.setPreview(res.map((r) => ({ id: r.id, tier: r.tier, bonus: !!(r.bonus && r.bonus.done) })));
  }

  applyTo(w, h) {
    if (h.kind === 'place') w.apply(h.type, h.x, h.z, { level: h.level, dir: h.dir });
    else if (h.kind === 'removeBalcony') w.removeBalcony(h.x, h.z, h.level, h.dir);
    else w.remove(h.x, h.z);
  }

  act(h, quiet = false) {
    if (!h) return false;
    if (!h.valid) {
      if (!quiet) {
        this.view.rejectGhost();
        this.audio.invalid();
        if (h.reason) this.ui.toast(h.reason);
      }
      return false;
    }
    if (!this.strokePushed) {
      this.pushUndo();
      this.strokePushed = true;
    }
    this.applyTo(this.world, h);
    if (h.kind === 'place') this.audio.place(h.level, !SOLIDS.includes(h.type));
    else this.audio.remove();
    this.commit('place');
    return true;
  }

  // ---------- 圈选与整块移动 ----------

  clearSelection() {
    if (!this.sel && !this.selDrag) return;
    this.sel = null;
    this.selDrag = null;
    this.pend = null; // 还没按"确定"的搬动作废，东西回到原处
    this.view.setSelection(null);
    this.ui.setPreview(null);
    this.refreshAim();
  }

  inSel(p) {
    const s = this.sel;
    return !!s && !!p && p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1;
  }

  // 居民名单的副本：住处在被搬走的格子上的，住处跟着改到新位置。pairs：[{ from, to }]
  rosterMoved(pairs) {
    const to = new Map(pairs.map((p) => [`${p.from.x},${p.from.z}`, p.to]));
    return this.roster.map((r) => {
      if (!r.homeKey) return r;
      const [x, z, lv] = r.homeKey.split(',').map(Number);
      const dst = to.get(`${x},${z}`);
      return dst ? { ...r, homeKey: `${dst.x},${dst.z},${lv}` } : r;
    });
  }

  // 真正把一批格子搬到新位置（turns：顺时针转几个 90°），圈选框跟到 rect
  applyRelocation(pairs, turns, rect) {
    this.pushUndo();
    this.world.relocate(pairs, turns);
    // 住在里面、站在上面的居民跟着一起走
    const to = new Map(pairs.map((p) => [`${p.from.x},${p.from.z}`, p.to]));
    this.roster = this.rosterMoved(pairs);
    for (const res of this.residents) {
      const indoors = res.state === 'inside' || res.state === 'perch';
      const at = indoors && res.homeKey ? res.homeKey.split(',').slice(0, 2).join(',') : `${res.x},${res.z}`;
      const dst = to.get(at);
      if (!dst) continue;
      if (indoors && turns) {
        res.homeKey = ''; // 房子转了向：先出来，再自己走回去
      } else {
        const [fx, fz] = at.split(',').map(Number);
        res.shift(dst.x - fx, dst.z - fz);
      }
    }
    this.sel = rect;
    this.view.setSelection(rect, 'idle');
    this.audio.place(0, false);
    this.commit('move');
    this.view.settle(pairs.map((p) => p.to));
  }

  // ---- 搬动（触屏和电脑一样）：圈好以后，拖动和转向都只改一份"打算"，画面上能看到搬过去的样子，
  // 世界本身不动；按"确定"才真的搬，按取消就当没动过 ----

  startPend(rect) {
    const cells = this.world.occupied(rect.x0, rect.z0, rect.x1, rect.z1);
    this.pend = { cells, cur: cells.map((p) => ({ x: p.x, z: p.z })), rect: { ...rect }, turns: 0, flip: false, valid: true, reason: '', changed: false };
    this.showPend();
    if (!this.selTipShown) {
      this.selTipShown = true;
      this.ui.toast(t(this.touch ? 'toast.pend' : 'toast.selected'), 4.5);
    }
  }

  // 按现在的打算算一遍：放不放得下、居民会怎么想；再把预览画出来。放不下不拦着，框变红
  showPend() {
    const p = this.pend;
    if (!p) return;
    const pairs = p.cells.map((c, i) => ({ from: c, to: p.cur[i] }));
    p.changed = p.turns % 4 !== 0 || pairs.some((q) => q.from.x !== q.to.x || q.from.z !== q.to.z);
    p.valid = true;
    p.reason = '';
    let res = null;
    if (p.changed) {
      const w = this.world.clone();
      const r = w.relocate(pairs, p.turns % 4);
      p.valid = r.ok;
      p.reason = r.reason || '';
      if (r.ok) res = evaluateAll(w, this.rosterMoved(pairs));
    }
    this.ui.setPreview(res && res.map((r) => ({ id: r.id, tier: r.tier, bonus: !!(r.bonus && r.bonus.done) })));
    this.sel = p.rect;
    this.view.setCarry(p.rect, !p.valid ? 'bad' : p.changed ? 'ok' : 'idle', pairs, p.turns);
    this.moveHint();
  }

  // 按"确定"（电脑上按 Enter 也行）：真的搬过去，然后退出搬动。框是红的（放不下）就只弹一句原因，留在原地让玩家接着挪
  confirmMove() {
    const p = this.pend;
    if (!p) return;
    if (!p.valid) {
      this.audio.invalid();
      if (p.reason) this.ui.toast(p.reason);
      return;
    }
    this.pend = null;
    this.ui.setPreview(null);
    if (p.changed) {
      this.applyRelocation(
        p.cells.map((c, i) => ({ from: c, to: p.cur[i] })),
        p.turns % 4,
        p.rect,
      );
    }
    this.clearSelection();
    if (this.tool === 'move') this.selectTool('move');
  }

  // 把圈住的一块原地顺时针转 90°。转过去放不放得下都照转：放不下时框变红
  rotateSelection() {
    const p = this.pend;
    const d = this.selDrag;
    // 电脑上可以一边拖着一边按 R
    if (!p || (d && (this.touch || d.mode !== 'pend'))) return;
    const r = rotateRect(p.rect, p.cur, p.flip);
    p.rect = r.rect;
    p.cur = r.pts;
    p.flip = !p.flip;
    p.turns++;
    this.audio.rotate();
    this.showPend();
  }

  moveDown(e) {
    const p = this.view.pickGround(e.clientX, e.clientY);
    if (this.pend) {
      // 按在框里（电脑上按在抬着的东西身上也算）是拖着它走
      if (p && (this.inSel(p) || (!this.touch && this.view.hitsLifted(e.clientX, e.clientY)))) {
        this.selDrag = { mode: 'pend', ax: p.x, az: p.z, dx: 0, dz: 0 };
        this.audio.snap();
        this.moveHint();
        return;
      }
      // 按在框外：触屏上不算数（单指照常移动画面，找地方放）；电脑上是不搬了，东西回原处，重新圈
      if (this.touch) return;
      this.clearSelection();
    }
    if (!p) return;
    this.selDrag = { mode: 'box', ax: p.x, az: p.z };
    this.sel = { x0: p.x, z0: p.z, x1: p.x, z1: p.z };
    this.view.setSelection(this.sel, 'box');
    this.moveHint();
  }

  moveMove(e) {
    const d = this.selDrag;
    const p = d && this.view.pickGround(e.clientX, e.clientY);
    if (d && d.mode === 'pend') {
      const q = this.pend;
      if (!p || !q) return;
      const dx = p.x - d.ax;
      const dz = p.z - d.az;
      if (dx === d.dx && dz === d.dz) {
        if (!this.touch) this.moveHint(); // 小提示跟着鼠标走
        return;
      }
      const sx = dx - d.dx;
      const sz = dz - d.dz;
      d.dx = dx;
      d.dz = dz;
      q.cur = q.cur.map((c) => ({ x: c.x + sx, z: c.z + sz }));
      q.rect = { x0: q.rect.x0 + sx, z0: q.rect.z0 + sz, x1: q.rect.x1 + sx, z1: q.rect.z1 + sz };
      this.showPend();
      if (q.valid) this.audio.snap();
      return;
    }
    if (p && d.mode === 'box') {
      const s = { x0: Math.min(d.ax, p.x), z0: Math.min(d.az, p.z), x1: Math.max(d.ax, p.x), z1: Math.max(d.az, p.z) };
      const o = this.sel;
      if (s.x0 !== o.x0 || s.z0 !== o.z0 || s.x1 !== o.x1 || s.z1 !== o.z1) {
        this.sel = s;
        this.view.setSelection(s, 'box');
        this.audio.snap();
      }
    }
    this.moveHint();
  }

  moveUp() {
    const d = this.selDrag;
    this.selDrag = null;
    if (!d) return;
    if (d.mode === 'pend') {
      this.moveHint(); // 预览着的拖动：松手不算放下，等按"确定"
      return;
    }
    const s = this.sel;
    if (!this.world.occupied(s.x0, s.z0, s.x1, s.z1).length) {
      this.clearSelection();
    } else {
      this.audio.click();
      this.startPend(s);
    }
  }

  // 搬动工具跟在鼠标旁边的小提示
  moveHint() {
    this.refreshAim();
    if (this.touch) {
      this.ui.setHint(null);
      return;
    }
    const m = this.mouse;
    if (!m || !m.inside) {
      this.ui.setHint(null);
      return;
    }
    const d = this.selDrag;
    const p = this.pend;
    let text = '';
    let bad = false;
    if (d && d.mode === 'box') {
      text = `${this.sel.x1 - this.sel.x0 + 1} × ${this.sel.z1 - this.sel.z0 + 1}`;
    } else if (p && p.changed && !p.valid) {
      // 放不下：拖着的时候说原因，松着手的时候说怎么办
      bad = true;
      text = d ? p.reason : t('hint.pendBad');
    } else if (d) {
      text = '';
    } else if (!this.sel) {
      text = t('hint.box');
    } else if (this.inSel(this.view.pickGround(m.x, m.y))) {
      text = t(p && p.changed ? 'hint.confirm' : 'hint.moveOrRotate');
    }
    this.ui.setHint(text, m.x, m.y, bad);
  }

  // 世界或居民名单发生变化之后统一走这里
  // mode：'place' 玩家摆放或拆除；'move' 整块搬动；'arrive' 来了新居民；'idea' 有人冒出新想法；'bulk' 撤销、重做、重置
  commit(mode) {
    const was = this.prosperity;
    if (mode === 'place' || mode === 'move' || mode === 'bulk') this.worldVer++;
    this.results = this.evaluate();
    const info = this.view.sync(this.world, this.ctx(), mode === 'bulk' ? 'bulk' : mode === 'move' ? 'instant' : 'place');
    if (mode === 'place' && info.grown > 0) setTimeout(() => this.audio.grow(info.grown), 170);
    // 只有玩家亲手摆放、搬动引起的变化才庆祝或叹气
    if (mode === 'place' || mode === 'move') this.handleWishChanges();
    this.adoptResults();
    this.checkLevel();
    this.ui.setWishes(this.results);
    this.refreshProsperity();
    // 玩家亲手摆放、拆除、搬动让繁荣度变了：在数字旁边弹一下"+1"（一次满足好几个愿望就是 +2、+3）
    if ((mode === 'place' || mode === 'move') && this.prosperity !== was) this.ui.popProsper(this.prosperity - was);
    this.ui.setUndoState(this.undoStack.length > 0, this.redoStack.length > 0);
    this.audio.setIntensity(this.world.count());
    this.hoverKey = null; // 不等于任何落点（包括"没有落点"）：下面这一步一定会把预览重算或收起
    this.refreshHover();
    this.queueSave();
  }

  // 评估结果里和画面有关的部分：哪些阳台放躺椅，哪些花园放长椅、哪些菜地有人照看
  ctx() {
    const chairs = new Map();
    const benches = new Map();
    for (const r of this.results) {
      if (r.tier < 1) continue;
      const h = r.home;
      if (h.dir !== undefined) chairs.set(`${h.x},${h.z},${h.level},${h.dir}`, r.tier);
      if (r.spot) {
        const k = `${r.spot.x},${r.spot.z}`;
        benches.set(k, Math.max(benches.get(k) || 0, r.tier));
      }
    }
    return { chairs, benches };
  }

  handleWishChanges() {
    let chimes = 0;
    this.results.forEach((r, i) => {
      const before = this.tiers[r.id] || 0;
      const res = this.residents[i];
      const bonusNow = !!(r.bonus && r.bonus.done);
      if (r.tier > before) {
        const delay = 380 + chimes++ * 260;
        setTimeout(() => this.audio.wish(r.tier), delay);
        if (r.home) setTimeout(() => this.view.sparkle(r.home.x, r.home.z, r.home.level * H + 0.5), delay - 80);
        res.say(r.text, 6.5);
        this.ui.celebrate(r.id);
        this.ui.toast(t('toast.tier', res.def.name, t('tier', r.tier)));
      } else if (r.tier < before) {
        if (!chimes) setTimeout(() => this.audio.sigh(), 300);
        res.say(r.text, 5.5);
      } else if (bonusNow && !this.bonusDone[r.id]) {
        const delay = 380 + chimes++ * 260;
        setTimeout(() => this.audio.wish(2), delay);
        if (r.home) setTimeout(() => this.view.sparkle(r.home.x, r.home.z, r.home.level * H + 0.5), delay - 80);
        res.say(r.bonus.doneSay, 6.5);
        this.ui.celebrate(r.id);
        this.ui.toast(t('toast.bonusDone', res.def.name));
      }
    });
  }

  // 点居民卡片：镜头移到他的家（没有家就移到本人），并让他再说一遍想法
  focusResident(id) {
    const i = this.roster.findIndex((r) => r.spec.id === id);
    if (i < 0) return;
    const res = this.residents[i];
    const r = this.results[i];
    this.audio.click();
    if (r.home) {
      const p = this.view.cellCenter(r.home.x, r.home.z);
      this.view.focusOn(p.x, p.z);
      this.view.ping(r.home.x, r.home.z, r.home.level);
    } else {
      this.view.focusOn(res.pos.x, res.pos.z);
    }
    // 住得满意、但还有没实现的新想法时，说新想法
    res.say(r.tier >= 2 && r.bonus && !r.bonus.done ? r.bonus.say : r.text, 5);
  }

  // ---------- 输入 ----------

  bindInput() {
    const cv = this.view.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    // 手指和触控笔走触屏那一套，鼠标走原来的
    const isTouch = (e) => e.pointerType !== 'mouse';

    cv.addEventListener('pointermove', (e) => {
      if (isTouch(e)) {
        this.touchMove(e);
        return;
      }
      if (this.touch) this.setTouch(false);
      this.mouse = { x: e.clientX, y: e.clientY, inside: true };
      if (this.drag) {
        this.view.pan(e.clientX - this.drag.x, e.clientY - this.drag.y);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        return;
      }
      if (this.tool === 'move') {
        this.moveMove(e);
        return;
      }
      this.refreshHover();
      if (this.painting && this.hover && this.hover.kind === 'place') this.act(this.hover, true);
    });

    cv.addEventListener('pointerdown', (e) => {
      if (!this.started) return;
      this.setTouch(isTouch(e));
      if (this.touch) {
        this.touchDown(e);
        return;
      }
      this.mouse = { x: e.clientX, y: e.clientY, inside: true };
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 个别设备不支持指针捕获，不影响操作 */
      }
      if (e.button === 0 && this.tool === 'move') {
        this.moveDown(e);
      } else if (e.button === 0 && this.tool) {
        this.strokePushed = false;
        this.refreshHover();
        this.act(this.hover);
        this.painting = !!(MOD[this.tool] && MOD[this.tool].paint);
      } else {
        this.drag = { x: e.clientX, y: e.clientY };
        cv.classList.add('grabbing');
        this.setHover(null);
      }
    });

    const end = (e) => {
      if (isTouch(e)) {
        this.touchUp(e, e.type === 'pointercancel');
        return;
      }
      if (this.selDrag) this.moveUp();
      this.painting = false;
      this.strokePushed = false;
      if (this.drag) {
        this.drag = null;
        cv.classList.remove('grabbing');
      }
      if (e && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      this.refreshHover();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    cv.addEventListener('pointerleave', (e) => {
      if (isTouch(e)) return;
      if (this.mouse) this.mouse.inside = false;
      if (!this.drag && !this.painting) this.setHover(null);
    });

    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.view.zoomBy(e.deltaY);
      },
      { passive: false },
    );

    // 手机上切走页面后随时可能被系统关掉，离开前先把存档写下去
    const flush = () => {
      if (!this.started) return;
      clearTimeout(this.saveTimer);
      this.save();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
    window.addEventListener('pagehide', flush);

    window.addEventListener('keydown', (e) => {
      // 在输入框里打字的时候，不当成游戏的快捷键
      if (!this.started || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      // 数字键选的是当前这一页里的模块
      const mod = MODULES.find((m) => m.tab === this.tab && m.key === k);
      if (mod && !e.ctrlKey && !e.metaKey) {
        this.selectTool(mod.id);
      } else if (k === 'tab') {
        const i = TABS.findIndex((tab) => tab.id === this.tab);
        this.setTab(TABS[(i + 1) % TABS.length].id);
      } else if (k === 'r') {
        this.rotate();
      } else if (k === 'q') {
        this.view.rotateCam(-1);
        this.audio.rotate();
      } else if (k === 'e') {
        this.view.rotateCam(1);
        this.audio.rotate();
      } else if (k === 'm') {
        this.selectTool('move');
      } else if (k === 'x' || k === 'delete' || k === 'backspace') {
        this.selectTool('remove');
      } else if (k === 'z' && e.shiftKey) {
        this.redo();
      } else if (k === 'z') {
        this.undo();
      } else if (k === 'y') {
        this.redo();
      } else if (k === 'enter' && this.tool === 'move' && this.pend) {
        this.confirmMove();
      } else if (k === 'escape') {
        // 先取消圈选（还没确定的搬动作废），再按一次才放下工具
        if (this.sel) this.clearSelection();
        else if (this.tool) this.selectTool(this.tool);
      } else {
        return;
      }
      e.preventDefault();
    });
  }

  // ---------- 触屏 ----------
  // 单指拖动平移，双指捏合缩放。选了模块以后，点一下是"瞄准"（出现预览，居民的表情跟着变），
  // 再点同一处或按确认才放下；路、花园这些可以连着摆的，点一下直接放下。
  // 搬动工具和鼠标一样靠拖：拖出一块区域，再拖着它走，这时候平移画面用双指。

  setTouch(on) {
    if (this.touch === on) return;
    if (this.pend) this.clearSelection();
    this.touch = on;
    this.aim = null;
    this.pickKey = '';
    this.pointers.clear();
    this.tap = null;
    if (on) this.mouse = null;
    this.ui.setTouch(on);
    this.setHover(null);
    this.refreshAim();
  }

  // 两根手指之间的距离和中点
  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  touchDown(e) {
    const ps = this.pointers;
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.ui.hideTip();
    if (ps.size === 1) {
      this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      if (this.tool === 'move') {
        this.moveDown(e);
        this.refreshAim();
      }
    } else {
      // 第二根手指落下：改成缩放和平移，第一根手指正在做的事作废
      this.tap = null;
      this.cancelMoveDrag();
      this.pinch = this.pinchState();
    }
  }

  touchMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size >= 2) {
      const now = this.pinchState();
      const was = this.pinch || now;
      if (was.d > 10 && now.d > 10) this.view.zoomScale(now.d / was.d);
      this.view.pan(now.cx - was.cx, now.cy - was.cy);
      this.pinch = now;
      return;
    }
    if (this.selDrag) {
      this.moveMove(e);
      return;
    }
    const tap = this.tap;
    if (tap && !tap.moved) {
      // 手指难免抖一下：挪出一小段距离才算拖动，否则还算点击
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < TAP_SLOP) return;
      tap.moved = true;
    }
    this.view.pan(dx, dy);
  }

  touchUp(e, cancelled) {
    const ps = this.pointers;
    if (!ps.has(e.pointerId)) return;
    ps.delete(e.pointerId);
    this.pinch = ps.size >= 2 ? this.pinchState() : null;
    if (ps.size) return; // 还有手指在屏幕上：接着平移，不算点击
    const tap = this.tap;
    this.tap = null;
    if (this.selDrag) {
      this.moveUp();
      this.refreshAim();
      return;
    }
    if (cancelled || !tap || tap.moved || tap.id !== e.pointerId) return;
    this.handleTap(tap.x, tap.y);
  }

  // 圈选或搬到一半时第二根手指落下：这次拖动不算数
  cancelMoveDrag() {
    const d = this.selDrag;
    if (!d) return;
    if (d.mode === 'box') {
      this.clearSelection();
      return;
    }
    this.selDrag = null; // 拖着预览的：预览留在原地
  }

  handleTap(x, y) {
    const tool = this.tool;
    if (!tool || tool === 'move') return;
    const pick = this.view.pick(x, y);
    if (!pick) {
      this.cancelAim();
      return;
    }
    if (MOD[tool] && MOD[tool].paint) {
      // 可以连着摆的：点一下就放下，每一下各算一步撤销
      this.aim = null;
      this.rotOverride = false;
      this.strokePushed = false;
      this.act(this.computeHover(pick));
      this.strokePushed = false;
      return;
    }
    const key = `${pick.x},${pick.z},${pick.level},${pick.face}`;
    if (this.aim && key === this.pickKey) {
      this.confirmAim();
      return;
    }
    this.aim = pick;
    this.pickKey = key;
    this.rotOverride = false;
    this.audio.hover();
    this.refreshHover();
  }

  // 把瞄准的那一下真的做掉
  confirmAim() {
    const h = this.aim && this.hover;
    if (!h) return;
    if (!h.valid) {
      this.act(h); // 放不了：说出原因，预览留着，方便换个朝向或位置
      return;
    }
    this.aim = null;
    this.pickKey = '';
    this.strokePushed = false;
    this.act(h);
    this.strokePushed = false;
  }

  cancelAim() {
    if (this.tool === 'move') {
      this.clearSelection();
      return;
    }
    this.aim = null;
    this.pickKey = '';
    this.refreshHover();
  }

  // 工具栏上方的那一条：现在该怎么做，以及转向、确认、取消几个按钮
  refreshAim() {
    const tool = this.tool;
    // 电脑上只有搬动用得到这一条：圈好以后要有地方点"确定"
    if (!this.started || !tool || (!this.touch && !(tool === 'move' && this.pend))) {
      this.ui.setAim(null);
      return;
    }
    if (tool === 'move') {
      const d = this.selDrag;
      const s = this.sel;
      const p = this.pend;
      if (d && d.mode === 'box') this.ui.setAim({ text: `${s.x1 - s.x0 + 1} × ${s.z1 - s.z0 + 1}` });
      else if (p) this.ui.setAim({ text: p.valid ? t(this.touch ? 'aim.dragSel' : 'aim.dragSelKeys') : '', short: '', bad: !p.valid, rot: true, ok: t('aim.confirm'), cancel: true });
      else this.ui.setAim(null); // 还没圈：怎么圈已经在选中时的气泡里说过了
      return;
    }
    const h = this.aim ? this.hover : null;
    if (!h) {
      this.ui.setAim(null);
      return;
    }
    const place = h.kind === 'place';
    const info = this.hoverText(h);
    const text = h.valid ? `${info ? `${info} · ` : ''}${t(place ? 'aim.again' : 'aim.againRemove')}` : info;
    // 没有"放下""取消"按钮：再点一次同一处就是确定，点别处就是换地方
    this.ui.setAim({ text, short: info, bad: !h.valid, rot: !!h.rot });
  }

  // ---------- 每帧 ----------

  update(dt) {
    if (this.started) this.t = (this.t + dt / DAY_LENGTH) % 1;
    this.view.setTime(this.t);
    const bright = 1 - this.view.night;
    if (Math.abs(bright - (this.lastBright ?? -1)) > 0.02) {
      this.lastBright = bright;
      this.audio.setBright(bright);
    }
    this.ui.updateTheme(this.view.night, dt);

    this.updateArrival(dt);
    this.ideaTick -= dt;
    if (this.ideaTick <= 0) {
      this.ideaTick = 1;
      this.tickIdeas();
    }
    this.residents.forEach((r, i) => r.update(dt, this.world, this.t, this.results[i]));
    this.view.update(dt);

    this.residents.forEach((r) => {
      const text = this.started ? r.speaking : null;
      if (text) {
        const p = this.view.project(r.anchor());
        this.ui.setBubble(r.def.id, text, p.x, p.y);
      } else {
        this.ui.setBubble(r.def.id, null);
      }
    });

    this.ui.setCompass(this.view.az, this.view.sunTheta, this.view.isDay);
    this.clockTimer -= dt;
    if (this.clockTimer <= 0) {
      this.clockTimer = 0.25;
      this.ui.setClock(this.t, this.view.isDay);
      this.ui.setChrome(`#${this.view.scene.background.getHexString()}`);
    }
    // 镜头在动的时候，鼠标没动也要更新落点
    if (!this.touch && this.mouse && this.mouse.inside && this.tool && !this.drag && Math.abs(this.view.az - this.view.azGoal) > 0.002) this.refreshHover();
  }
}
