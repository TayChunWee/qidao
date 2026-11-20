// 居民与愿望。只读取 World，不依赖渲染。
//
// 一个愿望 = 住处类型 + 必须条件 + 期望条件 + 一个隐藏的心愿。
//   勉强：有住处，必须条件都满足
//   满意：期望条件也都满足
//   惊喜：连隐藏的心愿也满足
// 每个住处只能住一位居民，按全岛居民加起来最满意的方式分配。
// 住得满意的居民过一阵会冒出一个"新想法"（想离某样东西或某个人近一点），实现了繁荣度再加 1。
import { SIZE, DIRS } from './config.js';

export const TIER_NAMES = ['等待中', '勉强', '满意', '惊喜'];
export const FIRST_RESIDENTS = ['tang', 'mo'];

const DN = ['北', '东', '南', '西'];
const CN = ['零', '一', '二', '三', '四', '五'];
// "几格内"的说法。格数按周围一圈一圈算，斜着的也算一格。
const within = (r) => `${['零', '一', '两', '三', '四', '五'][r]}格内`;

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

// ---------- 条件库 ----------
// 每个条件：test(世界, 住处) 是否满足；need 卡片上的提示；say 居民自己的说法

const cond = {
  facing: (d) => ({
    test: (w, h) => h.dir === d,
    need: `阳台要朝${DN[d]}`,
    say: `有阳台了，可惜不朝${DN[d]}。`,
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
    need: `${DN[d]}边${within(range)}有更高的楼挡着`,
    say: `${DN[d]}边有楼挡着，看不远。`,
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
    need: `阳台前方${within(range)}要能看到水`,
    say: '从阳台望出去，还看不到水。',
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
    need: `阳台正前方${within(range)}要是水面`,
    say: '阳台底下不是水，没法下竿。',
  }),
  minLevel: (k, say = '再高一点就好了。') => ({
    test: (w, h) => h.level >= k,
    need: `想住到${CN[k + 1]}层${k >= 4 ? '' : '以上'}`,
    say,
  }),
  topFloor: () => ({
    test: (w, h) => w.cell(h.x, h.z).s.length - 1 === h.level,
    need: '想住在最顶上那一层',
    say: '楼上还压着一层，我想住最顶上。',
  }),
  height: (k) => ({
    test: (w, h) => w.cell(h.x, h.z).s.length >= k,
    need: `塔楼要有${CN[k]}层高`,
    say: '塔还不够高。',
  }),
  tallest: (r, say = '旁边有楼比我这儿还高。') => ({
    test: (w, h) => {
      const mine = w.cell(h.x, h.z).s.length;
      return countNear(w, h.x, h.z, r, (c, dx, dz) => (dx || dz) && w.heightOf(c) >= mine) === 0;
    },
    need: `想比${within(r)}的建筑都高`,
    say,
  }),
  gardens: (n) => ({
    test: (w, h) => adjacent(w, h.x, h.z, 'garden').length >= n,
    need: n === 1 ? '房子旁边要有花园' : `想挨着${CN[n]}块花园`,
    say: n === 1 ? '门口要是有个花园就好了。' : '花园再大一点就好了，再添一块吧。',
  }),
  road: () => ({
    test: (w, h) => adjacent(w, h.x, h.z, 'road').length >= 1,
    need: '门口想通一条路',
    say: '门口要是有条路就方便了。',
  }),
  trees: (n, r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, groundIs('tree')) >= n,
    need: `${within(r)}想有${CN[n]}棵树`,
    say: '周围再多几棵树就好了。',
  }),
  water: (r, say = '有时候会想听听水声。') => ({
    test: (w, h) => countNear(w, h.x, h.z, r, (c) => c.water) > 0,
    need: r === 1 ? '想紧挨着水边' : `${within(r)}想有水`,
    say,
  }),
  dock: (r, n = 1) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, groundIs('dock')) >= n,
    need: n > 1 ? `${within(r)}想有${CN[n]}个码头` : `${within(r)}想有码头`,
    say: '离码头再近一点就好了。',
  }),
  lamp: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, groundIs('lamp')) > 0,
    need: r === 1 ? '想紧挨着一盏灯' : `${within(r)}想有一盏灯`,
    say: '晚上回家有点黑，要是有盏灯就好了。',
  }),
  shop: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, baseIs('shop')) > 0,
    need: `${within(r)}想有小店`,
    say: '要是附近能买到东西就好了。',
  }),
  workshop: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, baseIs('workshop')) > 0,
    need: `${within(r)}想有工坊`,
    say: '要是附近有间工坊就好了。',
  }),
  quiet: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, noisy) === 0,
    need: `${within(r)}不能有小店、工坊或集市`,
    say: '附近太吵了，想离店铺远一点。',
  }),
  sunny: (r) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, (c) => w.heightOf(c) >= 3) === 0,
    need: `${within(r)}不能有三层以上的建筑`,
    say: '旁边的楼太高，晒不到太阳。两格内别超过两层就好。',
  }),
  joined: () => ({
    test: (w, h) => [0, 1, 2, 3].some((d) => w.connected(h.x, h.z, h.level, d)),
    need: '想和隔壁的房间连在一起',
    say: '一个人住有点冷清，想挨着邻居。',
  }),
  alone: () => ({
    test: (w, h) => countNear(w, h.x, h.z, 1, (c, dx, dz) => (dx || dz) && c.s.length > 0) === 0,
    need: '周围一圈不能有别的房子',
    say: '邻居挨得太近了，想清静一点。',
  }),
  // r 格以内有 n 个某种东西（地面物件或建筑都行）
  near: (type, r, need, say, n = 1) => ({
    test: (w, h) => countNear(w, h.x, h.z, r, has(type)) >= n,
    need,
    say,
  }),
  fields: (n) => ({
    test: (w, h) => adjacent(w, h.x, h.z, 'field').length >= n,
    need: n === 1 ? '房子旁边要有菜地' : `想挨着${CN[n]}块菜地`,
    say: n <= 2 ? '屋旁要有两块地，才种得开。' : '地再多一块就好了。',
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
};

const HOME_NEED = {
  balcony: '需要一个阳台',
  ground: '需要一间底层的房间',
  room: '需要一间房间',
  tower: '需要一座塔楼',
  overShop: '需要小店楼上的一间房间',
  overWorkshop: '需要工坊楼上的一间房间',
};

function scan(w, fn) {
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) fn(w.cell(x, z), x, z);
}

