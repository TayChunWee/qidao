// 用代码生成所有模型。每个零件合并成一个带顶点色的网格，窗户等发光部分单独一个网格。
import * as THREE from './vendor/three.module.min.js';
import { C, H, BODY, HALF, DIRS, DIR_RY, opp, SIZE, rand01 } from './config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

// 几何体收集器：把许多小几何体烘焙到一起，y 参数一律表示底面高度
export class Geo {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  get empty() {
    return this.pos.length === 0;
  }

  add(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _one);
    src.applyMatrix4(_m);
    const p = src.attributes.position.array;
    const n = src.attributes.normal.array;
    _c.set(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(_c.r, _c.g, _c.b);
    }
    src.dispose();
    if (src !== geo) geo.dispose();
    return this;
  }

  box(w, h, d, x, y, z, color, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
  }

  cyl(rt, rb, h, seg, x, y, z, color, ry = 0) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, ry);
  }

  cone(r, h, seg, x, y, z, color, ry = 0) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, ry);
  }

  ball(r, x, y, z, color, detail = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z);
  }

  // 自定义三角形。center 是形体内部的一点，用来保证法线朝外。
  tri(a, b, c, color, center) {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const dx = (a[0] + b[0] + c[0]) / 3 - center[0];
    const dy = (a[1] + b[1] + c[1]) / 3 - center[1];
    const dz = (a[2] + b[2] + c[2]) / 3 - center[2];
    if (nx * dx + ny * dy + nz * dz < 0) {
      [b, c] = [c, b];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    _c.set(color);
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(nx / l, ny / l, nz / l);
      this.col.push(_c.r, _c.g, _c.b);
    }
    return this;
  }

  quad(a, b, c, d, color, center) {
    this.tri(a, b, c, color, center);
    return this.tri(a, c, d, color, center);
  }

  scale(s) {
    for (let i = 0; i < this.pos.length; i++) this.pos[i] *= s;
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glass = () =>
  new THREE.MeshStandardMaterial({ color: C.glassDay, emissive: C.glassNight, emissiveIntensity: 0, flatShading: true, roughness: 0.35 });

export const mats = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }),
  glow: [glass(), glass(), glass()], // 三组窗户，入夜后先后亮起
  lamp: new THREE.MeshStandardMaterial({ color: '#fff1c4', emissive: '#ffc86a', emissiveIntensity: 0.15, flatShading: true }),
  forge: new THREE.MeshStandardMaterial({ color: '#ffb46a', emissive: '#ff8a3c', emissiveIntensity: 1, flatShading: true }),
  lampGlow: new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: '#ffc470',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
  // 温室的玻璃：半透明，夜里透出一点暖光
  pane: new THREE.MeshStandardMaterial({
    color: C.glassPane,
    emissive: C.glassNight,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.42,
    roughness: 0.2,
    flatShading: true,
    depthWrite: false,
  }),
  // 灯塔的光束
  beam: new THREE.MeshBasicMaterial({
    color: '#ffe7a8',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
  ghost: new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    roughness: 1,
    color: '#ffffff',
  }),
};

const glowDisc = new THREE.CircleGeometry(1.15, 28);
glowDisc.rotateX(-Math.PI / 2);

// 灯塔光束：从中心向两头张开的两片三角
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute(
  'position',
  new THREE.Float32BufferAttribute([0, 0, 0.03, 3.2, 0, 0.5, 3.2, 0, -0.5, 0, 0, -0.03, -3.2, 0, -0.5, -3.2, 0, 0.5], 3),
);

// 三角柱屋顶：axis 方向为屋脊，a0..a1 为屋脊两端的位置
function prism(g, axis, a0, a1, roofCol, capCol) {
  const hw = 0.47;
  const rh = 0.36;
  const P = (a, y, b) => (axis === 'x' ? [a, y, b] : [b, y, a]);
  const A0 = P(a0, 0, -hw);
  const B0 = P(a0, 0, hw);
  const R0 = P(a0, rh, 0);
  const A1 = P(a1, 0, -hw);
  const B1 = P(a1, 0, hw);
  const R1 = P(a1, rh, 0);
  const c = P((a0 + a1) / 2, rh * 0.3, 0);
  g.quad(A0, R0, R1, A1, roofCol, c);
  g.quad(B0, B1, R1, R0, roofCol, c);
  g.tri(A0, B0, R0, capCol, c);
  g.tri(A1, R1, B1, capCol, c);
}

