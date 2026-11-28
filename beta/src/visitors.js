// 旅客：岛上有了灯塔以后，不定期会有船靠上海边的码头，送来一两位客人，在民宿里住一阵再接走。
// 来的是还没住到岛上的那些人，不占居民名额，也不算繁荣度。每位带着两个心愿：
//   住宿偏好——对住的那间民宿的要求；想去看看——想去岛上的某样东西那儿转转。
// 两样都如了愿算"玩得尽兴"，记进来访名单（以后的图鉴用）。没如愿的照样坐船走，以后还会再来。
// 没有倒计时：船回来在码头停一阵才开，那就是"要走了"的提示。
import { SIZE, DIRS, H, opp } from './config.js';
import { ARCHETYPES, cond } from './wishes.js';
import { t } from './i18n.js';
import { Resident } from './residents.js';
import { buildBoat } from './models.js';

const HALF_SIZE = SIZE / 2;
const FIRST_BOAT = 20; // 灯塔、民宿、码头都齐了以后，第一艘船过多久来（秒）
const NEXT_BOAT = [100, 220]; // 送走一批旅客以后，下一艘船隔多久来
const STAY = 420; // 旅客住多久，船才回来接
const HAPPY_STAY = 50; // 都玩尽兴了，就不用等那么久
const DROP = 2.5; // 靠岸下客停多久
const BOARD_WAIT = 45; // 船回来以后在码头停多久才喊人上船
const BOARD_LIMIT = 30; // 旅客往码头走，最多等这么久
const SPEED = 2.4; // 船速：每秒几格
const WATER_Y = -0.3; // 船底在水面下多深
const MAX_GUESTS = 3;

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const keyOf = (h) => `${h.x},${h.z},${h.level}`;
const rand = ([a, b]) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- 心愿 ----------

// 住宿偏好：test(世界, 民宿那一间)。needs：要先解锁哪样东西才会有人提
const LODGE = {
  water: { test: cond.water(2).test },
  quiet: { test: cond.quiet(2).test },
  garden: { test: cond.gardens(1).test },
  trees: { test: cond.trees(2, 1).test },
  lamp: { test: cond.lamp(1).test },
  upstairs: { test: (w, h) => h.level >= 1 },
  terrace: {
    test: (w, h) => {
      const up = w.cell(h.x, h.z).s[h.level + 1];
      return !!up && up.t === 'terrace';
    },
    needs: 'terrace',
  },
};
// 想去看看的东西，以及"住得近"是民宿几格以内
const SIGHTS = { lighthouse: 4, clock: 4, market: 3, fountain: 3, windmill: 3, greenhouse: 3, library: 3, shop: 3, pavilion: 2, orchard: 2, field: 2, bridge: 2, well: 2 };

// 一个心愿。key 是存档里记的那个字：住宿偏好就是 LODGE 的键；想去看看是 "near:灯塔"（住得近）或 "link:灯塔"（有路通过去）
// 认不出来的返回 null
export function wishOf(key) {
  if (own(LODGE, key)) {
    return {
      key,
      test: LODGE[key].test,
      get need() {
        return t(`g.lodge.${key}.need`);
      },
      get say() {
        return t(`g.lodge.${key}.say`);
      },
    };
  }
  if (typeof key !== 'string') return null;
  const [form, type] = key.split(':');
  if ((form !== 'near' && form !== 'link') || !own(SIGHTS, type)) return null;
  const r = SIGHTS[type];
  return {
    key,
    test: (form === 'near' ? cond.near(type, r) : cond.linked(type)).test,
    get need() {
      return t(`g.${form}.need`, type, r);
    },
    get say() {
      return t(`g.${form}.say`, type);
    },
  };
}

// 挑一个现在还没如愿的心愿：在岛上每一间民宿都不成立的优先，其次是至少在一间不成立的。taken：这一船别人已经提过的
function pickWish(w, keys, inns, taken) {
  const fresh = keys.filter((k) => !taken.has(k));
  const list = fresh.length ? fresh : keys;
  const all = list.filter((k) => inns.every((h) => !wishOf(k).test(w, h)));
  const some = list.filter((k) => inns.some((h) => !wishOf(k).test(w, h)));
  return pickOne(all.length ? all : some.length ? some : list);
}

