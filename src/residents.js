// 居民小人：在岛上走动，到点了上阳台、照看花园，夜里回家。行为只读取 World 和愿望评估结果。
import * as THREE from 'three';
import { SIZE, H, DIRS, DIR_RY } from './config.js';
import { buildResident } from './models.js';
import { START_CENTER } from './world.js';

const HALF_SIZE = SIZE / 2;
const key = (x, z) => z * SIZE + x;

// 可以踩上去的地面物件，以及踩上去时脚底的高度
const WALK_Y = { road: 0.035, garden: 0.05, field: 0.075, pavilion: 0.06 };

export function walkable(w, x, z) {
  const c = w.cell(x, z);
  if (!c) return false;
  if (c.water) return !!c.g && c.g.t === 'dock';
  if (c.locked || c.s.length) return false;
  return !c.g || WALK_Y[c.g.t] !== undefined;
}

function groundY(w, x, z) {
  const c = w.cell(x, z);
  if (!c || !c.g) return 0;
  return WALK_Y[c.g.t] || 0;
}

// 广度优先搜索。goal(x,z) 返回 true 时结束，返回从起点之后到终点的路径。
// through 为 true 时无视可通行性（用来找最近的落脚点）。
function bfs(w, sx, sz, goal, maxDist = 60, through = false) {
  const prev = new Map();
  const dist = new Map();
  const start = key(sx, sz);
  prev.set(start, -1);
  dist.set(start, 0);
  const queue = [[sx, sz]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, z] = queue[qi];
    const k = key(x, z);
    if (qi > 0 && goal(x, z)) {
      const path = [];
      let cur = k;
      while (cur !== start) {
        path.push({ x: cur % SIZE, z: Math.floor(cur / SIZE) });
        cur = prev.get(cur);
      }
      return path.reverse();
    }
    if (dist.get(k) >= maxDist) continue;
    for (const d of DIRS) {
      const nx = x + d.x;
      const nz = z + d.z;
      if (!w.inb(nx, nz)) continue;
      const nk = key(nx, nz);
      if (prev.has(nk)) continue;
      if (!through && !walkable(w, nx, nz)) continue;
      prev.set(nk, k);
      dist.set(nk, dist.get(k) + 1);
      queue.push([nx, nz]);
    }
  }
  return null;
}

function reachable(w, sx, sz, maxDist) {
  const out = [];
  bfs(
    w,
    sx,
    sz,
    (x, z) => {
      out.push({ x, z });
      return false;
    },
    maxDist,
  );
  return out;
}

// 新居民上岛的位置：有码头就从码头上来，否则出现在离水湾最近的空地上
export function arrivalCell(w) {
  const docks = [];
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const c = w.cell(x, z);
      if (c.g && c.g.t === 'dock') docks.push({ x, z });
    }
  }
  if (docks.length) return docks[Math.floor(Math.random() * docks.length)];
  const sx = Math.floor(START_CENTER.x);
  const sz = Math.floor(START_CENTER.z) + 2;
  if (walkable(w, sx, sz)) return { x: sx, z: sz };
  const path = bfs(w, sx, sz, (x, z) => walkable(w, x, z), 60, true);
  return path && path.length ? path[path.length - 1] : { x: sx, z: sz };
}

export class Resident {
  // def：wishes.js 里的居民模板；start：出生的格子；pop：是否带着出场动画
  constructor(def, scene, start, pop = false) {
    this.def = def;
    this.scene = scene;
    this.obj = buildResident(def.look);
    scene.add(this.obj);
    this.seed = Math.floor(Math.random() * 3);
    this.reset(start);
    if (pop) this.scale = 0.01;
  }

