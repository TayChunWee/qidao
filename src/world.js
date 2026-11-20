// 游戏状态与规则。不依赖任何渲染代码。
import { SIZE, MAX_LEVEL, DIRS, opp, NAMES, hash } from './config.js';

// 可以叠高的实体块；SOLO 是独立的一座，只能建在地面，上面不能再盖（值是它相当于几层楼高）
export const STACKS = ['room', 'shop', 'workshop', 'tower'];
export const SOLO = { windmill: 2, greenhouse: 1, market: 1, lighthouse: 3 };
export const SOLIDS = [...STACKS, ...Object.keys(SOLO)];
export const GROUNDS = ['road', 'garden', 'tree', 'lamp', 'dock', 'well', 'field', 'pavilion', 'fountain'];
// 朝向固定、正面有门的底层建筑
const FACED = ['shop', 'workshop', 'windmill', 'greenhouse', 'market'];

// 整张地图。数字：第几次扩张后长出来的陆地（0 是开局的小岛）；
// 字母 a-d：属于第 0-3 片陆地的池塘或水湾，一直是水；点：海。
// 还没长出来的地方是一片干沙洲：不算水，也不能盖东西。
const MAP = [
  '....................',
  '.......222222.......',
  '.....2222222222.....',
  '....222222222222....',
  '...32222222222221...',
  '..3330000000011111..',
  '..3330000000011111..',
  '.33330000000011b11..',
  '.3333000000001bb11..',
  '.33330000000011111..',
  '.33330000000011111..',
  '..3330aaaa00011111..',
  '..333aaaaaa0011111..',
  '..33333aaaa3311111..',
  '...3333333333311....',
  '....33333333333.....',
  '.....333d3333.......',
  '.......3333.........',
  '....................',
  '....................',
];
export const MAX_STAGE = 3;
export const START_CENTER = { x: 8.5, z: 8.5 }; // 开局小岛的中心（格坐标）

const START_TREES = [[5, 6], [11, 5], [12, 8], [6, 9], [10, 11]];

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

