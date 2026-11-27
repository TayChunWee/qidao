// 把一个格子的状态翻译成"零件清单"。纯数据，不依赖渲染。
// 渲染层按 key 对比新旧清单：新增的零件长出来，消失的零件缩回去。
// 这里就是"自动生成规则"所在的地方：屋顶、连廊、门、窗、栏杆、烟囱。
import { H, DIRS, hash } from './config.js';
import { SOLO } from './world.js';

export function describeCell(w, x, z, ctx = {}) {
  const c = w.cell(x, z);
  const parts = [];

  if (c.g) {
    const t = c.g.t;
    if (t === 'road') {
      parts.push({ key: 'g', kind: 'road', p: { mask: w.roadMask(x, z), seed: hash(x, z) % 8 }, y: 0, anim: 'drop', fall: true });
      // 路靠水的一侧自动长出栏杆
      for (let d = 0; d < 4; d++) {
        const n = w.cell(x + DIRS[d].x, z + DIRS[d].z);
        if (n && n.water && !n.g && !n.s.length) parts.push({ key: `rail${d}`, kind: 'rail', p: { d }, y: 0, anim: 'grow' });
      }
    } else if (t === 'bridge') {
      // 小桥除了接路和别的桥，也接到挨着的陆地和码头上；剩下的几边装栏杆
      let mask = w.roadMask(x, z);
      for (let d = 0; d < 4; d++) {
        const n = w.cell(x + DIRS[d].x, z + DIRS[d].z);
        if (n && !n.locked && (!n.water || (n.g && n.g.t === 'dock'))) mask |= 1 << d;
      }
      parts.push({ key: 'g', kind: 'bridge', p: { mask }, y: 0, anim: 'drop', fall: true });
    } else if (t === 'orchard') {
      parts.push({ key: 'g', kind: 'orchard', p: { seed: hash(x, z) % 12 }, y: 0, anim: 'drop', fall: true });
    } else if (t === 'garden') {
      // 有居民在照看的花园会多出长椅等摆设
      const deco = (ctx.benches && ctx.benches.get(`${x},${z}`)) || 0;
      parts.push({ key: 'g', kind: 'garden', p: { seed: hash(x, z) % 16, deco }, y: 0, anim: 'drop', fall: true });
    } else if (t === 'tree') {
      parts.push({ key: 'g', kind: 'tree', p: { seed: hash(x, z) % 16 }, y: 0, anim: 'drop', fall: true });
    } else if (t === 'lamp') {
      parts.push({ key: 'g', kind: 'lamp', p: {}, y: 0, anim: 'drop', fall: true });
    } else if (t === 'dock') {
      parts.push({ key: 'g', kind: 'dock', p: { d: w.dockDir(x, z), boat: hash(x, z) % 2 }, y: 0, anim: 'drop', fall: true });
    } else if (t === 'field') {
      // 有人照看的菜地长得更好
      const deco = (ctx.benches && ctx.benches.get(`${x},${z}`)) || 0;
      parts.push({ key: 'g', kind: 'field', p: { seed: hash(x, z) % 12, deco }, y: 0, anim: 'drop', fall: true });
    } else {
      // 水井、凉亭、喷泉
      parts.push({ key: 'g', kind: t, p: { seed: hash(x, z) % 4 }, y: 0, anim: 'drop', fall: true });
    }
    return parts;
  }

  const n = c.s.length;
  if (!n) return parts;
  const tone = hash(x, z) % 5;
  const door = w.doorDir(x, z);

  // 风车、温室、集市、灯塔：独立的一整座
  const solo = c.s[0].t;
  if (SOLO[solo]) {
    // 水上小屋的门朝着岸
    parts.push({ key: 'b0', kind: solo, p: { d: solo === 'stilt' ? Math.max(0, door) : c.s[0].d }, y: 0, anim: 'drop', fall: true });
    if ((solo === 'lighthouse' || solo === 'clock') && door >= 0) parts.push({ key: `door${door}`, kind: 'door', p: { d: door, t: 'tower' }, y: 0, anim: 'grow' });
    return parts;
  }

  for (let i = 0; i < n; i++) {
    const b = c.s[i];
    const y = i * H;
    // 露台的矮墙跟着楼下那间房的墙色走
    const body = b.t === 'room' ? { tone, c: b.c || 0 } : b.t === 'tower' ? { lv: i % 2 } : b.t === 'terrace' ? { tone, c: c.s[i - 1].c || 0 } : { d: b.d };
    parts.push({ key: `b${i}`, kind: b.t, p: body, y, anim: 'drop', fall: i === 0 });

    const g = hash(x, z, i) % 3; // 同一间房的窗户一起亮
    for (let d = 0; d < 4; d++) {
      if (w.connected(x, z, i, d)) {
        // 相邻同层房间之间长出连廊（只由东、南两侧的格子负责画，避免重复）
        if (d === 1 || d === 2) parts.push({ key: `c${i}:${d}`, kind: 'conn', p: { d, tone, g }, y, anim: 'grow' });
        continue;
      }
      if (b.b[d]) {
        // 有居民住的阳台会多出躺椅等摆设
        const deco = (ctx.chairs && ctx.chairs.get(`${x},${z},${i},${d}`)) || 0;
        parts.push({ key: `bal${i}:${d}`, kind: 'balcony', p: { d, deco, g }, y, anim: 'drop', fall: false });
        continue;
      }
      if (i === 0 && door === d && (b.t === 'room' || b.t === 'tower')) {
        // 底层朝路的一面自动开门
        parts.push({ key: `door${d}`, kind: 'door', p: { d, t: b.t }, y, anim: 'grow' });
        continue;
      }
      if (b.t === 'room') parts.push({ key: `w${i}:${d}`, kind: 'win', p: { d, v: hash(x, z, i, d) % 3, g }, y, anim: 'grow' });
    }
  }

  // 顶层自动长出屋顶；相邻的同高房间会连成一条屋脊
  const top = c.s[n - 1];
  if (top.t === 'room') {
    parts.push({
      key: 'roof',
      kind: 'roof',
      p: { lv: n, tone, c: c.r, wc: top.c || 0, n: w.roofJoin(x, z, 0), e: w.roofJoin(x, z, 1), s: w.roofJoin(x, z, 2), w: w.roofJoin(x, z, 3) },
      y: n * H,
      anim: 'grow',
    });
  } else if (top.t === 'tower') {
    parts.push({ key: 'roof', kind: 'cone', p: {}, y: n * H, anim: 'grow' });
  } else if (top.t === 'terrace') {
    // 露台自己就是顶，不再盖屋顶
  } else {
    parts.push({ key: 'roof', kind: 'flat', p: { t: top.t }, y: n * H, anim: 'grow' });
  }

  // 工坊的烟囱跟着整栋楼一起长高
  if (c.s[0].t === 'workshop') {
    parts.push({ key: 'chim', kind: 'chimney', p: { h: n, d: c.s[0].d }, y: 0, anim: 'grow' });
  }
  return parts;
}