const keyOf = (h) => `${h.x},${h.z},${h.level}`;

// ---------- 居民模板 ----------
// recipe(x, z)：在某个空位上最省事的几种盖法，用来在居民到来前确认"岛上盖得出来"

const around = (x, z, fn) => DIRS.map((d, k) => fn(x + d.x, z + d.z, k));
const balconyRecipe = (d) => (x, z) => [[['room', x, z], ['room', x, z], ['balcony', x, z, { level: 1, dir: d }]]];

export const ARCHETYPES = {
  tang: {
    name: '阿棠',
    look: { body: '#ef8f7a', hair: '#6b4a3a', style: 'bun' },
    wish: '想要一个能看日落的阳台',
    home: 'balcony',
    tall: true,
    perchAt: [0.44, 0.66],
    must: [cond.facing(3)],
    want: [cond.openView(3), cond.minLevel(2, '再高一点就好了，三层以上视野才开阔。')],
    dream: cond.shop(2),
    ask: '我想要一个朝西的阳台，傍晚可以看日落。',
    almost: '视野真好！要是附近能买到点心就更好了。',
    happy: '看着日落吃点心，没有比这更好的了。',
    recipe: balconyRecipe(3),
  },
  mo: {
    name: '老莫',
    look: { body: '#6f9fc0', hair: '#d9d2c4', hat: 'straw' },
    wish: '想要一间安静、带花园的小屋',
    home: 'ground',
    tends: 'garden',
    calm: true,
    sun: true,
    must: [cond.gardens(1)],
    want: [cond.quiet(3), cond.sunny(2), cond.gardens(2)],
    dream: cond.water(2),
    ask: '我想要一间安静的小屋，旁边有花园。',
    almost: '安安静静的，真好。有时候会想听听水声。',
    happy: '听着水声浇花，这就是我想要的日子。',
    recipe: (x, z) => around(x, z, (gx, gz) => [['room', x, z], ['garden', gx, gz]]),
  },
  chen: {
    name: '晨晨',
    look: { body: '#f2b84b', hair: '#8a5a3a', style: 'short' },
    wish: '想要一个能看日出的阳台',
    home: 'balcony',
    perchAt: [0, 0.14],
    must: [cond.facing(1)],
    want: [cond.openView(1), cond.gardens(1)],
    dream: cond.topFloor(),
    ask: '我想要一个朝东的阳台，早上起来看日出。',
    almost: '每天都能看到日出！要是能住在最顶上就更好了。',
    happy: '住在顶楼看日出，一整天都有精神。',
    recipe: balconyRecipe(1),
  },
  gui: {
    name: '桂姨',
    look: { body: '#c98bb0', hair: '#5a4038', style: 'bun' },
    wish: '想住在自己的小店楼上',
    home: 'overShop',
    loud: true,
    needs: ['shop', 'lamp'],
    must: [],
    want: [cond.road(), cond.lamp(2)],
    dream: cond.dock(3),
    ask: '我想开一家小店，自己就住在店的楼上。',
    almost: '生意不错！要是离码头近一点，进货就方便了。',
    happy: '码头就在旁边，进货再也不用跑远路。',
    recipe: (x, z) => [[['shop', x, z], ['room', x, z]]],
  },
  tie: {
    name: '铁叔',
    look: { body: '#8a8f98', hair: '#4a4038', hat: 'cap' },
    wish: '想住在工坊楼上',
    home: 'overWorkshop',
    loud: true,
    needs: ['workshop'],
    must: [],
    want: [cond.road(), cond.water(3, '打铁要用水，想离水边近一点。')],
    dream: cond.lamp(1),
    ask: '我想要一间工坊，楼下干活，楼上住人。',
    almost: '顺手多了。就是晚上收工的时候，门口有点黑。',
    happy: '门口亮堂堂的，收工回家心里踏实。',
    recipe: (x, z) => [[['workshop', x, z], ['room', x, z]]],
  },
  xing: {
    name: '阿星',
    look: { body: '#6a6fb5', hair: '#3b3350', hat: 'cone' },
    wish: '想住在高高的塔里看星星',
    home: 'tower',
    tall: true,
    peak: true,
    needs: ['tower'],
    must: [cond.height(3)],
    want: [cond.tallest(3, '旁边有楼比塔还高，挡住了星空。'), cond.height(4)],
    dream: cond.height(5),
    ask: '我想要一座高高的塔，夜里上去看星星。',
    almost: '离星星近多了！要是还能再高一点点……',
    happy: '这是岛上离星星最近的地方了。',
    recipe: (x, z) => [[['tower', x, z], ['tower', x, z], ['tower', x, z]]],
  },
  chao: {
    name: '阿潮',
    look: { body: '#4fa3a0', hair: '#3b2f2a', hat: 'straw' },
    wish: '想要一间靠着码头的小屋',
    home: 'ground',
    needs: ['dock'],
    must: [cond.dock(2)],
    want: [cond.road(), cond.water(1, '想推开门就是水。')],
    dream: cond.dock(3, 2),
    ask: '我想住在码头边上，出海方便。',
    almost: '出海很方便！要是能再多一个码头停船就好了。',
    happy: '两个码头，船再多也停得下。',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (dx, dz) => [['room', x, z], ['dock', dx, dz]])],
  },
  nao: {
    name: '闹闹',
    look: { body: '#f08c5a', hair: '#3b2f2a', style: 'short' },
    wish: '想住在热闹的街上',
    home: 'room',
    loud: true,
    needs: ['shop'],
    must: [cond.shop(2)],
    want: [cond.joined(), cond.road()],
    dream: cond.workshop(3),
    ask: '我喜欢热闹，想住在小店旁边。',
    almost: '真热闹！要是还能听到工坊叮叮当当的就更好了。',
    happy: '店铺、工坊、邻居，一样都不缺！',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (sx, sz) => [['room', x, z], ['shop', sx, sz]])],
  },
  song: {
    name: '松伯',
    look: { body: '#7f9a6a', hair: '#ece8de', style: 'short' },
    wish: '想要一间独门独户的小屋',
    home: 'ground',
    calm: true,
    must: [cond.alone()],
    want: [cond.trees(2, 2), cond.quiet(3)],
    dream: cond.trees(4, 2),
    ask: '我想一个人清清静静地住，周围别有别的房子。',
    almost: '清静。要是林子再密一些，就更像样了。',
    happy: '住在林子里，鸟叫比人声多。',
    recipe: (x, z) => [[['room', x, z]]],
  },
  he: {
    name: '青禾',
    look: { body: '#e9dfca', hair: '#5a4038', hat: 'beret' },
    wish: '想要一个朝南的阳台，对着水面画画',
    home: 'balcony',
    tall: true,
    perchAt: [0.18, 0.42],
    must: [cond.facing(2)],
    want: [cond.waterView(2, 3), cond.gardens(1)],
    dream: cond.minLevel(2),
    ask: '我想要一个朝南的阳台，对着水面画画。',
    almost: '水面的光真好看。要是能再高一点，就看得更远了。',
    happy: '从高处看水，颜色一层一层的，画不完。',
    recipe: balconyRecipe(2),
  },
  hua: {
    name: '花婶',
    look: { body: '#e78fa6', hair: '#7a5236', style: 'bun' },
    wish: '想住在花园中间',
    home: 'ground',
    tends: 'garden',
    must: [cond.gardens(2)],
    want: [cond.gardens(3), cond.trees(1, 2)],
    dream: cond.gardens(4),
    ask: '我想被花围着住，房子旁边至少要有两块花园。',
    almost: '到处都是花！要是四面都是花园，那才叫住在花园中间。',
    happy: '推开哪扇窗都是花，这就是我的家。',
    recipe: (x, z) =>
      around(x, z, (gx, gz, k) => [
        ['room', x, z],
        ['garden', gx, gz],
        ['garden', x + DIRS[(k + 1) % 4].x, z + DIRS[(k + 1) % 4].z],
      ]),
  },
  yun: {
    name: '云云',
    look: { body: '#8fc4e8', hair: '#f0cf78', style: 'short' },
    wish: '想住在顶楼，越高越好',
    home: 'room',
    tall: true,
    peak: true,
    must: [cond.topFloor(), cond.minLevel(2, '太矮了，至少要三层。')],
    want: [cond.minLevel(3), cond.tallest(3)],
    dream: cond.minLevel(4),
    ask: '我想住在顶楼，至少要三层高。',
    almost: '风景真好！不过我听说最高能盖到五层……',
    happy: '五层楼顶！整座岛都在脚下。',
    recipe: (x, z) => [[['room', x, z], ['room', x, z], ['room', x, z]]],
  },
  hai: {
    name: '海妹',
    look: { body: '#59b8c9', hair: '#2f3a4a', style: 'short' },
    wish: '想住在一推门就是水的地方',
    home: 'ground',
    needs: ['lamp'],
    must: [cond.water(1, '想推开门就是水。')],
    want: [cond.gardens(1), cond.lamp(2)],
    dream: cond.near('lighthouse', 3, '', ''),
    ask: '我想住在水边，一推门就能下水。',
    almost: '每天都能游一圈！夜里要是有座灯塔照着水面就更好了。',
    happy: '灯塔的光落在水上，夜里游泳也不怕了。',
    recipe: (x, z) => [[['room', x, z]]],
  },
  shu: {
    name: '书翁',
    look: { body: '#9a8266', hair: '#e8e2d6', hat: 'beret' },
    wish: '想在楼上有间安静的书房',
    home: 'room',
    calm: true,
    needs: ['lamp'],
    must: [cond.minLevel(1, '书怕潮，得住在二层以上。'), cond.quiet(3)],
    want: [cond.lamp(2), cond.trees(1, 2)],
    dream: cond.topFloor(),
    ask: '我想要一间楼上的书房，周围安安静静的。',
    almost: '读书的好地方。就是楼上有脚步声，要是住顶层就好了。',
    happy: '顶楼的书房，抬头就是天。',
    recipe: (x, z) => [[['room', x, z], ['room', x, z]]],
  },
  dou: {
    name: '豆豆',
    look: { body: '#f6c453', hair: '#5a3d2b', style: 'short' },
    wish: '想和邻居挨着住',
    home: 'room',
    loud: true,
    needs: ['lamp'],
    must: [cond.joined()],
    want: [cond.trees(1, 2), cond.lamp(2)],
    dream: cond.gardens(1),
    ask: '我不想一个人住！我要和邻居的房间连在一起。',
    almost: '可以去隔壁串门了！要是门口有花园能捉蝴蝶就更好了。',
    happy: '隔壁有邻居，门口有蝴蝶，太好啦！',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (nx, nz) => [['room', x, z], ['room', nx, nz]])],
  },
  jing: {
    name: '井婆婆',
    look: { body: '#a98fc2', hair: '#f0ece2', style: 'bun' },
    wish: '想住在水井旁边',
    home: 'ground',
    calm: true,
    needs: ['well'],
    must: [cond.near('well', 1, '房子要紧挨着水井', '打水要走好远，想紧挨着井住。')],
    want: [cond.gardens(1), cond.quiet(3)],
    dream: cond.near('field', 2, '', ''),
    ask: '我想守着一口水井住，出门就能打水。',
    almost: '井水真甜。要是旁边有块菜地，浇起来多顺手。',
    happy: '打水、浇菜，一天就这么过去了，挺好。',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (wx, wz) => [['room', x, z], ['well', wx, wz]])],
  },
  yubo: {
    name: '鱼伯',
    look: { body: '#5f7fa8', hair: '#d8d2c6', hat: 'straw' },
    wish: '想要一个能直接下竿的阳台',
    home: 'balcony',
    perchAt: [0.04, 0.3],
    needs: ['dock', 'lamp'],
    must: [cond.waterFront(2)],
    want: [cond.dock(3), cond.lamp(2)],
    dream: cond.near('lighthouse', 4, '', ''),
    ask: '我想要一个伸到水面上的阳台，坐着就能钓鱼。',
    almost: '今天又钓了三条。要是岛上有座灯塔，夜钓就更有意思了。',
    happy: '灯塔一亮，鱼都往这边游。',
    recipe: (x, z) => [0, 1, 2, 3].map((d) => [['room', x, z], ['room', x, z], ['balcony', x, z, { level: 1, dir: d }]]),
  },
  tian: {
    name: '田叔',
    look: { body: '#b8925a', hair: '#4a3a2c', hat: 'straw' },
    wish: '想要一间挨着菜地的农舍',
    home: 'ground',
    tends: 'field',
    needs: ['field', 'well'],
    must: [cond.fields(2)],
    want: [cond.fields(3), cond.near('well', 2, '两格内想有水井', '浇地要用水，附近有口井就好了。')],
    dream: cond.near('windmill', 3, '', ''),
    ask: '我想种地。给我一间小屋，旁边留两块菜地。',
    almost: '今年收成不错！要是有架风车磨面就更好了。',
    happy: '地里长庄稼，风车转悠悠，日子有奔头。',
    recipe: (x, z) =>
      around(x, z, (fx, fz, k) => [
        ['room', x, z],
        ['field', fx, fz],
        ['field', x + DIRS[(k + 1) % 4].x, z + DIRS[(k + 1) % 4].z],
      ]),
  },
  mai: {
    name: '麦子',
    look: { body: '#e6c98a', hair: '#8a6a3c', style: 'bun' },
    wish: '想住在风车旁边',
    home: 'room',
    needs: ['windmill', 'field'],
    must: [cond.near('windmill', 2, '两格内要有一架风车', '听不到风车转，心里不踏实。')],
    want: [cond.road(), cond.near('field', 2, '两格内想有菜地', '风车有了，可附近没有地，磨什么呢？')],
    dream: cond.shop(3),
    ask: '我是磨坊的人，想住在风车旁边。',
    almost: '面粉磨得又细又白。要是附近有家小店能代卖就好了。',
    happy: '磨好的面粉转眼就卖光了！',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (mx, mz) => [['room', x, z], ['windmill', mx, mz]])],
  },
  su: {
    name: '阿酥',
    look: { body: '#f3d9c0', hair: '#7a4a34', hat: 'cap' },
    wish: '想在小店楼上开面包房',
    home: 'overShop',
    loud: true,
    needs: ['shop', 'windmill', 'well'],
    must: [],
    want: [
      cond.near('windmill', 3, '三格内想有风车', '做面包要面粉，附近有架风车就好了。'),
      cond.near('well', 2, '两格内想有水井', '和面要用水，附近有口井就好了。'),
    ],
    dream: cond.near('market', 3, '', ''),
    ask: '我想开一家面包房，楼下卖面包，楼上住人。',
    almost: '刚出炉的最香！要是能拿去集市上卖就更好了。',
    happy: '集市上的人都说，闻着香味就找过来了。',
    recipe: (x, z) => [[['shop', x, z], ['room', x, z]]],
  },
  yu: {
    name: '阿榆',
    look: { body: '#a8794f', hair: '#3b2f2a', style: 'short' },
    wish: '想住在木工坊楼上',
    home: 'overWorkshop',
    loud: true,
    needs: ['workshop'],
    must: [],
    want: [cond.trees(3, 2), cond.road()],
    dream: cond.near('pavilion', 2, '', ''),
    ask: '我是木匠，想要一间工坊，楼上住人。',
    almost: '木料够用了。真想亲手盖一座凉亭摆在旁边。',
    happy: '这座凉亭，榫卯都是我自己打的。',
    recipe: (x, z) => [[['workshop', x, z], ['room', x, z]]],
  },
  jue: {
    name: '小蕨',
    look: { body: '#7fbf8f', hair: '#3f5a3a', style: 'bun' },
    wish: '想住在温室隔壁',
    home: 'ground',
    needs: ['greenhouse'],
    must: [cond.near('greenhouse', 1, '房子要紧挨着温室', '我的苗离不开人，想紧挨着温室住。')],
    want: [cond.gardens(1), cond.trees(2, 2)],
    dream: cond.near('fountain', 3, '', ''),
    ask: '我养了好多怕冷的花草，想住在温室隔壁。',
    almost: '苗都活了！空气再湿润一点就好了，比如有座喷泉。',
    happy: '喷泉的水汽飘过来，叶子都舒展开了。',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (gx, gz) => [['room', x, z], ['greenhouse', gx, gz]])],
  },
  yin: {
    name: '阿吟',
    look: { body: '#c9c2e6', hair: '#4a4060', style: 'short' },
    wish: '想住在凉亭旁边写诗',
    home: 'ground',
    calm: true,
    needs: ['pavilion'],
    must: [cond.near('pavilion', 1, '房子要紧挨着凉亭', '没有凉亭，诗兴都没处安放。')],
    want: [cond.water(2, '写诗的时候想听着水声。'), cond.trees(2, 2)],
    dream: cond.quiet(3),
    ask: '我想住在凉亭旁边，坐在里面写诗。',
    almost: '有水有树，句子自己就来了。只是附近再安静些就好了。',
    happy: '静得能听见落叶。今天写了三首。',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (px, pz) => [['room', x, z], ['pavilion', px, pz]])],
  },
  fu: {
    name: '阿福',
    look: { body: '#e39a4f', hair: '#3b2f2a', hat: 'cap' },
    wish: '想住在集市旁边',
    home: 'room',
    loud: true,
    needs: ['market', 'lamp'],
    must: [cond.near('market', 2, '两格内要有集市', '我是摆摊的，得住在集市旁边。')],
    want: [cond.road(), cond.lamp(2)],
    dream: cond.shop(2),
    ask: '我是摆摊的，想住在集市旁边，出门就开张。',
    almost: '今天又卖空了！旁边要是再开家小店，就成一条街了。',
    happy: '集市连着小店，整条街都是吆喝声！',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (mx, mz) => [['room', x, z], ['market', mx, mz]])],
  },
  di: {
    name: '阿笛',
    look: { body: '#d98fb0', hair: '#f0e0b8', hat: 'beret' },
    wish: '想要一个能安静吹笛子的阳台',
    home: 'balcony',
    calm: true,
    perchAt: [0.36, 0.56],
    needs: ['fountain', 'lamp'],
    must: [cond.quiet(2)],
    want: [cond.near('fountain', 3, '三格内想有喷泉', '想和着喷泉的水声吹笛子。'), cond.lamp(2)],
    dream: cond.near('pavilion', 2, '', ''),
    ask: '我想要一个阳台，傍晚在上面吹笛子，周围别太吵。',
    almost: '水声和笛声很配。要是楼下有座凉亭，就有人坐着听了。',
    happy: '凉亭里坐满了听笛子的人。',
    recipe: balconyRecipe(2),
  },
  deng: {
    name: '老灯',
    look: { body: '#4f6f8f', hair: '#e8e2d6', hat: 'cap' },
    wish: '想守着一座灯塔',
    home: 'ground',
    calm: true,
    tall: true,
    needs: ['lighthouse'],
    must: [cond.near('lighthouse', 1, '房子要紧挨着灯塔', '我得紧挨着灯塔住，夜里好上去点灯。')],
    want: [cond.water(1, '想住得离水再近一点。'), cond.quiet(2)],
    dream: cond.dock(2),
    ask: '我守了一辈子灯塔。给我一间紧挨着灯塔的小屋就行。',
    almost: '灯每晚都亮着。要是旁边有个码头，就能看着船回来了。',
    happy: '船顺着灯光回来，稳稳靠上码头。',
    recipe: (x, z) => [[['room', x, z]], ...around(x, z, (lx, lz) => [['room', x, z], ['lighthouse', lx, lz]])],
  },
};
for (const [id, a] of Object.entries(ARCHETYPES)) {
  a.id = id;
  if (!a.needs) a.needs = [];
}