// 根据零件种类和参数生成模型。原点在零件底面中心。
export function buildPart(kind, p = {}) {
  const g = new Geo();
  const glow = new Geo();
  const pane = new Geo();
  let glowMat = mats.glow[p.g || 0];
  let ry = 0;
  const extras = [];
  const data = {};

  switch (kind) {
    case 'room': {
      g.box(BODY, H, BODY, 0, 0, 0, C.walls[p.tone % C.walls.length]);
      g.box(BODY + 0.04, 0.05, BODY + 0.04, 0, 0, 0, C.trim);
      break;
    }

    case 'win': {
      ry = DIR_RY[p.d];
      const z = HALF;
      if (p.v === 0) {
        for (const sx of [-0.19, 0.19]) {
          g.box(0.18, 0.24, 0.03, sx, 0.2, z, C.frame);
          glow.box(0.12, 0.18, 0.04, sx, 0.23, z, '#fff');
        }
      } else if (p.v === 1) {
        g.box(0.42, 0.22, 0.03, 0, 0.23, z, C.frame);
        glow.box(0.36, 0.16, 0.04, 0, 0.26, z, '#fff');
        g.box(0.44, 0.06, 0.08, 0, 0.16, z + 0.04, C.wood);
        for (let i = 0; i < 4; i++) g.ball(0.04, -0.15 + i * 0.1, 0.25, z + 0.05, C.flowers[(i + p.d) % 5]);
      } else {
        g.box(0.2, 0.3, 0.03, 0, 0.17, z, C.frame);
        glow.box(0.14, 0.24, 0.04, 0, 0.2, z, '#fff');
        for (const sx of [-0.155, 0.155]) g.box(0.08, 0.3, 0.025, sx, 0.17, z + 0.005, C.shutter);
      }
      break;
    }

    case 'door': {
      ry = DIR_RY[p.d];
      glowMat = mats.lamp;
      const z = p.t === 'tower' ? 0.345 : HALF;
      g.box(0.27, 0.43, 0.03, 0, 0, z, C.frame);
      g.box(0.2, 0.39, 0.045, 0, 0, z, C.door);
      g.ball(0.016, 0.06, 0.19, z + 0.03, C.frame);
      g.box(0.36, 0.035, 0.15, 0, 0, z + 0.075, C.stone);
      g.add(new THREE.BoxGeometry(0.38, 0.03, 0.17), C.roofs[0], 0, 0.47, z + 0.07, 0, 0.35);
      g.box(0.02, 0.06, 0.02, 0.2, 0.33, z + 0.02, C.metal);
      glow.box(0.05, 0.07, 0.05, 0.2, 0.27, z + 0.035, '#fff');
      break;
    }

    case 'conn': {
      ry = DIR_RY[p.d];
      g.box(0.56, 0.5, 0.2, 0, 0, 0.5, C.wallShade);
      g.box(0.62, 0.04, 0.2, 0, 0.5, 0.5, C.trim);
      glow.box(0.585, 0.16, 0.1, 0, 0.2, 0.5, '#fff');
      break;
    }

    case 'balcony': {
      ry = DIR_RY[p.d];
      const z0 = HALF;
      g.box(0.62, 0.05, 0.31, 0, 0, z0 + 0.155, C.trim);
      for (const sx of [-0.22, 0.22]) g.box(0.05, 0.08, 0.22, sx, -0.08, z0 + 0.11, C.woodDark);
      for (const sx of [-0.29, 0.29]) {
        g.box(0.03, 0.2, 0.03, sx, 0.05, z0 + 0.29, C.wood);
        g.box(0.03, 0.03, 0.29, sx, 0.22, z0 + 0.145, C.wood);
      }
      g.box(0.61, 0.03, 0.03, 0, 0.22, z0 + 0.29, C.wood);
      for (const sx of [-0.15, 0, 0.15]) g.box(0.02, 0.17, 0.02, sx, 0.05, z0 + 0.29, C.wood);
      g.box(0.24, 0.4, 0.03, 0, 0.05, z0, C.frame);
      glow.box(0.18, 0.34, 0.04, 0, 0.07, z0, '#fff');
      if (p.deco >= 1) {
        // 躺椅
        g.box(0.1, 0.06, 0.16, -0.12, 0.05, z0 + 0.16, C.wood);
        g.box(0.13, 0.03, 0.2, -0.12, 0.11, z0 + 0.16, C.awningA);
        g.add(new THREE.BoxGeometry(0.13, 0.16, 0.03), C.awningA, -0.12, 0.2, z0 + 0.055, 0, -0.35);
      }
      if (p.deco >= 2) {
        g.cyl(0.04, 0.03, 0.07, 8, 0.2, 0.05, z0 + 0.22, C.terracotta);
        g.ball(0.06, 0.2, 0.16, z0 + 0.22, C.leafA);
      }
      if (p.deco >= 3) {
        g.cyl(0.012, 0.012, 0.42, 6, 0.04, 0.05, z0 + 0.12, C.frame);
        g.cone(0.21, 0.08, 8, 0.04, 0.45, z0 + 0.12, C.flowers[1]);
      }
      break;
    }

    case 'roof': {
      const col = C.roofs[Math.min(p.lv, C.roofs.length) - 1];
      const cap = C.walls[p.tone % C.walls.length];
      if (!p.e && !p.w && !p.n && !p.s) {
        g.box(0.93, 0.04, 0.93, 0, 0, 0, C.trim);
        g.cone(0.68, 0.4, 4, 0, 0.04, 0, col, Math.PI / 4);
      } else {
        if (p.e || p.w) prism(g, 'x', p.w ? -0.5 : -0.47, p.e ? 0.5 : 0.47, col, cap);
        if (p.n || p.s) prism(g, 'z', p.n ? -0.5 : -0.47, p.s ? 0.5 : 0.47, col, cap);
      }
      break;
    }

    case 'cone': {
      g.cyl(0.43, 0.41, 0.05, 8, 0, 0, 0, C.stoneDark, Math.PI / 8);
      g.cone(0.46, 0.62, 8, 0, 0.05, 0, C.towerRoof, Math.PI / 8);
      g.cyl(0.008, 0.008, 0.2, 5, 0, 0.66, 0, C.metal);
      g.tri([0, 0.86, 0], [0, 0.76, 0], [0.13, 0.81, 0], C.awningA, [0, 0.81, -1]);
      g.tri([0, 0.86, 0], [0, 0.76, 0], [0.13, 0.81, 0], C.awningA, [0, 0.81, 1]);
      break;
    }

    case 'flat': {
      g.box(0.93, 0.06, 0.93, 0, 0, 0, C.trim);
      g.box(0.8, 0.025, 0.8, 0, 0.06, 0, C.flatTop);
      if (p.t === 'shop') {
        g.box(0.14, 0.1, 0.14, 0.2, 0.085, -0.2, C.wood);
        g.box(0.1, 0.07, 0.1, 0.03, 0.085, -0.24, C.woodLight);
      }
      break;
    }

    case 'shop': {
      ry = DIR_RY[p.d];
      glowMat = mats.glow[1];
      g.box(BODY, H, BODY, 0, 0, 0, C.shopWall);
      g.box(BODY + 0.04, 0.05, BODY + 0.04, 0, 0, 0, C.trim);
      g.box(0.36, 0.3, 0.03, -0.17, 0.11, HALF, C.frame);
      glow.box(0.3, 0.24, 0.04, -0.17, 0.14, HALF, '#fff');
      g.box(0.2, 0.4, 0.03, 0.24, 0, HALF, C.frame);
      g.box(0.15, 0.36, 0.045, 0.24, 0, HALF, C.doorShop);
      g.box(0.24, 0.03, 0.1, 0.24, 0, HALF + 0.05, C.stone);
      for (let i = 0; i < 6; i++) {
        g.add(new THREE.BoxGeometry(0.14, 0.025, 0.24), i % 2 ? C.awningB : C.awningA, -0.35 + i * 0.14, 0.45, HALF + 0.1, 0, 0.42);
      }
      g.box(0.36, 0.08, 0.03, 0, 0.52, HALF + 0.005, C.wood);
      for (const sx of [-1, 1]) {
        g.box(0.03, 0.2, 0.3, sx * HALF, 0.22, 0, C.frame);
        glow.box(0.04, 0.14, 0.24, sx * HALF, 0.25, 0, '#fff');
      }
      g.box(0.14, 0.09, 0.07, -0.26, 0, HALF + 0.045, C.woodLight);
      for (let i = 0; i < 3; i++) g.ball(0.03, -0.3 + i * 0.045, 0.11, HALF + 0.045, C.flowers[i === 1 ? 1 : 4]);
      break;
    }

    case 'workshop': {
      ry = DIR_RY[p.d];
      glowMat = mats.forge;
      g.box(BODY, H, BODY, 0, 0, 0, C.brick);
      g.box(BODY + 0.04, 0.07, BODY + 0.04, 0, 0, 0, C.brickDark);
      g.box(0.46, 0.47, 0.03, 0, 0, HALF, C.stoneDark);
      g.box(0.4, 0.43, 0.045, 0, 0, HALF, C.woodDark);
      g.box(0.012, 0.43, 0.05, 0, 0, HALF, C.wood);
      for (const sx of [-1, 1]) {
        g.box(0.03, 0.16, 0.26, sx * HALF, 0.32, 0.04, C.stoneDark);
        glow.box(0.04, 0.11, 0.2, sx * HALF, 0.345, 0.04, '#fff');
      }
      g.box(0.03, 0.03, 0.12, 0.33, 0.5, HALF + 0.05, C.metal);
      g.add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8), C.metal, 0.33, 0.42, HALF + 0.09, 0, Math.PI / 2);
      g.cyl(0.055, 0.05, 0.12, 8, -0.33, 0, HALF + 0.04, C.wood);
      break;
    }

    case 'chimney': {
      ry = DIR_RY[p.d];
      const top = p.h * H + 0.46;
      g.box(0.16, top, 0.16, -0.26, 0, -0.26, C.brickDark);
      g.box(0.2, 0.04, 0.2, -0.26, top, -0.26, C.stoneDark);
      data.smoke = [-0.26, top + 0.08, -0.26];
      break;
    }

    case 'tower': {
      g.cyl(0.37, 0.385, H, 8, 0, 0, 0, C.towerStone, Math.PI / 8);
      g.cyl(0.4, 0.4, 0.05, 8, 0, 0, 0, C.stoneDark, Math.PI / 8);
      for (const d of p.lv ? [1, 3] : [0, 2]) {
        glow.add(new THREE.BoxGeometry(0.06, 0.2, 0.03), '#fff', DIRS[d].x * 0.35, 0.32, DIRS[d].z * 0.35, DIR_RY[d]);
      }
      break;
    }

    case 'road': {
      const m = p.mask;
      if (m === 0) {
        g.cyl(0.34, 0.34, 0.035, 8, 0, 0, 0, C.road, Math.PI / 8);
      } else {
        g.box(0.62, 0.035, 0.62, 0, 0, 0, C.road);
        for (let d = 0; d < 4; d++) {
          if ((m >> d) & 1) g.box(0.62, 0.035, 0.2, DIRS[d].x * 0.4, 0, DIRS[d].z * 0.4, C.road, d % 2 ? Math.PI / 2 : 0);
        }
      }
      for (let i = 0; i < 4; i++) {
        const sx = (rand01(p.seed, i, 1) - 0.5) * 0.4;
        const sz = (rand01(p.seed, i, 2) - 0.5) * 0.4;
        g.box(0.11, 0.012, 0.085, sx, 0.035, sz, C.roadStone, rand01(p.seed, i, 3) * 3);
      }
      break;
    }

    case 'rail': {
      ry = DIR_RY[p.d];
      for (const sx of [-0.4, 0, 0.4]) g.box(0.04, 0.18, 0.04, sx, 0, 0.455, C.wood);
      g.box(0.86, 0.03, 0.03, 0, 0.13, 0.455, C.woodLight);
      break;
    }

    case 'garden': {
      g.box(0.94, 0.03, 0.94, 0, 0, 0, C.gardenEdge);
      g.box(0.86, 0.05, 0.86, 0, 0, 0, C.gardenBed);
      const count = 8 + (p.deco >= 2 ? 6 : 0);
      for (let i = 0; i < count; i++) {
        const fx = (rand01(p.seed, i, 1) - 0.5) * 0.7;
        let fz = (rand01(p.seed, i, 2) - 0.5) * 0.7;
        if (p.deco >= 1 && fz < -0.15) fz = -fz;
        g.box(0.015, 0.09, 0.015, fx, 0.05, fz, C.stem);
        g.ball(0.042, fx, 0.155, fz, C.flowers[(p.seed + i) % 5]);
      }
      g.ball(0.1, 0.27, 0.1, p.deco >= 1 ? 0.1 : -0.25, C.leafB);
      g.ball(0.08, -0.3, 0.09, 0.28, C.leafA);
      if (p.deco >= 1) {
        // 长椅
        for (const sx of [-0.12, 0.12]) g.box(0.03, 0.1, 0.08, sx, 0.05, -0.28, C.woodDark);
        g.box(0.3, 0.025, 0.1, 0, 0.15, -0.28, C.wood);
        g.box(0.3, 0.1, 0.02, 0, 0.19, -0.325, C.wood);
      }
      if (p.deco >= 3) {
        // 小水盆
        g.cyl(0.03, 0.04, 0.14, 8, 0.25, 0.05, 0.27, C.stone);
        g.cyl(0.095, 0.05, 0.045, 8, 0.25, 0.19, 0.27, C.stone);
        g.cyl(0.075, 0.075, 0.012, 8, 0.25, 0.232, 0.27, C.water);
      }
      break;
    }

    case 'tree': {
      const ox = (rand01(p.seed, 7) - 0.5) * 0.16;
      const oz = (rand01(p.seed, 8) - 0.5) * 0.16;
      if (p.seed % 2 === 0) {
        g.cyl(0.045, 0.06, 0.28, 6, 0, 0, 0, C.trunk);
        g.ball(0.27, 0, 0.47, 0, C.leafA, 1);
        g.ball(0.19, 0.14, 0.63, 0.05, C.leafC, 1);
        g.ball(0.17, -0.13, 0.58, -0.09, C.leafB, 1);
      } else {
        g.cyl(0.04, 0.055, 0.22, 6, 0, 0, 0, C.trunk);
        g.cone(0.3, 0.36, 7, 0, 0.18, 0, C.pineA);
        g.cone(0.24, 0.32, 7, 0, 0.4, 0, C.pineB);
        g.cone(0.16, 0.28, 7, 0, 0.62, 0, C.pineA);
      }
      g.scale(0.85 + rand01(p.seed, 9) * 0.3);
      for (let i = 0; i < g.pos.length; i += 3) {
        g.pos[i] += ox;
        g.pos[i + 2] += oz;
      }
      data.sway = true;
      break;
    }

    case 'lamp': {
      glowMat = mats.lamp;
      g.cyl(0.07, 0.09, 0.05, 8, 0, 0, 0, C.stoneDark);
      g.cyl(0.02, 0.026, 0.5, 6, 0, 0.05, 0, C.metal);
      g.box(0.12, 0.02, 0.12, 0, 0.55, 0, C.metal);
      glow.box(0.085, 0.1, 0.085, 0, 0.57, 0, '#fff');
      g.cone(0.095, 0.06, 4, 0, 0.67, 0, C.metal, Math.PI / 4);
      const disc = new THREE.Mesh(glowDisc, mats.lampGlow);
      disc.position.y = 0.07;
      disc.userData.fx = true;
      disc.userData.shared = true;
      disc.renderOrder = 2;
      extras.push(disc);
      break;
    }

    case 'dock': {
      // 本地 +z 指向远离陆地的一端
      ry = DIR_RY[opp(p.d)];
      for (let i = 0; i < 6; i++) g.box(0.5, 0.035, 0.145, 0, -0.03, -0.425 + i * 0.155, i % 2 ? C.wood : C.woodLight);
      for (const sx of [-0.25, 0.25]) {
        for (const sz of [-0.3, 0.36]) g.cyl(0.035, 0.035, 0.52, 6, sx, -0.47, sz, C.woodDark);
      }
      g.cyl(0.03, 0.03, 0.12, 6, -0.2, 0, 0.36, C.woodDark);
      if (p.boat) {
        const b = new Geo();
        b.box(0.15, 0.07, 0.3, 0, 0, 0, C.wood);
        b.add(new THREE.ConeGeometry(0.075, 0.14, 4), C.wood, 0, 0.035, 0.2, 0, Math.PI / 2);
        b.box(0.11, 0.02, 0.24, 0, 0.07, 0, C.woodLight);
        b.box(0.13, 0.015, 0.04, 0, 0.08, -0.04, C.awningA);
        const boat = new THREE.Mesh(b.build(), mats.solid);
        boat.position.set(0.37, -0.25, 0.05);
        boat.castShadow = true;
        boat.userData.bob = true;
        extras.push(boat);
      }
      break;
    }

    case 'well': {
      g.cyl(0.25, 0.27, 0.18, 10, 0, 0, 0, C.stoneDark);
      g.cyl(0.27, 0.27, 0.045, 10, 0, 0.18, 0, C.stone);
      g.cyl(0.2, 0.2, 0.012, 10, 0, 0.222, 0, C.water);
      for (const sx of [-0.215, 0.215]) g.box(0.035, 0.36, 0.035, sx, 0.2, 0, C.wood);
      g.box(0.5, 0.03, 0.03, 0, 0.5, 0, C.woodDark);
      g.add(new THREE.BoxGeometry(0.56, 0.022, 0.22), C.roofs[0], 0, 0.6, 0.09, 0, 0.5);
      g.add(new THREE.BoxGeometry(0.56, 0.022, 0.22), C.roofs[1], 0, 0.6, -0.09, 0, -0.5);
      g.box(0.008, 0.16, 0.008, 0.04, 0.34, 0, C.woodLight);
      g.cyl(0.045, 0.035, 0.07, 8, 0.04, 0.28, 0, C.wood);
      break;
    }

    case 'field': {
      g.box(0.94, 0.03, 0.94, 0, 0, 0, C.fieldRow);
      g.box(0.88, 0.045, 0.88, 0, 0, 0, C.fieldSoil);
      const kindOf = p.seed % 3;
      const big = p.deco >= 1 ? 1.3 : 1;
      for (let i = 0; i < 4; i++) {
        const rz = -0.3 + i * 0.2;
        g.box(0.8, 0.03, 0.11, 0, 0.045, rz, C.fieldRow);
        for (let k = 0; k < 4; k++) {
          const cx = -0.3 + k * 0.2 + (rand01(p.seed, i, k) - 0.5) * 0.05;
          if (kindOf === 0) {
            // 卷心菜
            g.ball(0.05 * big, cx, 0.1, rz, k % 2 ? C.crop : C.leafC);
          } else if (kindOf === 1) {
            // 胡萝卜：一点橙色，上面是叶子
            g.cone(0.03, 0.05, 5, cx, 0.065, rz, C.cropB);
            g.cone(0.045 * big, 0.09 * big, 5, cx, 0.1, rz, C.crop);
          } else {
            // 麦子
            g.box(0.02, 0.15 * big, 0.02, cx, 0.07, rz, C.wheat);
            g.box(0.035, 0.06 * big, 0.035, cx, 0.07 + 0.13 * big, rz, C.cropB);
          }
        }
      }
      if (p.deco >= 2) {
        // 稻草人
        g.box(0.025, 0.4, 0.025, 0.33, 0.045, -0.33, C.woodDark);
        g.box(0.26, 0.025, 0.025, 0.33, 0.33, -0.33, C.woodDark);
        g.box(0.14, 0.13, 0.05, 0.33, 0.24, -0.33, C.awningA);
        g.ball(0.05, 0.33, 0.44, -0.33, C.straw);
        g.cone(0.085, 0.07, 6, 0.33, 0.47, -0.33, C.wheat);
      }
      break;
    }

    case 'pavilion': {
      g.cyl(0.47, 0.49, 0.06, 6, 0, 0, 0, C.stone, Math.PI / 6);
      for (const sx of [-0.3, 0.3]) {
        for (const sz of [-0.3, 0.3]) g.box(0.05, 0.5, 0.05, sx, 0.06, sz, C.wood);
      }
      for (const s of [-0.3, 0.3]) {
        g.box(0.66, 0.04, 0.05, 0, 0.54, s, C.woodDark);
        g.box(0.05, 0.04, 0.66, s, 0.54, 0, C.woodDark);
      }
      g.cone(0.6, 0.3, 4, 0, 0.58, 0, C.pavRoof, Math.PI / 4);
      g.ball(0.035, 0, 0.9, 0, C.spark);
      // 靠北一侧的长凳
      g.box(0.42, 0.03, 0.1, 0, 0.19, -0.3, C.woodLight);
      for (const sx of [-0.16, 0.16]) g.box(0.03, 0.13, 0.08, sx, 0.06, -0.3, C.woodDark);
      break;
    }

    case 'fountain': {
      g.cyl(0.42, 0.44, 0.14, 10, 0, 0, 0, C.stone);
      g.cyl(0.35, 0.35, 0.012, 10, 0, 0.14, 0, C.water);
      g.cyl(0.05, 0.075, 0.3, 8, 0, 0.14, 0, C.stoneDark);
      g.cyl(0.17, 0.07, 0.06, 8, 0, 0.44, 0, C.stone);
      g.cyl(0.14, 0.14, 0.01, 8, 0, 0.5, 0, C.water);
      g.cyl(0.02, 0.03, 0.1, 6, 0, 0.5, 0, C.stoneDark);
      g.ball(0.045, 0, 0.63, 0, C.drop);
      data.spray = [0, 0.64, 0];
      break;
    }

    case 'market': {
      ry = DIR_RY[p.d];
      glowMat = mats.lamp;
      g.box(0.92, 0.03, 0.92, 0, 0, 0, C.road);
      for (const sx of [-0.4, 0.4]) {
        g.box(0.04, 0.62, 0.04, sx, 0.03, -0.38, C.wood);
        g.box(0.04, 0.5, 0.04, sx, 0.03, 0.38, C.wood);
      }
      // 条纹顶棚，前低后高
      for (let i = 0; i < 6; i++) {
        g.add(new THREE.BoxGeometry(0.155, 0.025, 0.96), i % 2 ? C.canopyB : C.canopyA, -0.3875 + i * 0.155, 0.61, 0, 0, 0.16);
      }
      // 前面的货台和上面的货
      g.box(0.7, 0.2, 0.2, 0, 0.03, 0.27, C.woodLight);
      g.box(0.74, 0.025, 0.24, 0, 0.23, 0.27, C.wood);
      for (let i = 0; i < 5; i++) g.ball(0.04, -0.26 + i * 0.13, 0.29, 0.27, [C.cropB, C.flowers[0], C.crop, C.flowers[1], C.flowers[4]][i]);
      // 后面的箱子
      g.box(0.22, 0.17, 0.22, -0.22, 0.03, -0.18, C.wood);
      g.box(0.18, 0.13, 0.18, 0.2, 0.03, -0.2, C.woodDark);
      g.box(0.16, 0.11, 0.16, -0.2, 0.2, -0.18, C.woodLight);
      g.ball(0.05, 0.2, 0.2, -0.2, C.crop);
      g.box(0.012, 0.1, 0.012, 0.3, 0.42, 0.38, C.metal);
      glow.box(0.07, 0.085, 0.07, 0.3, 0.34, 0.38, '#fff');
      break;
    }

    case 'greenhouse': {
      ry = DIR_RY[p.d];
      g.box(BODY + 0.06, 0.1, BODY + 0.06, 0, 0, 0, C.stone);
      g.box(BODY - 0.06, 0.02, BODY - 0.06, 0, 0.1, 0, C.fieldSoil);
      for (const sx of [-0.41, 0.41]) {
        for (const sz of [-0.41, 0.41]) g.box(0.04, 0.42, 0.04, sx, 0.1, sz, C.frame);
      }
      for (const s of [-0.41, 0.41]) {
        g.box(0.86, 0.035, 0.04, 0, 0.5, s, C.frame);
        g.box(0.04, 0.035, 0.86, s, 0.5, 0, C.frame);
        // 山墙的斜梁
        g.add(new THREE.BoxGeometry(0.035, 0.03, 0.48), C.frame, s, 0.635, 0.2, 0, 0.5);
        g.add(new THREE.BoxGeometry(0.035, 0.03, 0.48), C.frame, s, 0.635, -0.2, 0, -0.5);
      }
      g.box(0.9, 0.035, 0.035, 0, 0.735, 0, C.frame);
      g.box(0.03, 0.4, 0.03, 0, 0.1, -0.41, C.frame);
      // 门
      g.box(0.24, 0.38, 0.03, 0, 0.1, 0.415, C.frame);
      g.box(0.05, 0.03, 0.14, 0, 0.1, 0.48, C.stone);
      // 玻璃
      for (const s of [-0.41, 0.41]) {
        pane.box(0.78, 0.38, 0.012, 0, 0.12, s, '#fff');
        pane.box(0.012, 0.38, 0.78, s, 0.12, 0, '#fff');
      }
      pane.add(new THREE.BoxGeometry(0.84, 0.012, 0.46), '#fff', 0, 0.63, 0.2, 0, 0.5);
      pane.add(new THREE.BoxGeometry(0.84, 0.012, 0.46), '#fff', 0, 0.63, -0.2, 0, -0.5);
      // 里面的花草
      g.box(0.6, 0.1, 0.16, 0, 0.12, -0.24, C.wood);
      for (let i = 0; i < 4; i++) {
        g.ball(0.06, -0.22 + i * 0.15, 0.27, -0.24, i % 2 ? C.leafA : C.leafC);
        g.ball(0.03, -0.22 + i * 0.15, 0.33, -0.22, C.flowers[i]);
      }
      g.cyl(0.05, 0.04, 0.08, 8, -0.24, 0.12, 0.16, C.terracotta);
      g.cone(0.09, 0.26, 6, -0.24, 0.2, 0.16, C.pineB);
      g.cyl(0.05, 0.04, 0.08, 8, 0.24, 0.12, 0.14, C.terracotta);
      g.ball(0.09, 0.24, 0.28, 0.14, C.leafB, 1);
      break;
    }

    case 'windmill': {
      ry = DIR_RY[p.d];
      glowMat = mats.glow[1];
      g.cyl(0.39, 0.39, 0.05, 8, 0, 0, 0, C.stoneDark, Math.PI / 8);
      g.cyl(0.25, 0.36, 1.0, 8, 0, 0, 0, C.millWall, Math.PI / 8);
      g.cyl(0.29, 0.29, 0.05, 8, 0, 1.0, 0, C.woodDark, Math.PI / 8);
      g.cone(0.32, 0.3, 8, 0, 1.05, 0, C.millRoof, Math.PI / 8);
      g.box(0.2, 0.34, 0.05, 0, 0, 0.31, C.frame);
      g.box(0.15, 0.3, 0.06, 0, 0, 0.31, C.door);
      g.box(0.26, 0.03, 0.12, 0, 0, 0.38, C.stone);
      g.box(0.1, 0.14, 0.03, 0, 0.56, 0.27, C.frame);
      glow.box(0.065, 0.1, 0.035, 0, 0.58, 0.272, '#fff');
      g.add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), C.woodDark, 0, 0.95, 0.32, 0, Math.PI / 2);
      // 叶片单独一个网格，绕着轴慢慢转
      const b = new Geo();
      for (let k = 0; k < 4; k++) {
        const rz = (k * Math.PI) / 2;
        b.add(new THREE.BoxGeometry(0.03, 0.52, 0.02).translate(0, 0.28, 0), C.woodDark, 0, 0, 0, 0, 0, rz);
        b.add(new THREE.BoxGeometry(0.13, 0.36, 0.012).translate(0.07, 0.34, 0), C.sail, 0, 0, 0, 0, 0, rz);
      }
      b.ball(0.05, 0, 0, 0, C.woodDark);
      const blades = new THREE.Mesh(b.build(), mats.solid);
      blades.position.set(0, 0.95, 0.43);
      blades.castShadow = true;
      blades.userData.spin = 0.8;
      extras.push(blades);
      break;
    }

    case 'lighthouse': {
      glowMat = mats.lamp;
      g.cyl(0.345, 0.4, 0.5, 8, 0, 0, 0, C.towerStone, Math.PI / 8);
      g.cyl(0.41, 0.41, 0.05, 8, 0, 0, 0, C.stoneDark, Math.PI / 8);
      for (let i = 0; i < 4; i++) {
        const r0 = 0.3 - i * 0.025;
        g.cyl(r0 - 0.025, r0, 0.275, 8, 0, 0.5 + i * 0.275, 0, i % 2 ? C.lightWhite : C.lightRed, Math.PI / 8);
      }
      g.cyl(0.29, 0.26, 0.04, 8, 0, 1.6, 0, C.stoneDark, Math.PI / 8);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.box(0.015, 0.09, 0.015, Math.cos(a) * 0.26, 1.64, Math.sin(a) * 0.26, C.metal);
      }
      glow.cyl(0.13, 0.13, 0.2, 8, 0, 1.64, 0, '#fff', Math.PI / 8);
      g.cyl(0.16, 0.16, 0.025, 8, 0, 1.84, 0, C.metal, Math.PI / 8);
      g.cone(0.2, 0.2, 8, 0, 1.865, 0, C.lightRed, Math.PI / 8);
      g.ball(0.025, 0, 2.08, 0, C.metal);
      const beam = new THREE.Mesh(beamGeo, mats.beam);
      beam.position.y = 1.74;
      beam.userData = { fx: true, shared: true, turn: 0.45 };
      beam.renderOrder = 2;
      extras.push(beam);
      const disc = new THREE.Mesh(glowDisc, mats.lampGlow);
      disc.position.y = 0.07;
      disc.scale.setScalar(1.3);
      disc.userData = { fx: true, shared: true };
      disc.renderOrder = 2;
      extras.push(disc);
      break;
    }
  }

  const group = new THREE.Group();
  if (!g.empty) {
    const mesh = new THREE.Mesh(g.build(), mats.solid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (!glow.empty) group.add(new THREE.Mesh(glow.build(), glowMat));
  if (!pane.empty) {
    const m = new THREE.Mesh(pane.build(), mats.pane);
    m.renderOrder = 2;
    group.add(m);
  }
  for (const e of extras) group.add(e);
  group.rotation.y = ry;
  group.userData = { kind, ...data };
  return group;
}

// 小人：原点在脚底，正面朝 +z
export function buildResident(def) {
  const g = new Geo();
  g.cyl(0.065, 0.1, 0.2, 8, 0, 0, 0, def.body);
  g.ball(0.085, 0, 0.275, 0, C.skin, 1);
  if (def.hat === 'straw') {
    g.cyl(0.15, 0.15, 0.015, 10, 0, 0.32, 0, C.straw);
    g.cyl(0.07, 0.085, 0.06, 8, 0, 0.33, 0, C.straw);
  } else if (def.hat === 'cone') {
    // 观星人的尖帽
    g.cyl(0.13, 0.13, 0.015, 10, 0, 0.32, 0, def.hair);
    g.cone(0.085, 0.2, 8, 0, 0.33, 0, def.hair);
    g.ball(0.02, 0, 0.53, 0, C.spark);
  } else if (def.hat === 'cap') {
    g.cyl(0.088, 0.092, 0.045, 10, 0, 0.32, 0, C.metal);
    g.box(0.12, 0.012, 0.07, 0, 0.32, 0.09, C.metal);
  } else if (def.hat === 'beret') {
    g.ball(0.088, 0, 0.3, -0.02, def.hair, 1);
    g.cyl(0.1, 0.08, 0.035, 10, 0.02, 0.345, 0, '#c0504a');
    g.ball(0.015, 0.02, 0.39, 0, '#c0504a');
  } else {
    g.ball(0.09, 0, 0.3, -0.025, def.hair, 1);
    if (def.style !== 'short') g.ball(0.045, 0, 0.39, -0.03, def.hair, 0);
  }
  for (const sx of [-0.032, 0.032]) g.box(0.018, 0.024, 0.01, sx, 0.265, 0.082, '#3b2f2a');
  const mesh = new THREE.Mesh(g.build(), mats.solid);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

// ---------- 地形 ----------
// 小岛分成几片，一片片从海里长出来。还没长出来的地方是露出水面的沙洲。

const wx = (x) => x - SIZE / 2 + 0.5;

function landCell(g, x, z, cx, cz) {
  g.box(1, 0.1, 1, cx, -0.1, cz, (x + z) % 2 ? C.grassA : C.grassB);
  g.box(1, 0.4, 1, cx, -0.5, cz, C.soil);
}

function eachCell(world, zone, fn) {
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const c = world.cell(x, z);
      if (c.zone === zone && !c.pond) fn(x, z);
    }
  }
}

