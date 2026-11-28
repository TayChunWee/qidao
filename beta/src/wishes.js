// 居民与愿望。只读取 World，不依赖渲染。
//
// 一个愿望 = 住处类型 + 必须条件 + 期望条件 + 一个隐藏的心愿。
//   勉强：有住处，必须条件都满足
//   满意：期望条件也都满足
//   惊喜：连隐藏的心愿也满足
// 每个住处只能住一位居民，按全岛居民加起来最满意的方式分配。
// 住得满意的居民过一阵会冒出一个"新想法"（想离某样东西或某个人近一点），实现了繁荣度再加 1。
import { SIZE, DIRS, PAINTS, ROOF_DEFAULT, WALL_DEFAULT } from './config.js';
import { PATHS } from './world.js';
import { t } from './i18n.js';

export const FIRST_RESIDENTS = ['tang', 'mo'];

function countNear(w, x, z, r, pred) {
  let n = 0;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const c = w.cell(x + dx, z + dz);
      if (c && pred(c, dx, dz)) n++;
    }
  }
  return n;
}

function adjacent(w, x, z, type) {
  const out = [];
  for (const d of DIRS) {
    const c = w.cell(x + d.x, z + d.z);
    if (c && c.g && c.g.t === type) out.push({ x: x + d.x, z: z + d.z });
  }
  return out;
}

const groundIs = (t) => (c) => !!c.g && c.g.t === t;
const baseIs = (t) => (c) => !!c.s[0] && c.s[0].t === t;
// 不管是地面物件还是建筑，只要是这种东西
const has = (t) => (c) => (!!c.g && c.g.t === t) || (!!c.s[0] && c.s[0].t === t);
const NOISY = ['shop', 'workshop', 'market'];
const noisy = (c) => !!c.s[0] && NOISY.includes(c.s[0].t);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
// 住处那一间房
const blockAt = (w, h) => w.cell(h.x, h.z).s[h.level];
// 同一层紧挨着的房间
const sideRooms = (w, h) => {
  const out = [];
  for (const d of DIRS) {
    const c = w.cell(h.x + d.x, h.z + d.z);
    const b = c && c.s[h.level];
    if (b && b.t === 'room') out.push(b);
  }
  return out;
};
const isPath = (c) => !!c && !!c.g && PATHS.includes(c.g.t);
// 从 (x, z) 旁边的路出发，顺着路和桥一直走，能不能走到一个满足 pred 的格子旁边
function roadReach(w, x, z, pred) {
  const seen = new Set();
  const queue = [];
  for (const d of DIRS) {
    const nx = x + d.x;
    const nz = z + d.z;
    if (isPath(w.cell(nx, nz))) {
      seen.add(nz * SIZE + nx);
      queue.push(nx, nz);
    }
  }
  for (let i = 0; i < queue.length; i += 2) {
    for (const d of DIRS) {
      const nx = queue[i] + d.x;
      const nz = queue[i + 1] + d.z;
      const n = w.cell(nx, nz);
      if (!n || (nx === x && nz === z)) continue;
      if (pred(n)) return true;
      const k = nz * SIZE + nx;
      if (isPath(n) && !seen.has(k)) {
        seen.add(k);
        queue.push(nx, nz);
      }
    }
  }
  return false;
}
// 紧挨着的楼各是什么颜色的屋顶（没有坡屋顶的不算）
const sideRoofs = (w, h) => DIRS.map((d) => w.roofOf(w.cell(h.x + d.x, h.z + d.z))).filter((r) => r >= 0);

// ---------- 条件库 ----------
// 每个条件：test(世界, 住处) 是否满足；need 卡片上的提示；say 居民自己的说法。
// need 和 say 的文字在 lang/ 的文字表里（c.<条件>.need / .say），用到的时候才按当前语言去取。
// 有的居民对同一个条件有自己的说法，这时把那句话的键传进来。

