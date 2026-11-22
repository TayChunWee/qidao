// 把逻辑、画面、声音和界面接在一起：工具、输入、撤销、存档、居民到来、愿望变化、小岛升级。
import { FPS_CHOICES } from './perf.js';
import { World, SOLIDS, SOLO, START_CENTER } from './world.js';
import { evaluateAll, canHouse, eligibleIds, makeBonus, bonusConflicts, ARCHETYPES, FIRST_RESIDENTS } from './wishes.js';
import { MODULES, TABS, H, DAY_LENGTH, SIZE, VERSION } from './config.js';
import { t, nameOf, getLang, setLang } from './i18n.js';
import { LEVELS, MAX_LV, prosperityOf, levelFor, stageFor, unlockedAt, unlockLevel, rewardsOf } from './progression.js';
import { thumbParts } from './viewmodel.js';
import { Resident, arrivalCell, walkable } from './residents.js';
import { UI } from './ui.js';
import { TRACKS } from './music.js';
import { sendFeedback } from './feedback.js';

const SAVE_KEY = 'qidao-save-v2';
const SETTINGS_KEY = 'qidao-settings-v1';
const MOD = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const ARRIVE_DELAY = 8; // 所有人都住下之后，过多少秒来下一位
const IDEA_DELAY = 45; // 居民住得满意多少秒之后，会冒出一个新想法
const IDEA_GAP = 20; // 两个新想法之间至少隔多少秒
const pairsOf = (cells, dx, dz) => cells.map((p) => ({ from: p, to: { x: p.x + dx, z: p.z + dz } }));
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
    this.rotFlip = false;

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
    this.settings = { music: 0.7, sfx: 0.8, track: 'shuffle', lang: null, fps: 144, showFps: false, tutorialDone: false, growthTipDone: false };
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
      reset: () => this.reset(),
      sendFeedback: (data) => sendFeedback({ ...data, info: this.feedbackInfo() }),
      focusResident: (id) => this.focusResident(id),
      hoverSound: () => this.audio.hover(),
      clickSound: () => this.audio.click(),
    });
    this.ui.setVolumes(this.settings.music, this.settings.sfx);
    this.ui.setTrack(this.settings.track);
    this.ui.setFpsChoice(this.settings.fps, this.settings.showFps);
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
    this.bindInput();
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
      `帧率上限 ${this.settings.fps}，音乐 ${this.settings.track}`,
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
    if (!h || !this.mouse) {
      this.ui.setHint(null);
      return;
    }
    let text = '';
    if (!h.valid) text = h.reason;
    else if (h.type === 'balcony') text = `${t('hint.facing', h.dir)} · ${t('hint.floor', h.level + 1)}`;
    else if (h.kind === 'place' && h.rot) text = t('hint.facing', h.dir);
    else if (h.kind === 'place' && h.level >= 1) text = t('hint.floor', h.level + 1);
    this.ui.setHint(text, this.mouse.x, this.mouse.y, !h.valid);
  }

  // 摆放前先在副本上算一遍，让居民的表情和繁荣度提前变化
  updatePreview(h) {
    if (!h || !h.valid) {
      this.ui.setPreview(null);
      this.ui.setProsperPreview(0);
      return;
    }
    const w = this.world.clone();
    this.applyTo(w, h);
    const res = this.evaluate(w);
    this.ui.setPreview(res.map((r) => ({ id: r.id, tier: r.tier, bonus: !!(r.bonus && r.bonus.done) })));
    this.ui.setProsperPreview(prosperityOf(res) - this.prosperity);
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
    this.view.setSelection(null);
    this.ui.setPreview(null);
    this.ui.setProsperPreview(0);
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

  // 把圈住的一块原地顺时针转 90°
  rotateSelection() {
    const s = this.sel;
    if (!s || this.selDrag) return;
    const { pairs, rect } = this.world.rotatePairs(s.x0, s.z0, s.x1, s.z1, this.rotFlip);
    const test = this.world.clone().relocate(pairs, 1);
    if (!test.ok) {
      this.audio.invalid();
      this.ui.toast(t('toast.rotBlocked', test.reason), 2.6);
      return;
    }
    this.rotFlip = !this.rotFlip;
    this.audio.rotate();
    this.applyRelocation(pairs, 1, rect);
    this.moveHint();
  }

  moveDown(e) {
    const p = this.view.pickGround(e.clientX, e.clientY);
    if (!p) return;
    // 按在圈住的区域里（或者圈住的建筑身上）就是要搬；按在别处就重新圈
    if (this.sel && (this.inSel(p) || this.inSel(this.view.pick(e.clientX, e.clientY)))) {
      const s = this.sel;
      this.selDrag = { mode: 'move', ax: p.x, az: p.z, dx: 0, dz: 0, valid: true, reason: '', cells: this.world.occupied(s.x0, s.z0, s.x1, s.z1) };
      this.view.setSelection(s, 'ok', this.selDrag.cells, 0, 0);
      this.audio.snap();
    } else {
      this.selDrag = { mode: 'box', ax: p.x, az: p.z };
      this.sel = { x0: p.x, z0: p.z, x1: p.x, z1: p.z };
      this.view.setSelection(this.sel, 'box');
    }
    this.moveHint();
  }

  moveMove(e) {
    const d = this.selDrag;
    const p = d && this.view.pickGround(e.clientX, e.clientY);
    if (p && d.mode === 'box') {
      const s = { x0: Math.min(d.ax, p.x), z0: Math.min(d.az, p.z), x1: Math.max(d.ax, p.x), z1: Math.max(d.az, p.z) };
      const o = this.sel;
      if (s.x0 !== o.x0 || s.z0 !== o.z0 || s.x1 !== o.x1 || s.z1 !== o.z1) {
        this.sel = s;
        this.view.setSelection(s, 'box');
        this.audio.snap();
      }
    } else if (p) {
      const dx = p.x - d.ax;
      const dz = p.z - d.az;
      if (dx !== d.dx || dz !== d.dz) {
        d.dx = dx;
        d.dz = dz;
        d.valid = true;
        d.reason = '';
        let res = null;
        if (dx || dz) {
          // 先在副本上搬一遍：能不能放、居民会怎么想
          const w = this.world.clone();
          const r = w.moveCells(d.cells, dx, dz);
          d.valid = r.ok;
          d.reason = r.reason || '';
          if (r.ok) res = evaluateAll(w, this.rosterMoved(pairsOf(d.cells, dx, dz)));
        }
        this.ui.setPreview(res && res.map((r) => ({ id: r.id, tier: r.tier, bonus: !!(r.bonus && r.bonus.done) })));
        this.ui.setProsperPreview(res ? prosperityOf(res) - this.prosperity : 0);
        this.view.setSelection(this.sel, d.valid ? 'ok' : 'bad', d.cells, dx, dz);
        if (d.valid) this.audio.snap();
      }
    }
    this.moveHint();
  }

  moveUp() {
    const d = this.selDrag;
    this.selDrag = null;
    if (!d) return;
    const s = this.sel;
    if (d.mode === 'box') {
      if (!this.world.occupied(s.x0, s.z0, s.x1, s.z1).length) {
        this.clearSelection();
      } else {
        this.view.setSelection(s, 'idle');
        this.audio.click();
        if (!this.selTipShown) {
          this.selTipShown = true;
          this.ui.toast(t('toast.selected'), 3.6);
        }
      }
      return;
    }
    this.ui.setPreview(null);
    this.ui.setProsperPreview(0);
    if ((!d.dx && !d.dz) || !d.valid) {
      if (!d.valid) {
        this.audio.invalid();
        this.ui.toast(d.reason);
      }
      this.view.setSelection(s, 'idle');
      return;
    }
    this.rotFlip = false;
    this.applyRelocation(pairsOf(d.cells, d.dx, d.dz), 0, { x0: s.x0 + d.dx, z0: s.z0 + d.dz, x1: s.x1 + d.dx, z1: s.z1 + d.dz });
  }

  // 搬动工具跟在鼠标旁边的小提示
  moveHint() {
    const m = this.mouse;
    if (!m || !m.inside) {
      this.ui.setHint(null);
      return;
    }
    const d = this.selDrag;
    let text = '';
    let bad = false;
    if (d && d.mode === 'box') {
      text = `${this.sel.x1 - this.sel.x0 + 1} × ${this.sel.z1 - this.sel.z0 + 1}`;
    } else if (d) {
      bad = !d.valid;
      text = bad ? d.reason : d.dx || d.dz ? t('hint.drop') : '';
    } else if (!this.sel) {
      text = t('hint.box');
    } else if (this.inSel(this.view.pickGround(m.x, m.y))) {
      text = t('hint.moveOrRotate');
    }
    this.ui.setHint(text, m.x, m.y, bad);
  }

  // 世界或居民名单发生变化之后统一走这里
  // mode：'place' 玩家摆放或拆除；'move' 整块搬动；'arrive' 来了新居民；'idea' 有人冒出新想法；'bulk' 撤销、重做、重置
  commit(mode) {
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
    this.ui.setUndoState(this.undoStack.length > 0, this.redoStack.length > 0);
    this.audio.setIntensity(this.world.count());
    this.hoverKey = '';
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

    cv.addEventListener('pointermove', (e) => {
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

    cv.addEventListener('pointerleave', () => {
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
      } else if (k === 'escape') {
        // 先取消圈选，再按一次才放下工具
        if (this.sel) this.clearSelection();
        else if (this.tool) this.selectTool(this.tool);
      } else {
        return;
      }
      e.preventDefault();
    });
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
    }
    // 镜头在动的时候，鼠标没动也要更新落点
    if (this.mouse && this.mouse.inside && this.tool && !this.drag && Math.abs(this.view.az - this.view.azGoal) > 0.002) this.refreshHover();
  }
}
