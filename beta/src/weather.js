// 天气里飘着的东西：雨丝，以及雪花、落叶、花瓣。只管画，下不下、下多大由 game.js 决定。
// 雨是一批线段，飘的东西是一批点，各自只占一次绘制；每帧在 CPU 上挪位置，几百个不费事。
import * as THREE from './vendor/three.module.min.js';

const RAIN_N = 900;
const DRIFT_N = 360;
const TOP = 11; // 从多高的地方落下来
const WIND = 0.9; // 往 +x 方向吹

// 每种飘的东西：下落速度、横向摆动、点的大小（世界单位）、有哪些颜色、最多用到几成的点
const DRIFT = {
  snow: { fall: 1.3, sway: 0.5, wind: 0.25, size: 0.1, colors: ['#ffffff', '#f2f7fb', '#e6eef6'], share: 1 },
  leaf: { fall: 0.85, sway: 0.9, wind: 1, size: 0.14, colors: ['#e3a04c', '#d0703e', '#eec65c', '#c9853c'], share: 0.3 },
  petal: { fall: 0.55, sway: 0.7, wind: 0.6, size: 0.1, colors: ['#f7c6d2', '#fbe1e7', '#f3aebf'], share: 0.22 },
};

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Weather {
  constructor(scene) {
    this.time = 0;
    this.rain = 0; // 现在下得多大（0-1），朝 rainGoal 慢慢靠
    this.rainGoal = 0;
    this.drift = 0;
    this.driftGoal = 0;
    this.kind = null; // 现在飘的是什么
    this.kindGoal = null;

    // 雨
    this.rp = new Float32Array(RAIN_N * 3); // 每滴雨的位置
    this.rs = new Float32Array(RAIN_N); // 每滴雨的快慢
    this.rainPos = new Float32Array(RAIN_N * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: '#e4f2f8', transparent: true, opacity: 0, depthWrite: false });
    this.rainMesh = new THREE.LineSegments(rg, this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 4;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    // 飘的东西
    this.dp = new Float32Array(DRIFT_N * 3);
    this.ds = new Float32Array(DRIFT_N);
    this.driftCol = new Float32Array(DRIFT_N * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dp, 3));
    dg.setAttribute('color', new THREE.BufferAttribute(this.driftCol, 3));
    this.driftMat = new THREE.PointsMaterial({ size: 4, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: false });
    this.driftMesh = new THREE.Points(dg, this.driftMat);
    this.driftMesh.frustumCulled = false;
    this.driftMesh.renderOrder = 4;
    this.driftMesh.visible = false;
    scene.add(this.driftMesh);

    for (let i = 0; i < RAIN_N; i++) this.rs[i] = 0.8 + Math.random() * 0.4;
    for (let i = 0; i < DRIFT_N; i++) this.ds[i] = Math.random();
    this.seeded = false;
  }

  // rain：下不下雨；kind：飘什么（'snow' | 'leaf' | 'petal' | null）
  set(rain, kind) {
    this.rainGoal = rain ? 1 : 0;
    this.kindGoal = kind;
    this.driftGoal = kind ? 1 : 0;
  }

  // 第一次用、或者镜头挪远了：把所有点撒到镜头周围
  scatter(cx, cz, r) {
    for (let i = 0; i < RAIN_N; i++) {
      this.rp[i * 3] = cx + (Math.random() * 2 - 1) * r;
      this.rp[i * 3 + 1] = Math.random() * TOP;
      this.rp[i * 3 + 2] = cz + (Math.random() * 2 - 1) * r;
    }
    for (let i = 0; i < DRIFT_N; i++) {
      this.dp[i * 3] = cx + (Math.random() * 2 - 1) * r;
      this.dp[i * 3 + 1] = Math.random() * TOP;
      this.dp[i * 3 + 2] = cz + (Math.random() * 2 - 1) * r;
    }
    this.seeded = true;
  }

  paint(kind) {
    const cols = DRIFT[kind].colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < DRIFT_N; i++) {
      const c = cols[i % cols.length];
      this.driftCol[i * 3] = c.r;
      this.driftCol[i * 3 + 1] = c.g;
      this.driftCol[i * 3 + 2] = c.b;
    }
    this.driftMesh.geometry.attributes.color.needsUpdate = true;
  }

  // cx、cz：镜头对着哪里；r：画面里看得到的范围有多大；pxPerUnit：一个世界单位在屏幕上是几个像素；
  // fx：画质允许画几成（0-1）；dim：天有多暗（夜里雨丝别太亮）
  update(dt, cx, cz, r, pxPerUnit, fx, dim) {
    this.time += dt;
    const ease = Math.min(1, dt / 6); // 六秒左右下起来、停下来
    this.rain += Math.sign(this.rainGoal - this.rain) * Math.min(Math.abs(this.rainGoal - this.rain), ease);
    // 换一种东西飘：先停下，再换
    if (this.kind !== this.kindGoal) {
      this.drift = Math.max(0, this.drift - ease * 2);
      if (this.drift === 0) {
        this.kind = this.kindGoal;
        if (this.kind) this.paint(this.kind);
      }
    } else {
      this.drift += Math.sign(this.driftGoal - this.drift) * Math.min(Math.abs(this.driftGoal - this.drift), ease);
    }
    const raining = this.rain > 0.001;
    const drifting = this.drift > 0.001 && !!this.kind;
    this.rainMesh.visible = raining;
    this.driftMesh.visible = drifting;
    if (!raining && !drifting) return;
    if (!this.seeded) this.scatter(cx, cz, r);

    if (raining) {
      const n = Math.max(1, Math.floor(RAIN_N * this.rain * fx));
      const p = this.rp;
      const out = this.rainPos;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        const v = 17 * this.rs[i];
        p[k + 1] -= v * dt;
        p[k] += WIND * 1.6 * dt;
        if (p[k + 1] < -0.2 || Math.abs(p[k] - cx) > r || Math.abs(p[k + 2] - cz) > r) {
          p[k] = cx + (Math.random() * 2 - 1) * r;
          p[k + 1] = TOP * (0.6 + Math.random() * 0.5);
          p[k + 2] = cz + (Math.random() * 2 - 1) * r;
        }
        const o = i * 6;
        out[o] = p[k];
        out[o + 1] = p[k + 1];
        out[o + 2] = p[k + 2];
        out[o + 3] = p[k] - 0.05;
        out[o + 4] = p[k + 1] + 0.55;
        out[o + 5] = p[k + 2];
      }
      this.rainMesh.geometry.setDrawRange(0, n * 2);
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
      this.rainMat.opacity = 0.5 * Math.min(1, this.rain * 2) * (1 - dim * 0.45);
    }

    if (drifting) {
      const d = DRIFT[this.kind];
      const n = Math.max(1, Math.floor(DRIFT_N * d.share * this.drift * fx));
      const p = this.dp;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        const s = this.ds[i];
        p[k + 1] -= d.fall * (0.7 + s * 0.6) * dt;
        p[k] += (WIND * d.wind + Math.sin(this.time * (1.1 + s) + s * 40) * d.sway) * dt;
        p[k + 2] += Math.cos(this.time * (0.9 + s) + s * 25) * d.sway * 0.6 * dt;
        if (p[k + 1] < 0 || Math.abs(p[k] - cx) > r || Math.abs(p[k + 2] - cz) > r) {
          p[k] = cx + (Math.random() * 2 - 1) * r;
          p[k + 1] = TOP * (0.5 + Math.random() * 0.5);
          p[k + 2] = cz + (Math.random() * 2 - 1) * r;
        }
      }
      this.driftMesh.geometry.setDrawRange(0, n);
      this.driftMesh.geometry.attributes.position.needsUpdate = true;
      this.driftMat.size = Math.max(2, d.size * pxPerUnit);
      this.driftMat.opacity = 0.95 * Math.min(1, this.drift * 2) * (1 - dim * 0.35);
    }
  }
}