const cond = {
  facing: (d) => ({
    test: (w, h) => h.dir === d,
    get need() {
      return t('c.facing.need', d);
    },
    get say() {
      return t('c.facing.say', d);
    },
  }),
  // 朝 d 方向 range 格以内没有更高的楼
  openView: (d, range = 4) => ({
    test: (w, h) => {
      for (let k = 1; k <= range; k++) {
        const n = w.cell(h.x + DIRS[d].x * k, h.z + DIRS[d].z * k);
        if (!n) return true;
        if (w.heightOf(n) > h.level) return false;
      }
      return true;
    },
    get need() {
      return t('c.openView.need', d, range);
    },
    get say() {
      return t('c.openView.say', d);
    },
  }),
  // 朝 d 方向 range 格以内能看到水（岛外也算）
  waterView: (d, range = 3) => ({
    test: (w, h) => {
      for (let k = 1; k <= range; k++) {
        const n = w.cell(h.x + DIRS[d].x * k, h.z + DIRS[d].z * k);
        if (!n || n.water) return true;
        if (w.heightOf(n) > h.level) return false;
      }
      return false;
    },
    get need() {
      return t('c.waterView.need', range);
    },
    get say() {
      return t('c.waterView.say');
    },
  }),
  // 阳台不论朝哪边，正前方 range 格以内要有水
  waterFront: (range = 2) => ({
    test: (w, h) => {
      for (let k = 1; k <= range; k++) {
        const n = w.cell(h.x + DIRS[h.dir].x * k, h.z + DIRS[h.dir].z * k);
        if (!n || n.water) return true;
        if (w.heightOf(n) > h.level) return false;
      }
      return false;
    },
    get need() {
      return t('c.waterFront.need', range);
    },
    get say() {
      return t('c.waterFront.say');
    },
  }),
  minLevel: (k, sayKey = 'c.minLevel.say') => ({
    test: (w, h) => h.level >= k,
    get need() {
      return t('c.minLevel.need', k);
    },
    get say() {
      return t(sayKey);
    },
  }),
  topFloor: () => ({
    test: (w, h) => w.cell(h.x, h.z).s.length - 1 === h.level,
    get need() {
      return t('c.topFloor.need');
    },
    get say() {
      return t('c.topFloor.say');
    },
  }),
  height: (k) => ({
    test: (w, h) => w.cell(h.x, h.z).s.length >= k,
    get need() {
      return t('c.height.need', k);
    },
    get say() {
      return t('c.height.say');
    },
  }),
  tallest: (r, sayKey = 'c.tallest.say') => ({
    test: (w, h) => {
      const mine = w.cell(h.x, h.z).s.length;
      return countNear(w, h.x, h.z, r, (c, dx, dz) => (dx || dz) && w.heightOf(c) >= mine) === 0;
    },
    get need() {
      return t('c.tallest.need', r);
    },
    get say() {
      return t(sayKey);
    },
  }),
  gardens: (n) => ({
    test: (w, h) => adjacent(w, h.x, h.z, 'garden').length >= n,
    get need() {
      return t('c.gardens.need', n);
    },
    get say() {
      return t('c.gardens.say', n);
    },
  }),
  road: () => ({
    test: (w, h) => adjacent(w, h.x, h.z, 'road').length >= 1,
    get need() {
      return t('c.road.need');
    },
    get say() {
      return t('c.road.say');
    },
  }),
  trees: (n, r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, groundIs('tree')) >= n,
    get need() {
      return t('c.trees.need', n, r);
    },
    get say() {
      return t('c.trees.say');
    },
  }),
  water: (r, sayKey = 'c.water.say') => ({
    test: (w, h) => countNear(w, h.x, h.z, r, (c) => c.water) > 0,
    get need() {
      return t('c.water.need', r);
    },
    get say() {
      return t(sayKey);
    },
  }),
  dock: (r, n = 1) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, groundIs('dock')) >= n,
    get need() {
      return t('c.dock.need', r, n);
    },
    get say() {
      return t('c.dock.say');
    },
  }),
  lamp: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, groundIs('lamp')) > 0,
    get need() {
      return t('c.lamp.need', r);
    },
    get say() {
      return t('c.lamp.say');
    },
  }),
  shop: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, baseIs('shop')) > 0,
    get need() {
      return t('c.shop.need', r);
    },
    get say() {
      return t('c.shop.say');
    },
  }),
  workshop: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, baseIs('workshop')) > 0,
    get need() {
      return t('c.workshop.need', r);
    },
    get say() {
      return t('c.workshop.say');
    },
  }),
  quiet: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, noisy) === 0,
    get need() {
      return t('c.quiet.need', r);
    },
    get say() {
      return t('c.quiet.say');
    },
  }),
  sunny: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, (c) => w.heightOf(c) >= 3) === 0,
    get need() {
      return t('c.sunny.need', r);
    },
    get say() {
      return t('c.sunny.say');
    },
  }),
  joined: () => ({
    test: (w, h) => [0, 1, 2, 3].some((d) => w.connected(h.x, h.z, h.level, d)),
    get need() {
      return t('c.joined.need');
    },
    get say() {
      return t('c.joined.say');
    },
  }),
  alone: () => ({
    test: (w, h) => countNear(w, h.x, h.z, 1, (c, dx, dz) => (dx || dz) && c.s.length > 0) === 0,
    get need() {
      return t('c.alone.need');
    },
    get say() {
      return t('c.alone.say');
    },
  }),
  // r 格以内有 n 个某种东西（地面物件或建筑都行）。key：这句话在文字表里的键（<key>.need、<key>.say）；
  // 只用来当隐藏心愿的条件不会显示出来，不用给
  near: (type, r, key = '', n = 1) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, has(type)) >= n,
    get need() {
      return key ? t(`${key}.need`) : '';
    },
    get say() {
      return key ? t(`${key}.say`) : '';
    },
  }),
  // ---- 颜色 ----
  // 自己这间房的墙是第 k 种颜色
  wallIs: (k) => ({
    test: (w, h) => blockAt(w, h).c === k,
    get need() {
      return t('c.wallIs.need', k);
    },
    get say() {
      return t('c.wallIs.say', k);
    },
  }),
  // 这栋楼的屋顶是第 k 种颜色
  roofIs: (k) => ({
    test: (w, h) => w.roofOf(w.cell(h.x, h.z)) === k,
    get need() {
      return t('c.roofIs.need', k);
    },
    get say() {
      return t('c.roofIs.say', k);
    },
  }),
  // 同层有紧挨着的房间，而且墙色都和自己不一样
  wallUnlike: () => ({
    test: (w, h) => {
      const mine = blockAt(w, h).c;
      const side = sideRooms(w, h);
      return side.length > 0 && side.every((b) => b.c !== mine);
    },
    get need() {
      return t('c.wallUnlike.need');
    },
    get say() {
      return t('c.wallUnlike.say');
    },
  }),
  // 和同层紧挨着的某一间刷成了同一种颜色，而且不是没刷过的白墙
  wallPair: () => ({
    test: (w, h) => {
      const mine = blockAt(w, h).c;
      return mine !== WALL_DEFAULT && sideRooms(w, h).some((b) => b.c === mine);
    },
    get need() {
      return t('c.wallPair.need');
    },
    get say() {
      return t('c.wallPair.say');
    },
  }),
  // 紧挨着有别的坡屋顶，而且颜色都和自己这栋不一样
  roofUnlike: () => ({
    test: (w, h) => {
      const mine = w.roofOf(w.cell(h.x, h.z));
      const side = sideRoofs(w, h);
      return mine >= 0 && side.length > 0 && side.every((r) => r !== mine);
    },
    get need() {
      return t('c.roofUnlike.need');
    },
    get say() {
      return t('c.roofUnlike.say');
    },
  }),
  // 全岛只有自己这一栋是这种颜色的屋顶（只当隐藏心愿用）
  roofUnique: () => ({
    test: (w, h) => {
      const home = w.cell(h.x, h.z);
      const mine = w.roofOf(home);
      return mine >= 0 && !w.cells.some((c) => c !== home && w.roofOf(c) === mine);
    },
    need: '',
    say: '',
  }),
  // 屋顶和隔壁连成一片，而且不是没刷过的红顶（只当隐藏心愿用）
  roofRow: () => ({
    test: (w, h) => w.roofOf(w.cell(h.x, h.z)) !== ROOF_DEFAULT && [0, 1, 2, 3].some((d) => w.roofJoin(h.x, h.z, d)),
    need: '',
    say: '',
  }),
  // r 格以内有别的楼是第 k 种颜色的屋顶
  roofNear: (k, r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, (c, dx, dz) => (dx || dz) && w.roofOf(c) === k) > 0,
    get need() {
      return t('c.roofNear.need', k, r);
    },
    get say() {
      return t('c.roofNear.say', k);
    },
  }),
  // r 格以内（连自己这栋）有 n 种颜色的屋顶
  roofKinds: (n, r) => ({
    test: (w, h) => {
      const seen = new Set();
      countNear(w, h.x, h.z, r, (c) => {
        const k = w.roofOf(c);
        if (k >= 0) seen.add(k);
        return false;
      });
      return seen.size >= n;
    },
    get need() {
      return t('c.roofKinds.need', n, r);
    },
    get say() {
      return t('c.roofKinds.say');
    },
  }),
  fields: (n) => ({
    test: (w, h) => adjacent(w, h.x, h.z, 'field').length >= n,
    get need() {
      return t('c.fields.need', n);
    },
    get say() {
      return t('c.fields.say', n);
    },
  }),
  // 紧挨着 n 个某种地面物件。key：这句话在文字表里的键
  beside: (type, n, key) => ({
    test: (w, h) => adjacent(w, h.x, h.z, type).length >= n,
    get need() {
      return t(`${key}.need`);
    },
    get say() {
      return t(`${key}.say`);
    },
  }),
  // ---- 路 ----
  // 从家门口顺着路（和桥）一直走，走得到某样东西旁边。只当隐藏心愿用的时候不用给 key
  linked: (type, key = '') => ({
    test: (w, h) => roadReach(w, h.x, h.z, has(type)),
    get need() {
      return key ? t(`${key}.need`) : '';
    },
    get say() {
      return key ? t(`${key}.say`) : '';
    },
  }),
  // 住在路的尽头：门口那格路只通向一边（或者孤零零的一格）
  deadEnd: () => ({
    test: (w, h) =>
      DIRS.some((d) => {
        const px = h.x + d.x;
        const pz = h.z + d.z;
        if (!isPath(w.cell(px, pz))) return false;
        return DIRS.filter((e) => isPath(w.cell(px + e.x, pz + e.z))).length <= 1;
      }),
    get need() {
      return t('c.deadEnd.need');
    },
    get say() {
      return t('c.deadEnd.say');
    },
  }),
  // 阳台正对着某样东西：朝阳台的方向 range 格以内有它，中间没有更高的楼挡着
  faces: (type, range, key) => ({
    test: (w, h) => {
      for (let k = 1; k <= range; k++) {
        const n = w.cell(h.x + DIRS[h.dir].x * k, h.z + DIRS[h.dir].z * k);
        if (!n) return false;
        if (has(type)(n)) return true;
        if (w.heightOf(n) > h.level) return false;
      }
      return false;
    },
    get need() {
      return t(`${key}.need`);
    },
    get say() {
      return t(`${key}.say`);
    },
  }),
  // 四面里至少有 n 面是空着的水面（岛外也算）
  waterSides: (n) => ({
    test: (w, h) =>
      DIRS.filter((d) => {
        const c = w.cell(h.x + d.x, h.z + d.z);
        return !c || (c.water && !c.g && !c.s.length);
      }).length >= n,
    get need() {
      return t('c.waterSides.need', n);
    },
    get say() {
      return t('c.waterSides.say');
    },
  }),
};