// 工具栏缩略图用的零件组合
export function thumbParts(id) {
  // 粉刷：墙色画一间没封顶的房间，顶色画一间白墙房间戴着那种颜色的屋顶
  const brush = /^(wall|roof)(\d)$/.exec(id);
  if (brush) {
    const k = Number(brush[2]);
    if (brush[1] === 'wall') {
      return [
        { kind: 'room', p: { tone: 0, c: k } },
        { kind: 'win', p: { d: 2, v: 0, g: 0 } },
        { kind: 'win', p: { d: 3, v: 2, g: 0 } },
      ];
    }
    return [
      { kind: 'room', p: { tone: 0, c: 0 } },
      { kind: 'roof', p: { lv: 1, tone: 0, c: k, wc: 0 }, y: H },
    ];
  }
  switch (id) {
    case 'room':
      return [
        { kind: 'room', p: { tone: 0 } },
        { kind: 'win', p: { d: 2, v: 0, g: 0 } },
        { kind: 'win', p: { d: 3, v: 2, g: 0 } },
        { kind: 'roof', p: { lv: 1, tone: 0 }, y: H },
      ];
    case 'balcony':
      return [
        { kind: 'room', p: { tone: 3 } },
        { kind: 'balcony', p: { d: 2, deco: 0, g: 0 } },
        { kind: 'win', p: { d: 3, v: 0, g: 0 } },
      ];
    case 'road':
      return [{ kind: 'road', p: { mask: 6, seed: 1 } }];
    case 'garden':
      return [{ kind: 'garden', p: { seed: 3, deco: 0 } }];
    case 'tree':
      return [{ kind: 'tree', p: { seed: 2 } }];
    case 'shop':
      return [
        { kind: 'shop', p: { d: 2 } },
        { kind: 'flat', p: { t: 'shop' }, y: H },
      ];
    case 'workshop':
      return [
        { kind: 'workshop', p: { d: 2 } },
        { kind: 'flat', p: { t: 'workshop' }, y: H },
        { kind: 'chimney', p: { h: 1, d: 2 } },
      ];
    case 'tower':
      return [
        { kind: 'tower', p: { lv: 0 } },
        { kind: 'cone', p: {}, y: H },
      ];
    case 'lamp':
      return [{ kind: 'lamp', p: {} }];
    case 'dock':
      return [{ kind: 'dock', p: { d: 0, boat: 1 } }];
    case 'field':
      return [{ kind: 'field', p: { seed: 1, deco: 2 } }];
    case 'well':
    case 'pavilion':
    case 'fountain':
      return [{ kind: id, p: { seed: 0 } }];
    case 'windmill':
    case 'greenhouse':
    case 'market':
    case 'lighthouse':
    case 'stilt':
    case 'clock':
      return [{ kind: id, p: { d: 2 } }];
    case 'library':
      return [
        { kind: 'library', p: { d: 2 } },
        { kind: 'flat', p: { t: 'library' }, y: H },
      ];
    case 'terrace':
      return [
        { kind: 'room', p: { tone: 0 } },
        { kind: 'win', p: { d: 2, v: 0, g: 0 } },
        { kind: 'win', p: { d: 3, v: 2, g: 0 } },
        { kind: 'terrace', p: { tone: 0, c: 0 }, y: H },
      ];
    case 'bridge':
      return [{ kind: 'bridge', p: { mask: 5 } }];
    case 'orchard':
      return [{ kind: 'orchard', p: { seed: 1 } }];
    default:
      return [];
  }
}