// ---------- 分房与评价 ----------

// 给旅客分房，并算出各自如了几个愿。guests：[{ id, wishes: [住宿偏好, 想去看看], roomKey }]。
// 和居民分房一样看全体加起来：先让尽量多的人有房住，再让如愿的心愿尽量多，同等条件下不换房。
// 人和房间都不超过三个，直接把所有分法试一遍
export function evaluateGuests(w, guests) {
  const inns = w.inns();
  const n = guests.length;
  const score = guests.map((v) => inns.map((h) => 1000 + v.wishes.filter((c) => c.test(w, h)).length * 10 + (keyOf(h) === v.roomKey ? 1 : 0)));
  const used = inns.map(() => false);
  const pick = new Array(n).fill(-1);
  let best = -1;
  let bestPick = pick.slice();
  const walk = (i, sum) => {
    if (i === n) {
      if (sum > best) {
        best = sum;
        bestPick = pick.slice();
      }
      return;
    }
    for (let j = 0; j < inns.length; j++) {
      if (used[j]) continue;
      used[j] = true;
      pick[i] = j;
      walk(i + 1, sum + score[i][j]);
      used[j] = false;
    }
    pick[i] = -1;
    walk(i + 1, sum);
  };
  walk(0, 0);
  return guests.map((v, i) => {
    const h = bestPick[i] >= 0 ? inns[bestPick[i]] : null;
    const out = { id: v.id, guest: true, tier: 0, home: h, key: h ? keyOf(h) : null, bonus: null };
    // 卡片上那一行：两个心愿各取冒号前面的半句
    out.wish = v.wishes.map((c) => c.need.split(/[：:]/)[0]).join(t('g.sep'));
    if (!h) {
      out.need = [t('g.noRoom')];
      out.text = t('g.noRoom.say');
      return out;
    }
    const unmet = v.wishes.filter((c) => !c.test(w, h));
    out.tier = v.wishes.length - unmet.length;
    out.need = unmet.length ? unmet.map((c) => c.need) : [t('g.happy')];
    out.text = unmet.length ? unmet[0].say : t('g.happy.say');
    return out;
  });
}

// ---------- 船靠在哪 ----------

// 船靠得上的码头：码头在海上（不在池塘里），并且有一个方向，从它旁边一直到地图边都是空着的海面。
// 返回 [{ x, z, d, far }]：d 是船从哪个方向来，far 是开到看不见要走几格
export function berths(w) {
  const out = [];
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const c = w.cell(x, z);
      if (!c.g || c.g.t !== 'dock' || c.pond) continue;
      const land = w.dockDir(x, z);
      if (land < 0) continue;
      // 先试正对着海的那一头，再试两侧
      for (const d of [opp(land), (land + 1) % 4, (land + 3) % 4]) {
        let k = 1;
        let clear = true;
        for (; clear && w.inb(x + DIRS[d].x * k, z + DIRS[d].z * k); k++) {
          const n = w.cell(x + DIRS[d].x * k, z + DIRS[d].z * k);
          if (!n.water || n.pond || n.g || n.s.length) clear = false;
        }
        if (!clear) continue;
        out.push({ x, z, d, far: k + 5 });
        break;
      }
    }
  }
  return out;
}

const hasLighthouse = (w) => w.cells.some((c) => c.s[0] && c.s[0].t === 'lighthouse');

// ---------- 存档 ----------