// ---------- 住处类型 ----------

const HOMES = {
  balcony(w, each) {
    scan(w, (c, x, z) => {
      c.s.forEach((b, i) => {
        if (b.t !== 'room') return;
        for (let d = 0; d < 4; d++) if (b.b[d]) each({ x, z, level: i, dir: d });
      });
    });
  },
  ground(w, each) {
    scan(w, (c, x, z) => {
      if (c.s[0] && c.s[0].t === 'room') each({ x, z, level: 0 });
    });
  },
  room(w, each) {
    scan(w, (c, x, z) => {
      c.s.forEach((b, i) => {
        if (b.t === 'room') each({ x, z, level: i });
      });
    });
  },
  tower(w, each) {
    scan(w, (c, x, z) => {
      const n = c.s.length;
      if (n && c.s[n - 1].t === 'tower') each({ x, z, level: n - 1 });
    });
  },
  overShop(w, each) {
    scan(w, (c, x, z) => {
      if (c.s[0] && c.s[0].t === 'shop' && c.s[1] && c.s[1].t === 'room') each({ x, z, level: 1 });
    });
  },
  overWorkshop(w, each) {
    scan(w, (c, x, z) => {
      if (c.s[0] && c.s[0].t === 'workshop' && c.s[1] && c.s[1].t === 'room') each({ x, z, level: 1 });
    });
  },
  overLibrary(w, each) {
    scan(w, (c, x, z) => {
      if (c.s[0] && c.s[0].t === 'library' && c.s[1] && c.s[1].t === 'room') each({ x, z, level: 1 });
    });
  },
  // 顶上有露台的那间房间
  terrace(w, each) {
    scan(w, (c, x, z) => {
      const n = c.s.length;
      if (n >= 2 && c.s[n - 1].t === 'terrace' && c.s[n - 2].t === 'room') each({ x, z, level: n - 2 });
    });
  },
  stilt(w, each) {
    scan(w, (c, x, z) => {
      if (c.s[0] && c.s[0].t === 'stilt') each({ x, z, level: 0 });
    });
  },
};

function scan(w, fn) {
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) fn(w.cell(x, z), x, z);
}

const keyOf = (h) => `${h.x},${h.z},${h.level}`;

// ---------- 居民模板 ----------
// recipe(x, z)：在某个空位上最省事的几种盖法，用来在居民到来前确认"岛上盖得出来"
// look：小人和头像的样子。body 衣服、hair 头发、style 发型、hat 帽子、tint 帽子（草帽是帽带）的颜色
// 名字和台词在文字表里（res.<id>.name / wish / ask / almost / happy），模板定义完之后统一接上

