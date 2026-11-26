// 天气里落下来的东西：毛毛细雨、雪，从树上飘下来的落叶和花瓣，还有雨点落在水面上的涟漪。
// 只管画，下不下、下多大由 game.js 决定。每样东西只占一次绘制；每帧在 CPU 上挪位置，几百个不费事。
import * as THREE from './vendor/three.module.min.js';

const RAIN_N = 520;
const DRIFT_N = 300;
const RIPPLE_N = 40;
const TOP = 11; // 雨雪从多高的地方落下来
const WIND = 0.9; // 往 +x 方向吹

// 每种飘的东西：下落速度、横向摆动、点的大小（世界单位）、有哪些颜色。
// 雪是漫天下的（share：最多用到几成的点）；落叶和花瓣只从树上落下来（fromTrees），一棵树同时只有一两片
const DRIFT = {
  snow: { fall: 1.2, sway: 0.5, wind: 0.25, size: 0.1, colors: ['#ffffff', '#f2f7fb', '#e6eef6'], share: 0.85 },
  leaf: { fall: 0.3, sway: 0.26, wind: 0.2, size: 0.085, colors: ['#e3a04c', '#d0703e', '#eec65c', '#c9853c'], fromTrees: true },
  petal: { fall: 0.24, sway: 0.22, wind: 0.18, size: 0.07, colors: ['#f7c6d2', '#fbe1e7', '#f3aebf'], fromTrees: true },
};