// 把存档里旅客那一段重新抄一遍，只留认识的内容。residents：已经住在岛上的人，他们不会同时来做客
export function cleanGuests(raw, residents = []) {
  const out = { list: [], visited: [], phase: 'away', timer: FIRST_BOAT };
  if (!raw || typeof raw !== 'object') return out;
  const seen = new Set(residents);
  for (const v of Array.isArray(raw.list) ? raw.list : []) {
    if (out.list.length >= MAX_GUESTS || !v || !own(ARCHETYPES, v.id) || seen.has(v.id)) continue;
    if (!Array.isArray(v.w) || v.w.length !== 2 || !v.w.every((k) => wishOf(k))) continue;
    seen.add(v.id);
    out.list.push({ id: v.id, w: [v.w[0], v.w[1]], room: typeof v.room === 'string' && /^\d+,\d+,\d+$/.test(v.room) ? v.room : null, done: !!v.done });
  }
  const visited = new Set();
  for (const id of Array.isArray(raw.visited) ? raw.visited : []) if (own(ARCHETYPES, id)) visited.add(id);
  out.visited = [...visited];
  out.phase = out.list.length ? 'stay' : 'away';
  if (Number.isFinite(raw.timer) && raw.timer >= 0) out.timer = Math.min(raw.timer, 3600);
  return out;
}

// ---------- 旅客这一摊事 ----------

// 界面上那张卡片用的：名字跟着语言走
const cardSpec = (id) => ({
  id,
  guest: true,
  look: ARCHETYPES[id].look,
  get name() {
    return ARCHETYPES[id].name;
  },
  get wish() {
    return t('g.wish');
  },
});

export class Visitors {
  constructor(game) {
    this.g = game;
    this.guests = []; // [{ id, spec, wishes, roomKey, tier, done, aboard, fig }]
    this.results = []; // 和 guests 一一对应的评价，样子和居民的评价一样（多一个 guest: true）
    this.visited = new Set(); // 玩得尽兴过的人
    // 船的一趟：away 不在 → in 开过来 → drop 靠岸下客 → out 空船开走 → stay 旅客住着 → back 回来接 → board 停在码头等 → home 载着人开走
    this.phase = 'away';
    this.timer = FIRST_BOAT;
    this.berth = null; // 这一趟靠的码头
    this.along = 0; // 船离泊位还有几格
    this.heading = -1; // -1 朝着岛开，1 朝着海开
    this.yaw = 0;
    this.bob = 0;
    this.cargo = []; // 还在船上没下来的人
    this.calling = false;
    this.boat = null;
  }

  ids() {
    return [...this.guests.map((v) => v.id), ...this.cargo.map((v) => v.id)];
  }

  // 现在为什么来不了船：缺灯塔、缺空着的民宿、还是缺船靠得上的码头。都齐了返回 null
  blocker() {
    const w = this.g.world;
    if (!hasLighthouse(w)) return 'lighthouse';
    if (w.inns().length - this.guests.length < 1) return 'inn';
    if (!berths(w).length) return 'dock';
    return null;
  }

  // 刚盖好一样东西：灯塔和第一间民宿盖好时说一声接下来会怎样
  onBuilt(type) {
    const w = this.g.world;
    if (type === 'lighthouse' && w.cells.filter((c) => c.s[0] && c.s[0].t === 'lighthouse').length === 1) {
      this.g.ui.toast(t('toast.lighthouse'), 8);
    } else if (type === 'inn' && w.inns().length === 1) {
      const b = this.blocker();
      this.g.ui.toast(t(b === 'lighthouse' ? 'toast.innNoLight' : b === 'dock' ? 'toast.innNoDock' : 'toast.innReady'), 6);
    }
  }

  // ---------- 评价 ----------

  // 世界或名单变了以后重新分房、算心愿。mode 和 game.commit 的一样：只有玩家亲手摆放、搬动引起的变化才庆祝
  evaluate(mode) {
    const g = this.g;
    this.results = evaluateGuests(g.world, this.guests);
    const byHand = mode === 'place' || mode === 'move';
    this.results.forEach((r, i) => {
      const v = this.guests[i];
      const name = v.spec.name;
      if (byHand && r.tier > v.tier) {
        setTimeout(() => g.audio.wish(r.tier + 1), 420);
        if (r.home) setTimeout(() => g.view.sparkle(r.home.x, r.home.z, r.home.level * H + 0.5), 340);
        v.fig.say(r.text, 6.5);
        g.ui.celebrate(v.id);
        g.ui.toast(t('toast.tier', name, t('g.tier', r.tier)));
      } else if (byHand && r.tier < v.tier) {
        v.fig.say(r.text, 5.5);
      }
      v.tier = r.tier;
      v.roomKey = r.key;
      if (r.tier >= 2 && !v.done) {
        v.done = true;
        this.visited.add(v.id);
        if (mode !== 'init') g.ui.toast(t('toast.guestHappy', name), 3);
      }
    });
  }