// 现在请得来的居民：需要的模块都解锁了，而且还没上岛
export function eligibleIds(unlocked, present) {
  return Object.keys(ARCHETYPES).filter((id) => !present.includes(id) && ARCHETYPES[id].needs.every((m) => unlocked.has(m)));
}

// ---------- 新想法 ----------
// bonus：{ k: 'near', type, r } | { k: 'friend', id } | { k: 'avoid', id }

const FRIEND_R = 3; // 想住得近：两家相隔不超过几格
const AVOID_R = 4; // 想住得远：两家至少隔开几格
const NOUN = {
  garden: '一片花园',
  tree: '一棵树',
  lamp: '一盏灯',
  well: '一口水井',
  field: '一块菜地',
  pavilion: '一座凉亭',
  fountain: '一座喷泉',
  dock: '一个码头',
  shop: '一家小店',
  windmill: '一架风车',
  greenhouse: '一间温室',
  market: '一个集市',
  lighthouse: '一座灯塔',
};
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
  const other = homes.get(b.id);
  if (b.k === 'friend') return !!other && cheb(h, other) <= FRIEND_R;
  return !other || cheb(h, other) >= AVOID_R;
}

function bonusInfo(b) {
  if (b.k === 'near') {
    const noun = NOUN[b.type];
    return {
      text: b.r === 1 ? `想紧挨着${noun}` : `家附近${within(b.r)}想有${noun}`,
      say: `最近总在想，家附近要是有${noun}就好了。`,
      doneSay: `真的有${noun.slice(1)}了，谢谢你记着！`,
    };
  }
  const name = ARCHETYPES[b.id] ? ARCHETYPES[b.id].name : '邻居';
  if (b.k === 'friend') {
    return {
      text: `想住在${name}家附近（${within(FRIEND_R)}）`,
      say: `我和${name}很聊得来，想住得近一点。`,
      doneSay: `和${name}做了邻居，串门方便多了。`,
    };
  }
  return {
    text: `想离${name}家远一点（隔${CN[AVOID_R]}格）`,
    say: `${name}那边太热闹了，我想住得远一点。`,
    doneSay: '这下清静多了。',
  };
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

  const roll = Math.random();
  if (avoid.length && roll < 0.15) return { k: 'avoid', id: pickOne(avoid).spec.id };
  if (friends.length && (roll < 0.38 || !near.length)) return { k: 'friend', id: pickOne(friends).spec.id };
  if (near.length) {
    const o = pickOne(near);
    return { k: 'near', type: o.type, r: o.r };
  }
  return null;
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
      out.need = ['合适的住处已经有人住了，需要再盖一处'];
      out.text = '我看中的地方已经有人住了。';
    } else if (cand.partial) {
      out.need = cand.partial.map((c) => c.need);
      out.text = cand.partial[0].say;
    } else {
      out.need = [HOME_NEED[spec.home]];
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
    out.need = ['好像还缺点什么……'];
    out.text = spec.almost;
  } else {
    out.need = ['心满意足'];
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