export class World {
  constructor(stage = 0) {
    this.cells = new Array(SIZE * SIZE);
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = MAP[z][x];
        const pond = ch >= 'a' && ch <= 'd';
        const zone = ch === '.' ? -1 : pond ? ch.charCodeAt(0) - 97 : Number(ch);
        // g：地面物件；s：从下到上叠起来的实体块
        this.cells[z * SIZE + x] = { zone, pond, water: zone < 0 || pond, locked: false, g: null, s: [] };
      }
    }
    this.setStage(stage);
  }

  // 小岛扩张到第几阶段。还没到的陆地保持锁定。
  setStage(n) {
    this.stage = n;
    for (const c of this.cells) c.locked = c.zone > n;
  }

  inb(x, z) {
    return x >= 0 && z >= 0 && x < SIZE && z < SIZE;
  }

  cell(x, z) {
    return this.inb(x, z) ? this.cells[z * SIZE + x] : null;
  }

  seedStart() {
    for (const [x, z] of START_TREES) {
      const c = this.cell(x, z);
      if (c && !c.water && !c.locked) c.g = { t: 'tree' };
    }
  }

  // 新长出来的陆地上自带几棵树
  seedZone(zone) {
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const c = this.cell(x, z);
        if (c.zone === zone && !c.pond && !c.g && !c.s.length && hash(x, z, 31) % 8 === 0) c.g = { t: 'tree' };
      }
    }
  }

  // 这一格的建筑相当于几层楼高（风车、灯塔比一层高）
  heightOf(c) {
    if (!c.s.length) return 0;
    return SOLO[c.s[0].t] || c.s.length;
  }

  // ---------- 摆放规则 ----------

  check(type, x, z, opt = {}) {
    const c = this.cell(x, z);
    if (!c) return fail('这里已经出岛了');
    if (type === 'balcony') return this.checkBalcony(x, z, opt.level, opt.dir);

    if (type === 'dock') {
      if (!c.water) return fail(c.locked ? '这片沙洲还没长出土地' : '码头要建在水面上');
      if (c.g) return fail('这里已经有码头了');
      if (this.dockDir(x, z) < 0) return fail('码头要紧挨着陆地');
      return ok({ level: 0 });
    }
    if (c.water) return fail('这里是水面，只能建码头');
    if (c.locked) return fail('这片沙洲还没长出土地');

    if (GROUNDS.includes(type)) {
      if (c.s.length) return fail('这里已经有建筑了');
      if (c.g) return fail(c.g.t === type ? `这里已经有${NAMES[type]}了` : `先拆掉这里的${NAMES[c.g.t]}`);
      return ok({ level: 0 });
    }

    // 实体块
    if (c.g) return fail(`先拆掉这里的${NAMES[c.g.t]}`);
    const level = c.s.length;
    if (level && SOLO[c.s[0].t]) return fail(`${NAMES[c.s[0].t]}上面不能再盖了`);
    if (level >= MAX_LEVEL) return fail('已经盖到最高了');
    if (SOLO[type] && level > 0) return fail(`${NAMES[type]}要建在空地上`);
    if ((type === 'shop' || type === 'workshop') && level > 0) return fail(`${NAMES[type]}只能开在底层`);
    if (type === 'lighthouse' && !this.near(x, z, 1, (n) => n.water)) return fail('灯塔要建在水边');
    const top = level + (SOLO[type] || 1);
    for (let d = 0; d < 4; d++) {
      const n = this.cell(x + DIRS[d].x, z + DIRS[d].z);
      if (!n) continue;
      for (let lv = level; lv < top; lv++) {
        if (n.s[lv] && n.s[lv].b[opp(d)]) return fail('旁边的阳台挡住了这里');
      }
    }
    return ok({ level });
  }

  checkBalcony(x, z, level, dir) {
    const c = this.cell(x, z);
    const b = c && c.s[level];
    if (!b || b.t !== 'room') return fail('阳台要装在房间的外墙上');
    if (level < 1) return fail('阳台要装在二层以上');
    if (b.b[dir]) return fail('这面墙已经有阳台了');
    const n = this.cell(x + DIRS[dir].x, z + DIRS[dir].z);
    if (n && this.heightOf(n) > level) return fail('这面墙被隔壁挡住了');
    return ok({ level });
  }

  apply(type, x, z, opt = {}) {
    const c = this.cell(x, z);
    if (type === 'balcony') {
      c.s[opt.level].b[opt.dir] = 1;
    } else if (GROUNDS.includes(type)) {
      c.g = { t: type };
    } else {
      c.s.push({ t: type, d: opt.dir ?? 2, b: [0, 0, 0, 0] });
    }
  }

  remove(x, z) {
    const c = this.cell(x, z);
    if (!c) return null;
    if (c.s.length) return c.s.pop();
    if (c.g) {
      const g = c.g;
      c.g = null;
      return g;
    }
    return null;
  }

  removeBalcony(x, z, level, dir) {
    const b = this.cell(x, z)?.s[level];
    if (b) b.b[dir] = 0;
  }

  // ---------- 整块移动 ----------

  // 矩形范围里有东西的格子
  occupied(x0, z0, x1, z1) {
    const out = [];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const c = this.cell(x, z);
        if (c && (c.g || c.s.length)) out.push({ x, z });
      }
    }
    return out;
  }

  // 把这些格子上的东西整体平移 (dx, dz)
  moveCells(cells, dx, dz) {
    return this.relocate(
      cells.map((p) => ({ from: p, to: { x: p.x + dx, z: p.z + dz } })),
      0,
    );
  }

  // 矩形里的东西整块顺时针转 90° 之后，每一格该去哪。flip 决定长宽不等时往哪边取整，
  // 连转几次时交替传 true / false，转回来才会落在原处
  rotatePairs(x0, z0, x1, z1, flip = false) {
    const w = x1 - x0 + 1;
    const d = z1 - z0 + 1;
    const round = flip ? Math.floor : Math.ceil;
    const nx0 = round(x0 + (w - d) / 2);
    const nz0 = round(z0 + (d - w) / 2);
    const pairs = this.occupied(x0, z0, x1, z1).map((p) => ({
      from: p,
      to: { x: nx0 + (d - 1 - (p.z - z0)), z: nz0 + (p.x - x0) },
    }));
    return { pairs, rect: { x0: nx0, z0: nz0, x1: nx0 + d - 1, z1: nz0 + w - 1 } };
  }

  // 把一批格子上的东西搬到新位置。pairs：[{ from, to }]；turns：顺时针转几个 90°。
  // 成功时世界已经改好；失败时世界不变，并说明原因
  relocate(pairs, turns = 0) {
    const from = new Set(pairs.map((p) => p.from.z * SIZE + p.from.x));
    for (const { from: f, to: t } of pairs) {
      const src = this.cell(f.x, f.z);
      const d = this.cell(t.x, t.z);
      if (!d) return fail('挪到小岛外面去了');
      if (src.g && src.g.t === 'dock') {
        if (!d.water) return fail('码头要放在水面上');
      } else if (d.water) {
        return fail('这里是水面，放不下');
      } else if (d.locked) {
        return fail('这片沙洲还没长出土地');
      }
      if ((d.g || d.s.length) && !from.has(t.z * SIZE + t.x)) return fail('那边已经有东西了');
    }
    const before = this.invalid();
    const snap = this.serialize();
    const held = pairs.map(({ from: f }) => {
      const c = this.cell(f.x, f.z);
      const h = { g: c.g, s: c.s };
      c.g = null;
      c.s = [];
      return h;
    });
    pairs.forEach(({ to: t }, i) => {
      const d = this.cell(t.x, t.z);
      d.g = held[i].g;
      d.s = held[i].s;
      if (!turns) return;
      // 朝向和阳台跟着一起转
      for (const b of d.s) {
        const old = b.b;
        b.d = (b.d + turns) % 4;
        b.b = old.map((_, k) => old[(k - turns + 4) % 4]);
      }
    });
    const bad = this.invalid();
    if (bad && !before) {
      this.load(snap);
      return fail(bad);
    }
    return ok();
  }

  // 全岛有没有摆得不合规矩的东西（整块移动之后检查）。没有问题返回 null
  invalid() {
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const c = this.cell(x, z);
        if (c.g && c.g.t === 'dock' && this.dockDir(x, z) < 0) return '码头要紧挨着陆地';
        if (!c.s.length) continue;
        if (c.s[0].t === 'lighthouse' && !this.near(x, z, 1, (n) => n.water)) return '灯塔要建在水边';
        for (let lv = 1; lv < c.s.length; lv++) {
          for (let d = 0; d < 4; d++) {
            if (!c.s[lv].b[d]) continue;
            const n = this.cell(x + DIRS[d].x, z + DIRS[d].z);
            if (n && this.heightOf(n) > lv) return '有阳台会被挡住';
          }
        }
      }
    }
    return null;
  }

  // ---------- 自动生成规则用到的查询 ----------

  // 同层相邻的两间房间会连通
  connected(x, z, level, d) {
    const a = this.cell(x, z)?.s[level];
    const n = this.cell(x + DIRS[d].x, z + DIRS[d].z)?.s[level];
    return !!(a && n && a.t === 'room' && n.t === 'room');
  }

  // 屋顶是否和隔壁连成一条屋脊
  roofJoin(x, z, d) {
    const c = this.cell(x, z);
    const n = this.cell(x + DIRS[d].x, z + DIRS[d].z);
    if (!c || !n || !c.s.length || n.s.length !== c.s.length) return false;
    return this.connected(x, z, c.s.length - 1, d);
  }

  // 底层的门朝哪边开：小店、工坊这些固定朝向，其他的朝着相邻的路
  doorDir(x, z) {
    const b = this.cell(x, z)?.s[0];
    if (!b) return -1;
    if (FACED.includes(b.t)) return b.d;
    for (const d of [2, 1, 3, 0]) {
      const n = this.cell(x + DIRS[d].x, z + DIRS[d].z);
      if (n && n.g && n.g.t === 'road') return d;
    }
    return -1;
  }

  // 码头朝陆地的方向，优先接到路上
  dockDir(x, z) {
    let best = -1;
    for (let d = 0; d < 4; d++) {
      const n = this.cell(x + DIRS[d].x, z + DIRS[d].z);
      if (!n || n.water || n.locked) continue;
      if (n.g && n.g.t === 'road') return d;
      if (best < 0) best = d;
    }
    return best;
  }

  // 路的四向连接掩码
  roadMask(x, z) {
    let m = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].x;
      const nz = z + DIRS[d].z;
      const n = this.cell(nx, nz);
      if (!n) continue;
      if (n.g) {
        if (n.g.t === 'road') m |= 1 << d;
        else if (n.g.t === 'dock' && this.dockDir(nx, nz) === opp(d)) m |= 1 << d;
      } else if (n.s.length && this.doorDir(nx, nz) === opp(d)) {
        m |= 1 << d;
      }
    }
    return m;
  }

  // 以 (x,z) 为中心、切比雪夫距离 r 以内是否存在满足条件的格子
  near(x, z, r, pred) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const c = this.cell(x + dx, z + dz);
        if (c && pred(c, x + dx, z + dz)) return true;
      }
    }
    return false;
  }

  // 建造规模，用来决定音乐的丰富程度
  count() {
    let blocks = 0;
    let ground = 0;
    for (const c of this.cells) {
      blocks += c.s.length;
      if (c.g) ground++;
    }
    return blocks + Math.floor(ground / 3);
  }

  // ---------- 存档 ----------

  serialize() {
    return JSON.stringify(
      this.cells.map((c) => (c.g || c.s.length ? [c.g ? c.g.t : 0, c.s.map((b) => [b.t, b.d, b.b.join('')])] : 0)),
    );
  }

  load(str) {
    const arr = JSON.parse(str);
    arr.forEach((v, i) => {
      const c = this.cells[i];
      if (!c) return;
      c.g = null;
      c.s = [];
      if (!v) return;
      if (v[0]) c.g = { t: v[0] };
      c.s = v[1].map(([t, d, b]) => ({ t, d, b: b.split('').map(Number) }));
    });
  }

  // 试摆用的副本。直接逐格复制，比走一遍存档快得多。
  clone() {
    const w = new World(this.stage);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const n = w.cells[i];
      if (c.g) n.g = { t: c.g.t };
      if (c.s.length) n.s = c.s.map((b) => ({ t: b.t, d: b.d, b: b.b.slice() }));
    }
    return w;
  }
}