const around = (x, z, fn) => DIRS.map((d, k) => fn(x + d.x, z + d.z, k));
const balconyRecipe = (d) => (x, z) => [[['room', x, z], ['room', x, z], ['balcony', x, z, { level: 1, dir: d }]]];
const roadRecipe = (x, z) => [[['room', x, z]], ...around(x, z, (rx, rz) => [['room', x, z], ['road', rx, rz]])];

export const ARCHETYPES = {
  tang: {
    look: { body: '#ef8f7a', hair: '#6b4a3a', style: 'bun' },
    home: 'balcony',
    tall: true,
    perchAt: [0.44, 0.66],
    must: [cond.facing(3)],
    want: [cond.openView(3), cond.minLevel(2, 's.tang.high')],
    dream: cond.shop(2),
    recipe: balconyRecipe(3),
  },
  mo: {
    look: { body: '#6f9fc0', hair: '#d9d2c4', hat: 'straw', tint: '#4f7fa6' },
    home: 'ground',
    tends: 'garden',
    calm: true,
    sun: true,
    must: [cond.gardens(1)],
    want: [cond.quiet(3), cond.sunny(2), cond.gardens(2)],
    dream: cond.water(2),
    recipe: (x, z) => around(x, z, (gx, gz) => [['room', x, z], ['garden', gx, gz]]),
  },
  chen: {
    look: { body: '#f2b84b', hair: '#8a5a3a', style: 'short' },
    home: 'balcony',
    perchAt: [0, 0.14],
    must: [cond.facing(1)],
    want: [cond.openView(1), cond.gardens(1)],
    dream: cond.topFloor(),
    recipe: balconyRecipe(1),
  },
  gui: {
    look: { body: '#c98bb0', hair: '#5a4038', style: 'bun' },
    home: 'overShop',
    loud: true,
    needs: ['shop', 'lamp'],
    must: [],
    want: [cond.road(), cond.lamp(2)],
    dream: cond.dock(3),
    recipe: (x, z) => [[['shop', x, z], ['room', x, z]]],
  },
  tie: {
    look: { body: '#8a8f98', hair: '#4a4038', hat: 'cap' },
    home: 'overWorkshop',
    loud: true,
    needs: ['workshop'],
    must: [],
    want: [cond.road(), cond.water(3, 's.tie.water')],
    dream: cond.lamp(1),
    recipe: (x, z) => [[['workshop', x, z], ['room', x, z]]],
  },
  xing: {
    look: { body: '#6a6fb5', hair: '#3b3350', hat: 'cone' },
    home: 'tower',
    tall: true,
    peak: true,
    needs: ['tower'],
    must: [cond.height(3)],
    want: [cond.tallest(3, 's.xing.tallest'), cond.height(4)],
    dream: cond.height(5),
    recipe: (x, z) => [[['tower', x, z], ['tower', x, z], ['tower', x, z]]],
  },
  chao: {
    look: { body: '#4fa3a0', hair: '#3b2f2a', hat: 'straw', tint: '#3b5a7a' },
    home: 'ground',
    needs: ['dock'],
    must: [cond.dock(2)],
    want: [cond.road(), cond.water(1, 's.doorWater')],
    dream: cond.dock(3, 2),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (dx, dz) => [['room', x, z], ['dock', dx, dz]])],
  },
  nao: {
    look: { body: '#f08c5a', hair: '#3b2f2a', style: 'short' },
    home: 'room',
    loud: true,
    needs: ['shop'],
    must: [cond.shop(2)],
    want: [cond.joined(), cond.road()],
    dream: cond.workshop(3),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (sx, sz) => [['room', x, z], ['shop', sx, sz]])],
  },
  song: {
    look: { body: '#7f9a6a', hair: '#ece8de', style: 'short' },
    home: 'ground',
    calm: true,
    must: [cond.alone()],
    want: [cond.trees(2, 2), cond.quiet(3)],
    dream: cond.trees(4, 2),
    recipe: (x, z) => [[['room', x, z]]],
  },
  he: {
    look: { body: '#e9dfca', hair: '#5a4038', hat: 'beret' },
    home: 'balcony',
    tall: true,
    perchAt: [0.18, 0.42],
    must: [cond.facing(2)],
    want: [cond.waterView(2, 3), cond.gardens(1)],
    dream: cond.minLevel(2),
    recipe: balconyRecipe(2),
  },
  hua: {
    look: { body: '#e78fa6', hair: '#7a5236', style: 'bun' },
    home: 'ground',
    tends: 'garden',
    must: [cond.gardens(2)],
    want: [cond.gardens(3), cond.trees(1, 2)],
    dream: cond.gardens(4),
    recipe: (x, z) =>
      around(x, z, (gx, gz, k) => [
        ['room', x, z],
        ['garden', gx, gz],
        ['garden', x + DIRS[(k + 1) % 4].x, z + DIRS[(k + 1) % 4].z],
      ]),
  },
  yun: {
    look: { body: '#8fc4e8', hair: '#f0cf78', style: 'short' },
    home: 'room',
    tall: true,
    peak: true,
    must: [cond.topFloor(), cond.minLevel(2, 's.yun.low')],
    want: [cond.minLevel(3), cond.tallest(3)],
    dream: cond.minLevel(4),
    recipe: (x, z) => [[['room', x, z], ['room', x, z], ['room', x, z]]],
  },
  hai: {
    look: { body: '#59b8c9', hair: '#2f3a4a', style: 'short' },
    home: 'ground',
    needs: ['lamp'],
    must: [cond.water(1, 's.doorWater')],
    want: [cond.gardens(1), cond.lamp(2)],
    dream: cond.near('lighthouse', 3),
    recipe: (x, z) => [[['room', x, z]]],
  },
  shu: {
    look: { body: '#9a8266', hair: '#e8e2d6', hat: 'beret', tint: '#5f6f4a' },
    home: 'room',
    calm: true,
    needs: ['lamp'],
    must: [cond.minLevel(1, 's.shu.damp'), cond.quiet(3)],
    want: [cond.lamp(2), cond.trees(1, 2)],
    dream: cond.topFloor(),
    recipe: (x, z) => [[['room', x, z], ['room', x, z]]],
  },
  dou: {
    look: { body: '#f6c453', hair: '#5a3d2b', style: 'short' },
    home: 'room',
    loud: true,
    needs: ['lamp'],
    must: [cond.joined()],
    want: [cond.trees(1, 2), cond.lamp(2)],
    dream: cond.gardens(1),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (nx, nz) => [['room', x, z], ['room', nx, nz]])],
  },
  jing: {
    look: { body: '#a98fc2', hair: '#f0ece2', style: 'bun' },
    home: 'ground',
    calm: true,
    needs: ['well'],
    must: [cond.near('well', 1, 'n.jing.well')],
    want: [cond.gardens(1), cond.quiet(3)],
    dream: cond.near('field', 2),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (wx, wz) => [['room', x, z], ['well', wx, wz]])],
  },
  yubo: {
    look: { body: '#5f7fa8', hair: '#d8d2c6', hat: 'li' },
    home: 'balcony',
    perchAt: [0.04, 0.3],
    needs: ['dock', 'lamp'],
    must: [cond.waterFront(2)],
    want: [cond.dock(3), cond.lamp(2)],
    dream: cond.near('lighthouse', 4),
    recipe: (x, z) => [0, 1, 2, 3].map((d) => [['room', x, z], ['room', x, z], ['balcony', x, z, { level: 1, dir: d }]]),
  },
  tian: {
    look: { body: '#b8925a', hair: '#4a3a2c', hat: 'straw' },
    home: 'ground',
    tends: 'field',
    needs: ['field', 'well'],
    must: [cond.fields(2)],
    want: [cond.fields(3), cond.near('well', 2, 'n.tian.well')],
    dream: cond.near('windmill', 3),
    recipe: (x, z) =>
      around(x, z, (fx, fz, k) => [
        ['room', x, z],
        ['field', fx, fz],
        ['field', x + DIRS[(k + 1) % 4].x, z + DIRS[(k + 1) % 4].z],
      ]),
  },
  mai: {
    look: { body: '#e6c98a', hair: '#8a6a3c', style: 'bun' },
    home: 'room',
    needs: ['windmill', 'field'],
    must: [cond.near('windmill', 2, 'n.mai.windmill')],
    want: [cond.road(), cond.near('field', 2, 'n.mai.field')],
    dream: cond.shop(3),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (mx, mz) => [['room', x, z], ['windmill', mx, mz]])],
  },
  su: {
    look: { body: '#f3d9c0', hair: '#7a4a34', hat: 'cap', tint: '#f6f1e6' },
    home: 'overShop',
    loud: true,
    needs: ['shop', 'windmill', 'well'],
    must: [],
    want: [
      cond.near('windmill', 3, 'n.su.windmill'),
      cond.near('well', 2, 'n.su.well'),
    ],
    dream: cond.near('market', 3),
    recipe: (x, z) => [[['shop', x, z], ['room', x, z]]],
  },
  yu: {
    look: { body: '#a8794f', hair: '#3b2f2a', style: 'short' },
    home: 'overWorkshop',
    loud: true,
    needs: ['workshop'],
    must: [],
    want: [cond.trees(3, 2), cond.road()],
    dream: cond.near('pavilion', 2),
    recipe: (x, z) => [[['workshop', x, z], ['room', x, z]]],
  },
  jue: {
    look: { body: '#7fbf8f', hair: '#3f5a3a', style: 'bun' },
    home: 'ground',
    needs: ['greenhouse'],
    must: [cond.near('greenhouse', 1, 'n.jue.greenhouse')],
    want: [cond.gardens(1), cond.trees(2, 2)],
    dream: cond.near('fountain', 3),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (gx, gz) => [['room', x, z], ['greenhouse', gx, gz]])],
  },
  yin: {
    look: { body: '#c9c2e6', hair: '#4a4060', style: 'short' },
    home: 'ground',
    calm: true,
    needs: ['pavilion'],
    must: [cond.near('pavilion', 1, 'n.yin.pavilion')],
    want: [cond.water(2, 's.yin.water'), cond.trees(2, 2)],
    dream: cond.quiet(3),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (px, pz) => [['room', x, z], ['pavilion', px, pz]])],
  },
  fu: {
    look: { body: '#e39a4f', hair: '#3b2f2a', hat: 'cap', tint: '#5f8a5a' },
    home: 'room',
    loud: true,
    needs: ['market', 'lamp'],
    must: [cond.near('market', 2, 'n.fu.market')],
    want: [cond.road(), cond.lamp(2)],
    dream: cond.shop(2),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (mx, mz) => [['room', x, z], ['market', mx, mz]])],
  },
  di: {
    look: { body: '#d98fb0', hair: '#f0e0b8', hat: 'beret', tint: '#6a5fa8' },
    home: 'balcony',
    calm: true,
    perchAt: [0.36, 0.56],
    needs: ['fountain', 'lamp'],
    must: [cond.quiet(2)],
    want: [cond.near('fountain', 3, 'n.di.fountain'), cond.lamp(2)],
    dream: cond.near('pavilion', 2),
    recipe: balconyRecipe(2),
  },
  deng: {
    look: { body: '#4f6f8f', hair: '#e8e2d6', hat: 'cap', tint: '#2f3a4a' },
    home: 'ground',
    calm: true,
    tall: true,
    needs: ['lighthouse'],
    must: [cond.near('lighthouse', 1, 'n.deng.lighthouse')],
    want: [cond.water(1, 's.deng.water'), cond.quiet(2)],
    dream: cond.dock(2),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (lx, lz) => [['room', x, z], ['lighthouse', lx, lz]])],
  },
  // ---- 在意颜色的居民（hue：自己对颜色有主意，不会再冒出"想换个墙色"的新想法）。
  // 颜色都不放在必须条件里：颜色不合意也住得下，只是到不了更高的评价 ----
  cai: {
    look: { body: '#f2a65a', hair: '#4a3a2c', hat: 'beret', tint: '#3f9f9a' },
    home: 'room',
    hue: true,
    needs: ['paint'],
    must: [cond.joined()],
    want: [cond.wallUnlike()],
    dream: cond.roofUnique(),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (nx, nz) => [['room', x, z], ['room', nx, nz]])],
  },
  qi: {
    look: { body: '#9fb8d8', hair: '#3b2f2a', style: 'short' },
    home: 'ground',
    hue: true,
    needs: ['paint'],
    must: [cond.road()],
    want: [cond.wallPair()],
    dream: cond.roofRow(),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (rx, rz) => [['room', x, z], ['road', rx, rz]])],
  },
  hong: {
    look: { body: '#e86f8a', hair: '#f0cf78', style: 'bun' },
    home: 'balcony',
    hue: true,
    perchAt: [0.3, 0.5],
    needs: ['paint'],
    must: [cond.facing(0)],
    want: [cond.roofKinds(3, 2)],
    dream: cond.wallIs(2),
    recipe: balconyRecipe(0),
  },
  lan: {
    look: { body: '#4f86c6', hair: '#e8e2d6', hat: 'cap', tint: '#3f6fb0' },
    home: 'ground',
    hue: true,
    needs: ['paint'],
    must: [cond.water(2, 's.lan.water')],
    want: [cond.roofNear(4, 2)],
    dream: cond.roofIs(0),
    recipe: (x, z) => [[['room', x, z]]],
  },
  mei: {
    look: { body: '#d98a9a', hair: '#ece8de', style: 'bun' },
    home: 'room',
    calm: true,
    hue: true,
    needs: ['paint'],
    must: [cond.quiet(2)],
    want: [cond.trees(1, 2)],
    dream: cond.wallIs(1),
    recipe: (x, z) => [[['room', x, z]]],
  },
  zi: {
    look: { body: '#9a7fc8', hair: '#3b3350', style: 'short' },
    home: 'room',
    hue: true,
    needs: ['paint'],
    must: [cond.topFloor()],
    want: [cond.roofUnlike()],
    dream: cond.roofIs(5),
    recipe: (x, z) => [[['room', x, z]]],
  },
  // ---- 和路有关的居民：看的不是"旁边有没有"，而是"顺着路走不走得到" ----
  wan: {
    look: { body: '#b7a58a', hair: '#ece8de', style: 'bun' },
    home: 'ground',
    calm: true,
    must: [cond.deadEnd()],
    want: [cond.quiet(2), cond.trees(1, 2)],
    dream: cond.near('orchard', 2),
    recipe: roadRecipe,
  },
  xin: {
    look: { body: '#5aa06f', hair: '#3b2f2a', hat: 'cap', tint: '#2f6f4a' },
    home: 'room',
    needs: ['shop', 'well'],
    must: [cond.road()],
    want: [cond.linked('shop', 'n.xin.shop'), cond.linked('well', 'n.xin.well')],
    dream: cond.linked('dock'),
    recipe: roadRecipe,
  },
  qiao: {
    look: { body: '#c98f5a', hair: '#4a3a2c', hat: 'straw', tint: '#d9503f' },
    home: 'ground',
    needs: ['bridge', 'dock'],
    must: [cond.road()],
    want: [cond.linked('dock', 'n.qiao.dock'), cond.near('bridge', 2, 'n.qiao.bridge')],
    dream: cond.water(1),
    recipe: roadRecipe,
  },
  // ---- 新组件带来的居民 ----
  guo: {
    look: { body: '#d9694f', hair: '#6b4a3a', hat: 'straw', tint: '#6f9a5a' },
    home: 'ground',
    needs: ['orchard', 'well'],
    must: [cond.beside('orchard', 1, 'n.guo.one')],
    want: [cond.beside('orchard', 2, 'n.guo.two'), cond.near('well', 2, 'n.guo.well')],
    dream: cond.near('market', 3),
    recipe: (x, z) => around(x, z, (ox, oz) => [['room', x, z], ['orchard', ox, oz]]),
  },
  juan: {
    look: { body: '#7d8fb3', hair: '#5a4038', style: 'bun' },
    home: 'overLibrary',
    calm: true,
    needs: ['library', 'lamp'],
    must: [],
    want: [cond.quiet(2), cond.lamp(2)],
    dream: cond.near('pavilion', 3),
    recipe: (x, z) => [[['library', x, z], ['room', x, z]]],
  },
  wang: {
    look: { body: '#e6a0c0', hair: '#4a4060', style: 'bun' },
    home: 'balcony',
    perchAt: [0.2, 0.45],
    needs: ['fountain', 'lamp'],
    must: [cond.faces('fountain', 3, 'n.wang.fountain')],
    want: [cond.minLevel(2, 's.wang.high'), cond.lamp(2)],
    dream: cond.near('clock', 4),
    recipe: (x, z) =>
      [0, 1, 2, 3].map((d) => [
        ['room', x, z],
        ['room', x, z],
        ['balcony', x, z, { level: 1, dir: d }],
        ['fountain', x + DIRS[d].x, z + DIRS[d].z],
      ]),
  },
  lu: {
    look: { body: '#f0b7a0', hair: '#7a5236', style: 'short' },
    home: 'terrace',
    peak: true,
    needs: ['terrace'],
    must: [],
    want: [cond.tallest(2, 's.lu.tallest'), cond.gardens(1)],
    dream: cond.near('fountain', 3),
    recipe: (x, z) => [[['room', x, z], ['terrace', x, z]]],
  },
  ting: {
    look: { body: '#4f9fb0', hair: '#2f3a4a', hat: 'straw', tint: '#f4efe2' },
    home: 'stilt',
    needs: ['stilt', 'dock'],
    must: [],
    want: [cond.waterSides(3), cond.dock(2)],
    dream: cond.near('lighthouse', 4),
    recipe: (x, z) => around(x, z, (sx, sz) => [['stilt', sx, sz]]),
  },
  zhong: {
    look: { body: '#8c7a5a', hair: '#e8e2d6', hat: 'cap', tint: '#6f5a40' },
    home: 'ground',
    needs: ['clock', 'lamp'],
    must: [cond.near('clock', 1, 'n.zhong.clock')],
    want: [cond.road(), cond.lamp(2)],
    dream: cond.linked('market'),
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (cx, cz) => [['room', x, z], ['clock', cx, cz]])],
  },
};
for (const [id, a] of Object.entries(ARCHETYPES)) {
  a.id = id;
  if (!a.needs) a.needs = [];
  for (const k of ['name', 'wish', 'ask', 'almost', 'happy']) {
    Object.defineProperty(a, k, { get: () => t(`res.${id}.${k}`), enumerable: true });
  }
}