// 摆放预览（半透明虚影）用的零件。朝向统一按"朝南"建，由外层容器旋转。
export function ghostParts(id) {
  switch (id) {
    case 'room':
      return [{ kind: 'room', p: { tone: 0 } }];
    case 'tower':
      return [{ kind: 'tower', p: { lv: 0 } }];
    case 'shop':
      return [{ kind: 'shop', p: { d: 2 } }];
    case 'workshop':
      return [{ kind: 'workshop', p: { d: 2 } }];
    case 'balcony':
      return [{ kind: 'balcony', p: { d: 2, deco: 0, g: 0 } }];
    case 'road':
      return [{ kind: 'road', p: { mask: 0, seed: 0 } }];
    case 'garden':
      return [{ kind: 'garden', p: { seed: 1, deco: 0 } }];
    case 'tree':
      return [{ kind: 'tree', p: { seed: 1 } }];
    case 'lamp':
      return [{ kind: 'lamp', p: {} }];
    case 'dock':
      return [{ kind: 'dock', p: { d: 0, boat: 0 } }];
    case 'field':
      return [{ kind: 'field', p: { seed: 1, deco: 0 } }];
    case 'well':
    case 'pavilion':
    case 'fountain':
      return [{ kind: id, p: { seed: 0 } }];
    case 'windmill':
    case 'greenhouse':
    case 'market':
    case 'lighthouse':
    case 'stilt':
    case 'clock':
    case 'library':
      return [{ kind: id, p: { d: 2 } }];
    case 'terrace':
      return [{ kind: 'terrace', p: { tone: 0, c: 0 } }];
    case 'bridge':
      return [{ kind: 'bridge', p: { mask: 5 } }];
    case 'orchard':
      return [{ kind: 'orchard', p: { seed: 1 } }];
    default:
      return [];
  }
}