  dispose() {
    this.scene.remove(this.obj);
    this.obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  reset(start) {
    this.x = start.x;
    this.z = start.z;
    this.pos = new THREE.Vector3(this.x - HALF_SIZE + 0.5, 0, this.z - HALF_SIZE + 0.5);
    this.state = 'idle';
    this.timer = 1 + Math.random() * 2;
    this.path = [];
    this.after = null;
    this.scale = 1;
    this.scaleGoal = 1;
    this.face = 0;
    this.faceGoal = 0;
    this.walkPhase = Math.random() * 6;
    this.homeKey = '';
    this.bubble = null;
  }

  say(text, seconds = 5) {
    this.bubble = { text, until: performance.now() + seconds * 1000 };
  }

  get speaking() {
    return this.bubble && performance.now() < this.bubble.until ? this.bubble.text : null;
  }

  // 气泡的锚点：在屋里时锚在家的位置
  anchor() {
    const p = this.pos.clone();
    p.y += this.state === 'inside' ? 0.3 : 0.52;
    return p;
  }

  phase(t, res) {
    const hasHome = res.tier >= 1 && res.home;
    if (!hasHome) return 'wander';
    if (t > 0.66) return 'sleep';
    // 有阳台的居民在自己喜欢的时段上阳台（看日出、画画、看日落）
    const p = this.def.perchAt;
    if (p && res.home.dir !== undefined && t >= p[0] && t <= p[1]) return 'perch';
    // 爱花、种地的居民大部分时间待在花园或菜地里
    if (res.spot && (Math.floor(t * 36) + this.seed) % 3 !== 0) return 'garden';
    return 'wander';
  }

  update(dt, w, t, res) {
    const ph = this.phase(t, res);
    const hk = res.home ? `${res.home.x},${res.home.z},${res.home.level},${res.home.dir}` : '';
    const indoors = this.state === 'inside' || this.state === 'perch';

    if (indoors) {
      if (hk !== this.homeKey || (ph !== 'sleep' && ph !== 'perch')) this.leaveHome(w);
      else if (this.state === 'inside' && ph === 'perch') this.enter(res, 'perch');
      else if (this.state === 'perch' && ph === 'sleep') this.enter(res, 'inside');
    } else if (!walkable(w, this.x, this.z)) {
      this.relocate(w);
    }

    if (this.state === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) this.decide(w, ph, res, hk);
    } else if (this.state === 'walk') {
      this.walk(dt, w, res, hk);
    } else if (this.state === 'tend') {
      this.timer -= dt;
      this.walkPhase += dt * 5;
      if (this.timer <= 0 || ph !== 'garden') {
        this.state = 'idle';
        this.timer = 0.5;
      }
    }

    // 表现
    this.scale += (this.scaleGoal - this.scale) * (1 - Math.exp(-dt * 12));
    let dr = this.faceGoal - this.face;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.face += dr * (1 - Math.exp(-dt * 10));
    const o = this.obj;
    o.visible = this.scale > 0.03;
    const hop = this.state === 'walk' ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : this.state === 'tend' ? Math.abs(Math.sin(this.walkPhase)) * 0.025 : 0;
    o.position.set(this.pos.x, this.pos.y + hop, this.pos.z);
    o.rotation.y = this.face;
    const squash = this.state === 'walk' ? 1 + Math.sin(this.walkPhase * 2) * 0.05 : 1 + Math.sin(performance.now() / 600 + this.walkPhase) * 0.015;
    o.scale.set(this.scale / squash, this.scale * squash, this.scale / squash);
  }

  decide(w, ph, res, hk) {
    if (ph === 'sleep' || ph === 'perch') {
      const home = res.home;
      const mode = ph === 'perch' ? 'perch' : 'inside';
      const adjacent = Math.abs(this.x - home.x) + Math.abs(this.z - home.z) === 1;
      if (adjacent) {
        this.enter(res, mode);
        return;
      }
      const path = bfs(w, this.x, this.z, (x, z) => Math.abs(x - home.x) + Math.abs(z - home.z) === 1);
      if (path) this.go(path, mode);
      else this.enter(res, mode); // 走不到就直接回家
      this.homeKey = hk;
      return;
    }
    if (ph === 'garden') {
      const g = res.spot;
      if (this.x === g.x && this.z === g.z) {
        this.state = 'tend';
        this.timer = 6 + Math.random() * 5;
        return;
      }
      const path = bfs(w, this.x, this.z, (x, z) => x === g.x && z === g.z);
      if (path) {
        this.go(path, 'tend');
        return;
      }
    }
    // 闲逛：优先走到路上
    const cells = reachable(w, this.x, this.z, 7);
    if (!cells.length) {
      this.timer = 2;
      return;
    }
    const weighted = [];
    for (const c of cells) {
      const t = w.cell(c.x, c.z).g?.t;
      const n = t === 'pavilion' ? 8 : t === 'road' ? 4 : 1;
      for (let i = 0; i < n; i++) weighted.push(c);
    }
    const goal = weighted[Math.floor(Math.random() * weighted.length)];
    const path = bfs(w, this.x, this.z, (x, z) => x === goal.x && z === goal.z);
    if (path) this.go(path, null);
    else this.timer = 1.5;
  }