// 现在请得来的居民：需要的模块都解锁了，而且还没上岛
export function eligibleIds(unlocked, present) {
  return Object.keys(ARCHETYPES).filter((id) => !present.includes(id) && ARCHETYPES[id].needs.every((m) => unlocked.has(m)));
}

// ---------- 新想法 ----------
// bonus：{ k: 'near', type, r } | { k: 'friend', id } | { k: 'avoid', id } | { k: 'wall', c }（想把自己家的墙刷成第 c 种颜色）

const FRIEND_R = 3; // 想住得近：两家相隔不超过几格
const AVOID_R = 4; // 想住得远：两家至少隔开几格
// 可能冒出来的"想离某样东西近一点"
const NEAR_POOL = [
  { type: 'garden', r: 1 },
  { type: 'tree', r: 1 },
  { type: 'lamp', r: 2 },
  { type: 'well', r: 2 },
  { type: 'field', r: 2 },
  { type: 'pavilion', r: 2 },
  { type: 'dock', r: 3 },
  { type: 'fountain', r: 3 },
  { type: 'greenhouse', r: 3 },
  { type: 'windmill', r: 3 },
  { type: 'shop', r: 3, noisy: true },
  { type: 'market', r: 3, noisy: true },
  { type: 'lighthouse', r: 4, tall: true },
  { type: 'bridge', r: 2 },
  { type: 'orchard', r: 2 },
  { type: 'library', r: 3 },
  { type: 'clock', r: 4 },
];