const _m = new THREE.Matrix4();
const _col = new THREE.Color();

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

    // 雨：很短、很淡的细丝
    this.rp = new Float32Array(RAIN_N * 3); // 每滴雨的位置
    this.rs = new Float32Array(RAIN_N); // 每滴雨的快慢
    this.rainPos = new Float32Array(RAIN_N * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: '#eaf4f8', transparent: true, opacity: 0, depthWrite: false });
    this.rainMesh = new THREE.LineSegments(rg, this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 4;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);
    this.rainSeeded = false;

    // 飘的东西
    this.dp = new Float32Array(DRIFT_N * 3);
    this.ds = new Float32Array(DRIFT_N);
    this.dw = new Float32Array(DRIFT_N); // 从树上落的：还要等多久才落下一片
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
    this.driftFresh = true;

    // 涟漪：平躺在水面上的小圆环，慢慢变大变淡。颜色是加上去的，所以把颜色调黑就等于看不见
    const ring = new THREE.RingGeometry(0.74, 1, 16);
    ring.rotateX(-Math.PI / 2);
    this.ripMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ripples = new THREE.InstancedMesh(ring, this.ripMat, RIPPLE_N);
    this.ripples.frustumCulled = false;
    this.ripples.renderOrder = 2;
    this.ripples.visible = false;
    this.rip = new Float32Array(RIPPLE_N * 4); // x、z、已经过了多久、一共多久（0 表示这个圆环闲着）
    _m.makeScale(0, 0, 0);
    _col.setScalar(0);
    for (let i = 0; i < RIPPLE_N; i++) {
      this.ripples.setMatrixAt(i, _m);
      this.ripples.setColorAt(i, _col);
    }
    scene.add(this.ripples);

    for (let i = 0; i < RAIN_N; i++) this.rs[i] = 0.8 + Math.random() * 0.4;
    for (let i = 0; i < DRIFT_N; i++) this.ds[i] = Math.random();
  }

  // rain：下不下雨；kind：飘什么（'snow' | 'leaf' | 'petal' | null）
  set(rain, kind) {
    this.rainGoal = rain ? 1 : 0;
    this.kindGoal = kind;
    this.driftGoal = kind ? 1 : 0;
  }

  // 换了一种东西飘：雪撒到镜头周围；落叶花瓣先都藏起来，各等各的时间再从树上落
  resetDrift(cx, cz, r) {
    const fromTrees = DRIFT[this.kind].fromTrees;
    for (let i = 0; i < DRIFT_N; i++) {
      this.dp[i * 3] = cx + (Math.random() * 2 - 1) * r;
      this.dp[i * 3 + 1] = fromTrees ? -9 : Math.random() * TOP;
      this.dp[i * 3 + 2] = cz + (Math.random() * 2 - 1) * r;
      this.dw[i] = fromTrees ? 0.2 + Math.random() * 6 : 0;
    }
    const cols = DRIFT[this.kind].colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < DRIFT_N; i++) {
      const c = cols[i % cols.length];
      this.driftCol[i * 3] = c.r;
      this.driftCol[i * 3 + 1] = c.g;
      this.driftCol[i * 3 + 2] = c.b;
    }
    this.driftMesh.geometry.attributes.color.needsUpdate = true;
    this.driftFresh = false;
  }

  // cx、cz：镜头对着哪里；r：画面里看得到的范围有多大；pxPerUnit：一个世界单位在屏幕上是几个像素；
  // fx：画质允许画几成（0-1）；dim：天有多暗（夜里雨丝别太亮）；
  // env：{ trees: 会落叶的树 [[x, z], …], detail: 画得多细 0-2, isWater(x, z): 那里是不是水面 }
  update(dt, cx, cz, r, pxPerUnit, fx, dim, env) {
    this.time += dt;
    const ease = Math.min(1, dt / 6); // 六秒左右下起来、停下来
    this.rain += Math.sign(this.rainGoal - this.rain) * Math.min(Math.abs(this.rainGoal - this.rain), ease);
    // 换一种东西飘：先停下，再换
    if (this.kind !== this.kindGoal) {
      this.drift = Math.max(0, this.drift - ease * 2);
      if (this.drift === 0) {
        this.kind = this.kindGoal;
        this.driftFresh = true;
      }
    } else {
      this.drift += Math.sign(this.driftGoal - this.drift) * Math.min(Math.abs(this.driftGoal - this.drift), ease);
    }
    const raining = this.rain > 0.001;
    const drifting = this.drift > 0.001 && !!this.kind;
    const rippling = raining && env.detail > 0;
    this.rainMesh.visible = raining;
    this.driftMesh.visible = drifting;
    this.ripples.visible = rippling;

    if (raining) {
      if (!this.rainSeeded) {
        for (let i = 0; i < RAIN_N; i++) {
          this.rp[i * 3] = cx + (Math.random() * 2 - 1) * r;
          this.rp[i * 3 + 1] = Math.random() * TOP;
          this.rp[i * 3 + 2] = cz + (Math.random() * 2 - 1) * r;
        }
        this.rainSeeded = true;
      }
      const n = Math.max(1, Math.floor(RAIN_N * this.rain * fx));
      const p = this.rp;
      const out = this.rainPos;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        p[k + 1] -= 8.5 * this.rs[i] * dt;
        p[k] += WIND * 0.9 * dt;
        if (p[k + 1] < -0.2 || Math.abs(p[k] - cx) > r || Math.abs(p[k + 2] - cz) > r) {
          p[k] = cx + (Math.random() * 2 - 1) * r;
          p[k + 1] = TOP * (0.6 + Math.random() * 0.5);
          p[k + 2] = cz + (Math.random() * 2 - 1) * r;
        }
        const o = i * 6;
        out[o] = p[k];
        out[o + 1] = p[k + 1];
        out[o + 2] = p[k + 2];
        out[o + 3] = p[k] - 0.02;
        out[o + 4] = p[k + 1] + 0.2;
        out[o + 5] = p[k + 2];
      }
      this.rainMesh.geometry.setDrawRange(0, n * 2);
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
      this.rainMat.opacity = 0.34 * Math.min(1, this.rain * 2) * (1 - dim * 0.45);
    }

    if (rippling) {
      const n = Math.max(1, Math.floor(RIPPLE_N * fx * (env.detail === 2 ? 1 : 0.5)));
      const q = this.rip;
      const glow = 0.5 * this.rain * (1 - dim * 0.55);
      for (let i = 0; i < n; i++) {
        const k = i * 4;
        q[k + 2] += dt;
        if (q[k + 3] === 0 || q[k + 2] >= q[k + 3]) {
          // 这一圈散完了：另找一处水面，等一小会儿再荡开
          q[k + 3] = 0;
          for (let tries = 0; tries < 3; tries++) {
            const x = cx + (Math.random() * 2 - 1) * r * 0.85;
            const z = cz + (Math.random() * 2 - 1) * r * 0.85;
            if (!env.isWater(x, z)) continue;
            q[k] = x;
            q[k + 1] = z;
            q[k + 2] = -Math.random() * 0.7;
            q[k + 3] = 0.7 + Math.random() * 0.5;
            break;
          }
        }
        const f = q[k + 3] ? q[k + 2] / q[k + 3] : -1;
        if (f < 0) {
          _m.makeScale(0, 0, 0);
          _col.setScalar(0);
        } else {
          const s = 0.03 + 0.19 * f;
          _m.makeScale(s, 1, s).setPosition(q[k], -0.178, q[k + 1]);
          _col.setScalar(glow * (1 - f));
        }
        this.ripples.setMatrixAt(i, _m);
        this.ripples.setColorAt(i, _col);
      }
      this.ripples.count = n;
      this.ripples.instanceMatrix.needsUpdate = true;
      this.ripples.instanceColor.needsUpdate = true;
    }

    if (drifting) {
      if (this.driftFresh) this.resetDrift(cx, cz, r);
      const d = DRIFT[this.kind];
      const p = this.dp;
      let n;
      if (d.fromTrees) {
        // 落叶、花瓣：从树冠里出来，落到地上就没了，过一阵子同一个位置再落一片
        const trees = env.trees;
        n = Math.min(DRIFT_N, 70, Math.ceil(trees.length * env.detail * this.drift));
        for (let i = 0; i < n; i++) {
          const k = i * 3;
          const s = this.ds[i];
          if (this.dw[i] > 0) {
            this.dw[i] -= dt;
            if (this.dw[i] > 0 || !trees.length) continue;
            const t = trees[Math.floor(Math.random() * trees.length)];
            p[k] = t[0] + (Math.random() - 0.5) * 0.42;
            p[k + 1] = 0.36 + Math.random() * 0.3;
            p[k + 2] = t[1] + (Math.random() - 0.5) * 0.42;
          }
          p[k + 1] -= d.fall * (0.7 + s * 0.6) * dt;
          p[k] += (WIND * d.wind + Math.sin(this.time * (1.6 + s) + s * 40) * d.sway) * dt;
          p[k + 2] += Math.cos(this.time * (1.3 + s) + s * 25) * d.sway * 0.7 * dt;
          if (p[k + 1] < 0.02) {
            p[k + 1] = -9;
            this.dw[i] = 1.5 + Math.random() * 5;
          }
        }
      } else {
        n = Math.max(1, Math.floor(DRIFT_N * d.share * this.drift * fx));
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
      }
      this.driftMesh.geometry.setDrawRange(0, n);
      this.driftMesh.geometry.attributes.position.needsUpdate = true;
      this.driftMat.size = Math.max(2, d.size * pxPerUnit);
      this.driftMat.opacity = 0.95 * Math.min(1, this.drift * 2) * (1 - dim * 0.35);
    }
  }
}