  // 摆放前的预览：这一步会让旅客的评价变成什么
  preview(w) {
    return evaluateGuests(w, this.guests).map((r) => ({ id: r.id, tier: r.tier, bonus: false }));
  }

  // 点旅客的卡片：镜头移到他住的民宿（没房间就移到本人），并让他再说一遍心愿。不是旅客返回 false
  focus(id) {
    const i = this.guests.findIndex((v) => v.id === id);
    if (i < 0) return false;
    const g = this.g;
    const v = this.guests[i];
    const r = this.results[i];
    g.audio.click();
    if (r && r.home) {
      const p = g.view.cellCenter(r.home.x, r.home.z);
      g.view.focusOn(p.x, p.z);
      g.view.ping(r.home.x, r.home.z, r.home.level);
    } else {
      g.view.focusOn(v.fig.pos.x, v.fig.pos.z);
    }
    if (r) v.fig.say(r.text, 5);
    return true;
  }

  // ---------- 每帧 ----------

  update(dt) {
    const g = this.g;
    if (g.started) this.step(dt);
    this.moveBoat(dt);
    this.guests.forEach((v, i) => {
      const r = this.results[i];
      const home = r ? r.home : null;
      v.fig.update(dt, g.world, g.t, { tier: home ? 1 : 0, home, spot: null });
      const text = g.started ? v.fig.speaking : null;
      if (text) {
        const p = g.view.project(v.fig.anchor());
        g.ui.setBubble(v.id, text, p.x, p.y);
      } else {
        g.ui.setBubble(v.id, null);
      }
    });
  }

  step(dt) {
    const g = this.g;
    switch (this.phase) {
      case 'away':
        if (this.blocker()) return; // 条件不齐，表先停着
        this.timer -= dt;
        if (this.timer <= 0) this.sail();
        break;
      case 'in':
        if (this.advance(dt, -1)) this.land();
        break;
      case 'drop':
        this.timer -= dt;
        if (this.timer <= 0) this.phase = 'out';
        break;
      case 'out':
        if (this.advance(dt, 1)) {
          this.hideBoat();
          this.phase = 'stay';
          this.timer = STAY;
        }
        break;
      case 'stay':
        this.timer -= dt;
        if (this.results.length && this.results.every((r) => r.tier >= 2)) this.timer = Math.min(this.timer, HAPPY_STAY);
        if (this.timer <= 0) this.comeBack();
        break;
      case 'back':
        if (this.advance(dt, -1)) {
          this.phase = 'board';
          this.timer = BOARD_WAIT;
          this.calling = false;
          g.ui.toast(t('toast.boatBack'), 4);
        }
        break;
      case 'board':
        this.timer -= dt;
        if (!this.calling && this.timer <= 0) this.call();
        if (this.calling) {
          for (const v of this.guests) {
            if (!v.aboard && v.fig.x === this.berth.x && v.fig.z === this.berth.z && v.fig.state !== 'walk') {
              v.aboard = true;
              v.fig.scaleGoal = 0;
            }
          }
          if (this.timer <= -BOARD_LIMIT || this.guests.every((v) => v.aboard)) this.depart(true);
        }
        break;
      case 'home':
        if (this.advance(dt, 1)) {
          this.hideBoat();
          this.phase = 'away';
          this.timer = rand(NEXT_BOAT);
        }
        break;
    }
  }