// 两位居民的愿望会不会互相打架：一个怕吵一个带来吵闹，或者一个要住高楼、另一个怕被高楼挡住
function clash(a, b) {
  return (
    (a.calm && b.loud) || (a.loud && b.calm) || (a.sun && b.tall) || (a.tall && b.sun) || (a.peak && b.tall) || (a.tall && b.peak)
  );
}

// 这位居民的新想法是不是和自己或对方的愿望冲突（旧存档里可能有，读档时去掉重想）
export function bonusConflicts(roster, r) {
  const b = r.bonus;
  if (!b) return false;
  if (b.k === 'wall') return !PAINTS.includes(b.c) || !!r.spec.hue;
  if (b.k === 'near') {
    const o = NEAR_POOL.find((n) => n.type === b.type);
    return !o || (o.noisy && !!r.spec.calm) || (o.tall && !!(r.spec.sun || r.spec.peak));
  }
  if (b.k !== 'friend') return false;
  const other = roster.find((x) => x.spec.id === b.id);
  return !other || !!clash(r.spec, other.spec);
}

function bonusMet(w, b, h, homes) {
  if (b.k === 'near') return countNear(w, h.x, h.z, b.r, has(b.type)) > 0;
  if (b.k === 'wall') {
    const blk = blockAt(w, h);
    return !!blk && blk.t === 'room' && blk.c === b.c;
  }
  const other = homes.get(b.id);
  if (b.k === 'friend') return !!other && cheb(h, other) <= FRIEND_R;
  return !other || cheb(h, other) >= AVOID_R;
}