// 一整片陆地合成一个网格
export function buildZoneLand(world, zone) {
  const g = new Geo();
  eachCell(world, zone, (x, z) => landCell(g, x, z, wx(x), wx(z)));
  const mesh = new THREE.Mesh(g.build(), mats.solid);
  mesh.receiveShadow = true;
  return mesh;
}

// 升起动画用：每格一个网格（两种草色各共用一份几何体）
let cellGeos = null;
export function buildZoneCells(world, zone) {
  if (!cellGeos) {
    cellGeos = [0, 1].map((k) => {
      const g = new Geo();
      landCell(g, k, 0, 0, 0);
      return g.build();
    });
  }
  const out = [];
  eachCell(world, zone, (x, z) => {
    const mesh = new THREE.Mesh(cellGeos[(x + z) % 2], mats.solid);
    mesh.receiveShadow = true;
    mesh.userData.shared = true;
    mesh.position.set(wx(x), 0, wx(z));
    out.push({ mesh, x, z });
  });
  return out;
}

// 还没长出陆地的沙洲
export function buildZoneSand(world, zone) {
  const g = new Geo();
  eachCell(world, zone, (x, z) => {
    const cx = wx(x);
    const cz = wx(z);
    g.box(1, 0.44, 1, cx, -0.5, cz, (x + z) % 2 ? C.sandA : C.sandB);
    const r = rand01(x, z, 5);
    if (r < 0.12) {
      g.ball(0.07 + r * 0.5, cx + (rand01(x, z, 6) - 0.5) * 0.5, -0.05, cz + (rand01(x, z, 7) - 0.5) * 0.5, C.rock, 0);
    } else if (r < 0.2) {
      // 一小丛滩草
      const ox = cx + (rand01(x, z, 6) - 0.5) * 0.5;
      const oz = cz + (rand01(x, z, 7) - 0.5) * 0.5;
      for (let i = 0; i < 3; i++) g.cone(0.025, 0.13, 4, ox + (i - 1) * 0.045, -0.06, oz + (i % 2) * 0.04, C.leafC);
    }
  });
  const mesh = new THREE.Mesh(g.build(), mats.solid);
  mesh.receiveShadow = true;
  return mesh;
}