  // 船沿着进出的那条线挪一步。dir：-1 靠过来，1 开出去。到头了返回 true
  advance(dt, dir) {
    this.heading = dir;
    // 快到码头时慢下来
    const speed = SPEED * Math.min(1, Math.max(0.22, this.along / 2.5));
    this.along += dir * speed * dt;
    if (dir < 0 && this.along <= 0) {
      this.along = 0;
      return true;
    }
    return dir > 0 && this.along >= this.berth.far;
  }

  // 派一艘船来：挑一个码头，定下船上坐着谁、各自想要什么
  sail() {
    const g = this.g;
    const w = g.world;
    const inns = w.inns();
    const here = new Set([...g.roster.map((r) => r.spec.id), ...this.ids()]);
    // 请得来的优先（他们需要的东西已经解锁），其次是还没来玩尽兴过的
    const all = Object.keys(ARCHETYPES).filter((id) => !here.has(id));
    const known = all.filter((id) => ARCHETYPES[id].needs.every((m) => g.unlocked.has(m)));
    const pool = known.length ? known : all;
    const fresh = pool.filter((id) => !this.visited.has(id));
    const from = fresh.length ? fresh : pool;
    const seats = Math.min(inns.length - this.guests.length, Math.random() < 0.5 ? 1 : 2, from.length);
    const spots = berths(w);
    if (seats < 1 || !spots.length) {
      this.timer = 10;
      return;
    }
    const lodge = Object.keys(LODGE).filter((k) => !LODGE[k].needs || g.unlocked.has(LODGE[k].needs));
    const sights = Object.keys(SIGHTS)
      .filter((type) => g.unlocked.has(type))
      .flatMap((type) => [`near:${type}`, `link:${type}`]);
    if (!sights.length) {
      this.timer = 30;
      return;
    }
    const taken = new Set(this.guests.flatMap((v) => v.wishes.map((c) => c.key)));
    this.cargo = [];
    for (let i = 0; i < seats; i++) {
      const id = from.splice(Math.floor(Math.random() * from.length), 1)[0];
      const a = pickWish(w, lodge, inns, taken);
      taken.add(a);
      const b = pickWish(w, sights, inns, taken);
      taken.add(b);
      this.cargo.push({ id, w: [a, b] });
    }
    this.berth = pickOne(spots);
    this.along = this.berth.far;
    this.phase = 'in';
    this.showBoat();
    g.ui.toast(t('toast.boatComing'), 3);
  }

  // 靠岸：船上的人下到码头上
  land() {
    const g = this.g;
    this.phase = 'drop';
    this.timer = DROP;
    const fresh = this.cargo.map((c) => this.add(c, { x: this.berth.x, z: this.berth.z }, true));
    this.cargo = [];
    g.commit('arrive');
    g.audio.arrive();
    g.ui.toast(t('toast.boatIn', fresh.map((v) => v.spec.name).join(t('g.and'))), 4);
    fresh.forEach((v, i) => {
      const r = this.results[this.guests.indexOf(v)];
      if (r) setTimeout(() => v.fig.say(r.text, 8), i * 1400);
    });
  }

  // 多一位旅客。saved：{ id, w, room, done }；at：小人出现在哪一格；pop：带不带出场动画
  add(saved, at, pop) {
    const g = this.g;
    const v = {
      id: saved.id,
      spec: cardSpec(saved.id),
      wishes: saved.w.map(wishOf),
      roomKey: saved.room || null,
      tier: 0,
      done: !!saved.done,
      aboard: false,
      fig: new Resident(ARCHETYPES[saved.id], g.view.scene, at, pop),
    };
    if (!pop) v.fig.placeNear(g.world, at.x, at.z);
    this.guests.push(v);
    g.ui.addResident(v.spec, pop);
    return v;
  }

  // 住够了：船回来接。码头靠不了船的话，旅客就自己搭别的船走
  comeBack() {
    const spots = berths(this.g.world);
    if (!spots.length) {
      this.depart(false);
      this.phase = 'away';
      this.timer = rand(NEXT_BOAT);
      return;
    }
    // 尽量还靠上次那个码头
    this.berth = spots.find((s) => this.berth && s.x === this.berth.x && s.z === this.berth.z) || pickOne(spots);
    this.along = this.berth.far;
    this.phase = 'back';
    this.showBoat();
  }