  go(path, after) {
    this.path = path;
    this.after = after;
    this.state = 'walk';
  }

  walk(dt, w, res, hk) {
    const next = this.path[0];
    if (!next) {
      this.arrive(res, hk);
      return;
    }
    if (!walkable(w, next.x, next.z)) {
      // 路被堵了，重新想
      this.state = 'idle';
      this.timer = 0.4;
      return;
    }
    const tx = next.x - HALF_SIZE + 0.5;
    const tz = next.z - HALF_SIZE + 0.5;
    const ty = groundY(w, next.x, next.z);
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    const stepLen = 0.95 * dt;
    this.walkPhase += dt * 9;
    if (d > 1e-3) this.faceGoal = Math.atan2(dx, dz);
    if (d <= stepLen) {
      this.pos.set(tx, ty, tz);
      this.x = next.x;
      this.z = next.z;
      this.path.shift();
    } else {
      this.pos.x += (dx / d) * stepLen;
      this.pos.z += (dz / d) * stepLen;
      this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 8);
    }
  }

  arrive(res, hk) {
    if (this.after === 'tend') {
      this.state = 'tend';
      this.timer = 6 + Math.random() * 5;
    } else if ((this.after === 'inside' || this.after === 'perch') && res.home && hk === this.homeKey) {
      this.enter(res, this.after);
    } else {
      this.state = 'idle';
      this.timer = 1 + Math.random() * 2.5;
    }
    this.after = null;
  }

  // 进屋，或者出现在阳台上
  enter(res, mode) {
    const h = res.home;
    this.homeKey = `${h.x},${h.z},${h.level},${h.dir}`;
    const cx = h.x - HALF_SIZE + 0.5;
    const cz = h.z - HALF_SIZE + 0.5;
    if (mode === 'perch' && h.dir !== undefined) {
      const d = DIRS[h.dir];
      const r = DIR_RY[h.dir];
      // 站在阳台上，躺椅旁边
      const lx = 0.1;
      const lz = 0.6;
      this.pos.set(cx + lx * Math.cos(r) + lz * Math.sin(r), h.level * H + 0.05, cz - lx * Math.sin(r) + lz * Math.cos(r));
      this.faceGoal = Math.atan2(d.x, d.z);
      this.state = 'perch';
      this.scale = 0.01;
      this.scaleGoal = 1;
    } else {
      this.pos.set(cx, (h.level || 0) * H + 0.3, cz);
      this.state = 'inside';
      this.scaleGoal = 0;
    }
  }

  leaveHome(w) {
    const hx = Math.round(this.pos.x + HALF_SIZE - 0.5);
    const hz = Math.round(this.pos.z + HALF_SIZE - 0.5);
    this.placeNear(w, Math.min(SIZE - 1, Math.max(0, hx)), Math.min(SIZE - 1, Math.max(0, hz)));
    this.homeKey = '';
    this.state = 'idle';
    this.timer = 0.8;
    this.scale = 0.01;
    this.scaleGoal = 1;
  }

  // 脚下的地、或者自己正待着的家被整块搬走时，跟着一起挪
  shift(dx, dz) {
    this.x += dx;
    this.z += dz;
    this.pos.x += dx;
    this.pos.z += dz;
    this.path = [];
    if (this.state === 'walk') {
      this.state = 'idle';
      this.timer = 0.5;
    }
    if (this.homeKey && (this.state === 'inside' || this.state === 'perch')) {
      const [hx, hz, lv, dir] = this.homeKey.split(',');
      this.homeKey = `${Number(hx) + dx},${Number(hz) + dz},${lv},${dir}`;
    }
  }

  // 脚下被盖了东西：跳到最近的空地
  relocate(w) {
    this.placeNear(w, this.x, this.z);
    this.state = 'idle';
    this.timer = 1;
    this.scale = 0.4;
    this.scaleGoal = 1;
    this.say('哎呀！', 1.6);
  }

  placeNear(w, x, z) {
    if (!walkable(w, x, z)) {
      const path = bfs(w, x, z, (px, pz) => walkable(w, px, pz), 60, true);
      if (path && path.length) {
        const end = path[path.length - 1];
        x = end.x;
        z = end.z;
      }
    }
    this.x = x;
    this.z = z;
    this.pos.set(x - HALF_SIZE + 0.5, groundY(w, x, z), z - HALF_SIZE + 0.5);
    this.path = [];
  }
}