// 水下的浅滩、礁石和海面
export function buildTerrain(world) {
  const g = new Geo();
  for (let z = -1; z <= SIZE; z++) {
    for (let x = -1; x <= SIZE; x++) {
      // 陆地和沙洲往外一圈都是浅滩
      if (world.near(x, z, 1, (c) => c.zone >= 0)) g.box(1, 0.12, 1, wx(x), -0.62, wx(z), C.sand);
    }
  }
  // 水和岸（陆地、沙洲）交界的地方描一圈白色的浪花：不管什么天色，都看得出哪里是水、哪里不是
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      if (world.cell(x, z).water) continue;
      for (let d = 0; d < 4; d++) {
        const n = world.cell(x + DIRS[d].x, z + DIRS[d].z);
        if (n && !n.water) continue;
        const ns = d % 2 === 0;
        g.box(ns ? 1.1 : 0.09, 0.03, ns ? 0.09 : 1.1, wx(x) + DIRS[d].x * 0.545, -0.205, wx(z) + DIRS[d].z * 0.545, C.foam);
      }
    }
  }
  const rocks = [
    [1, 3, 0.26],
    [1.6, 3.5, 0.16],
    [18, 6, 0.24],
    [16, 15, 0.2],
    [3, 16, 0.22],
    [13, 0, 0.2],
  ];
  for (const [rx, rz, r] of rocks) g.ball(r, wx(rx), -0.42, wx(rz), C.rock, 0);
  const base = new THREE.Mesh(g.build(), mats.solid);
  base.receiveShadow = true;

  const seaMat = new THREE.MeshBasicMaterial({ color: C.sea, transparent: true, opacity: 0.6, depthWrite: false });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.2;
  sea.renderOrder = 1;
  return { base, sea, seaMat };
}