  // 喊旅客上船：各自往码头走
  call() {
    this.calling = true;
    for (const v of this.guests) {
      if (!v.fig.headTo(this.g.world, this.berth.x, this.berth.z)) {
        v.aboard = true; // 走不过来的就当已经上船了
        v.fig.scaleGoal = 0;
      }
    }
  }

  // 旅客走了。byBoat：是不是坐来接的那艘船走的
  depart(byBoat) {
    const g = this.g;
    const and = t('g.and');
    const names = this.guests.map((v) => v.spec.name).join(and);
    const happy = this.guests
      .filter((v) => v.done)
      .map((v) => v.spec.name)
      .join(and);
    for (const v of this.guests) {
      v.fig.dispose();
      g.ui.removeResident(v.id);
    }
    this.guests = [];
    this.calling = false;
    if (byBoat) this.phase = 'home';
    g.commit('arrive');
    g.ui.toast(byBoat ? t('toast.boatOut', names, happy) : t('toast.guestsGone', names), 5);
  }

  // ---------- 船 ----------

  showBoat() {
    if (!this.boat) {
      this.boat = buildBoat();
      this.g.view.scene.add(this.boat);
    }
    this.boat.visible = true;
    this.boat.scale.setScalar(1.3);
    const d = DIRS[this.berth.d];
    this.yaw = Math.atan2(-d.x, -d.z);
  }

  hideBoat() {
    if (this.boat) this.boat.visible = false;
  }

  moveBoat(dt) {
    const o = this.boat;
    if (!o || !o.visible || !this.berth) return;
    const b = this.berth;
    const d = DIRS[b.d];
    const k = 1 + this.along; // 泊位在码头外面一格
    this.bob += dt;
    o.position.set(b.x + d.x * k - HALF_SIZE + 0.5, WATER_Y + Math.sin(this.bob * 1.7) * 0.014, b.z + d.z * k - HALF_SIZE + 0.5);
    // 开过来时船头朝着岛，开出去时掉头朝着海
    const goal = Math.atan2(d.x * this.heading, d.z * this.heading);
    const turn = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
    this.yaw += turn * (1 - Math.exp(-dt * 2.6));
    o.rotation.set(Math.sin(this.bob * 1.3) * 0.02, this.yaw, Math.sin(this.bob * 1.1) * 0.035);
  }

  // ---------- 存档、重来 ----------

  // 船开到一半的不记：读档后，在岛上的旅客接着住，还在路上的那一船重新来
  snapshot() {
    const landed = this.guests.length > 0;
    let timer = this.timer;
    if (landed && this.phase !== 'stay') timer = this.phase === 'drop' || this.phase === 'out' ? STAY : 5;
    if (!landed && this.phase !== 'away') timer = 5;
    return {
      list: this.guests.map((v) => ({ id: v.id, w: v.wishes.map((c) => c.key), room: v.roomKey, done: v.done })),
      visited: [...this.visited],
      timer: Math.max(0, Math.round(timer)),
    };
  }

  restore(raw) {
    const g = this.g;
    const data = cleanGuests(
      raw,
      g.roster.map((r) => r.spec.id),
    );
    this.visited = new Set(data.visited);
    this.phase = data.phase;
    this.timer = data.timer;
    for (const saved of data.list) {
      const [x, z] = saved.room ? saved.room.split(',').map(Number) : [Math.floor(HALF_SIZE), Math.floor(HALF_SIZE)];
      this.add(saved, { x, z }, false);
    }
  }

  // 整座岛重来：旅客、来访名单、船，全都清掉
  clear() {
    for (const v of this.guests) {
      v.fig.dispose();
      this.g.ui.removeResident(v.id);
    }
    this.guests = [];
    this.results = [];
    this.cargo = [];
    this.visited = new Set();
    this.phase = 'away';
    this.timer = FIRST_BOAT;
    this.calling = false;
    this.hideBoat();
  }
}