function bonusInfo(b) {
  if (b.k === 'wall') return { text: t('bonus.wall.text', b.c), say: t('bonus.wall.say', b.c), doneSay: t('bonus.wall.done', b.c) };
  if (b.k === 'near') {
    return { text: t('bonus.near.text', b.type, b.r), say: t('bonus.near.say', b.type), doneSay: t('bonus.near.done', b.type) };
  }
  const name = ARCHETYPES[b.id] ? ARCHETYPES[b.id].name : t('neighbor');
  if (b.k === 'friend') {
    return { text: t('bonus.friend.text', name, FRIEND_R), say: t('bonus.friend.say', name), doneSay: t('bonus.friend.done', name) };
  }
  return { text: t('bonus.avoid.text', name, AVOID_R), say: t('bonus.avoid.say', name), doneSay: t('bonus.avoid.done') };
}

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 给第 i 位居民想一个现在还没实现的新想法；实在想不出来就返回 null
export function makeBonus(w, roster, results, i, unlocked) {
  const me = roster[i].spec;
  const home = results[i].home;
  if (!home) return null;
  const others = [];
  results.forEach((r, j) => {
    if (j !== i && r.home) others.push({ spec: roster[j].spec, d: cheb(home, r.home) });
  });

  const near = NEAR_POOL.filter(
    (o) =>
      unlocked.has(o.type) &&
      !(o.noisy && me.calm) &&
      !(o.tall && (me.sun || me.peak)) &&
      countNear(w, home.x, home.z, o.r, has(o.type)) === 0,
  );
  const friends = others
    .filter((o) => o.d > FRIEND_R && !clash(me, o.spec))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const avoid = me.calm ? others.filter((o) => o.spec.loud && o.d < AVOID_R - 1) : [];

  // 想给自己家的墙换个颜色：粉刷解锁以后才会有，对颜色另有主意的居民不会想这个
  const mine = blockAt(w, home);
  const canPaint = unlocked.has('paint') && !me.hue && !!mine && mine.t === 'room';
  const repaint = () => ({ k: 'wall', c: pickOne(PAINTS.filter((c) => c !== mine.c && c !== WALL_DEFAULT)) });

  const roll = Math.random();
  if (canPaint && roll > 0.8) return repaint();
  if (avoid.length && roll < 0.15) return { k: 'avoid', id: pickOne(avoid).spec.id };
  if (friends.length && (roll < 0.38 || !near.length)) return { k: 'friend', id: pickOne(friends).spec.id };
  if (near.length) {
    const o = pickOne(near);
    return { k: 'near', type: o.type, r: o.r };
  }
  return canPaint ? repaint() : null;
}

// ---------- 评估 ----------

// 每一档的分值是递减的：让更多人住下，比让一个人更满意要紧
const TIER_SCORE = [0, 1000, 1400, 1600];
const BONUS_SCORE = 60;

// 一位居民在岛上所有"必须条件都满足"的住处，以及差一点的那些
// bonus、homes：这位居民的新想法，以及其他人现在住在哪（用来让他优先挑能实现新想法的住处）
function candidates(w, spec, bonus, homes) {
  const ok = new Map();
  let partial = null;
  HOMES[spec.home](w, (h) => {
    const failMust = spec.must.filter((c) => !c.test(w, h));
    if (failMust.length) {
      if (!partial || failMust.length < partial.length) partial = failMust;
      return;
    }
    const failWant = spec.want.filter((c) => !c.test(w, h));
    let tier = failWant.length ? 1 : 2;
    if (tier === 2 && spec.dream.test(w, h)) tier = 3;
    let score = TIER_SCORE[tier] + (spec.want.length - failWant.length) * 20 + h.level;
    if (bonus && bonusMet(w, bonus, h, homes)) score += BONUS_SCORE;
    const k = keyOf(h);
    const cur = ok.get(k);
    if (!cur || score > cur.score) ok.set(k, { h, k, tier, score, failWant });
  });
  return { ok, partial };
}

// 匈牙利算法：cost[i][j] 是第 i 位居民住第 j 处的代价，返回总代价最小的分配
function assign(cost) {
  const n = cost.length;
  const m = cost[0].length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

function describe(w, spec, pick, cand) {
  const out = { id: spec.id, tier: 0, home: null, key: null, spot: null, bonus: null };
  if (!pick) {
    if (cand.ok.size) {
      out.need = [t('need.taken')];
      out.text = t('say.taken');
    } else if (cand.partial) {
      out.need = cand.partial.map((c) => c.need);
      out.text = cand.partial[0].say;
    } else {
      out.need = [t(`home.${spec.home}`)];
      out.text = spec.ask;
    }
    return out;
  }
  out.tier = pick.tier;
  out.home = pick.h;
  out.key = pick.k;
  if (spec.tends) out.spot = adjacent(w, pick.h.x, pick.h.z, spec.tends)[0] || null;
  if (pick.tier === 1) {
    out.need = pick.failWant.map((c) => c.need);
    out.text = pick.failWant[0].say;
  } else if (pick.tier === 2) {
    out.need = [t('need.almost')];
    out.text = spec.almost;
  } else {
    out.need = [t('need.happy')];
    out.text = spec.happy;
  }
  return out;
}

// roster：[{ spec, homeKey, bonus }]。homeKey 是居民现在住的地方，同等条件下不搬家。
// 住处按"全岛居民加起来最满意"来分配，所以给新居民盖的房子不会被老居民抢走。
export function evaluateAll(w, roster) {
  const n = roster.length;
  if (!n) return [];
  const prev = new Map();
  for (const r of roster) {
    if (!r.homeKey) continue;
    const [x, z] = r.homeKey.split(',').map(Number);
    prev.set(r.spec.id, { x, z });
  }
  const cands = roster.map((r) => candidates(w, r.spec, r.bonus, prev));
  const keys = [];
  const index = new Map();
  for (const c of cands) {
    for (const k of c.ok.keys()) {
      if (!index.has(k)) {
        index.set(k, keys.length);
        keys.push(k);
      }
    }
  }
  // 每位居民另有一列"暂时没地方住"，代价比任何真实住处都高
  const BIG = 1e6;
  const cost = roster.map((r, i) => {
    const row = new Array(keys.length + n).fill(BIG * 2);
    for (const [k, c] of cands[i].ok) row[index.get(k)] = BIG - c.score - (k === r.homeKey ? 10 : 0);
    for (let j = 0; j < n; j++) row[keys.length + j] = BIG;
    return row;
  });
  const picked = assign(cost);
  const results = roster.map((r, i) => {
    const j = picked[i];
    const pick = j >= 0 && j < keys.length ? cands[i].ok.get(keys[j]) : null;
    return describe(w, r.spec, pick || null, cands[i]);
  });
  // 新想法有没有实现，要等所有人都分好住处才知道
  const homes = new Map();
  for (const r of results) if (r.home) homes.set(r.id, r.home);
  results.forEach((res, i) => {
    const b = roster[i].bonus;
    if (b) res.bonus = { ...bonusInfo(b), done: !!res.home && bonusMet(w, b, res.home, homes) };
  });
  return results;
}

function applyOps(w, ops) {
  for (const [type, x, z, opt] of ops) {
    const r = w.check(type, x, z, opt || {});
    if (!r.ok) return false;
    w.apply(type, x, z, { ...opt, level: opt && opt.level !== undefined ? opt.level : r.level });
  }
  return true;
}

// 这位居民来了以后，岛上有没有地方让他至少"勉强"住下，同时不把已经住下的人挤走？
// 先看现成的空房，再在每个空位上试着按模板盖一遍。
export function canHouse(w, roster, results, spec) {
  const trialRoster = [...roster, { spec, homeKey: null, bonus: null }];
  const fits = (world) => {
    // 先只看新居民自己有没有合适的住处，没有就不必给全岛重新分房
    if (!candidates(world, spec, null, null).ok.size) return false;
    const res = evaluateAll(world, trialRoster);
    if (res[res.length - 1].tier < 1) return false;
    return results.every((r, i) => r.tier < 1 || res[i].tier >= 1);
  };
  if (fits(w)) return true;
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const c = w.cell(x, z);
      if (c.water || c.locked) continue;
      for (const ops of spec.recipe(x, z)) {
        const [t0, x0, z0, o0] = ops[0];
        if (!w.check(t0, x0, z0, o0 || {}).ok) continue; // 第一步就放不下，不用再试
        const trial = w.clone();
        if (applyOps(trial, ops) && fits(trial)) return true;
      }
    }
  }
  return false;
}
