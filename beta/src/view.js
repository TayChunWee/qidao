// 3D 场景：镜头、灯光与昼夜、零件的增删动画、摆放虚影、粒子、拾取。
import * as THREE from './vendor/three.module.min.js';
import { SIZE, H, C, DIRS, DIR_RY, opp, SEASON_COLORS, SEASON_LIGHT } from './config.js';
import { buildPart, buildTerrain, buildZoneLand, buildZoneCells, buildZoneSand, buildScatter, resetLandCache, mats, SCENE, sceneStamp } from './models.js';
import { MAX_STAGE, START_CENTER } from './world.js';
import { describeCell, ghostParts } from './viewmodel.js';
import { Anim, ease } from './anim.js';
import { Weather } from './weather.js';

// 跟着季节变色的东西：换季时这些零件要重画，别的不用动
const SEASONAL = new Set(['tree', 'garden', 'field']);
// 会积雪、会落上树叶的东西：雪厚了一档、换了季节或换了画质时重画
const DRESSED = new Set(['roof', 'cone', 'flat', 'tree', 'garden', 'field', 'lamp', 'well', 'pavilion', 'fountain', 'market', 'windmill', 'lighthouse', 'door', 'balcony', 'rail']);
const SEASON_KEYS = [...new Set(SEASON_COLORS.flatMap((s) => Object.keys(s)))];
const SUMMER = Object.fromEntries(SEASON_KEYS.map((k) => [k, C[k]])); // C 里原本的颜色
const OVERCAST = new THREE.Color('#b9c2cc'); // 下雨下雪时天色往这个灰里靠
const _a = new THREE.Color();
const _b = new THREE.Color();

const ELEV = THREE.MathUtils.degToRad(34);
const CAM_DIST = 60;
const VIEW_H = 15.5; // 缩放为 1 时竖直方向可见的世界单位
const ZOOM_MAX = 2.8; // 最多放大到几倍（宽屏上）
const HALF_SIZE = SIZE / 2;
const PAN_LIMIT = HALF_SIZE;
const RISE_DEPTH = -0.95; // 新陆地从多深的地方升上来

// 小岛每个阶段的取景：镜头对准哪里、拉多远，以及阴影要覆盖多大的范围
const FRAMES = [
  { x: -1.0, z: -0.6, zoom: 1.42, shadow: 8.5 },
  { x: 1.3, z: -0.4, zoom: 1.0, shadow: 12 },
  { x: 1.0, z: -1.8, zoom: 0.88, shadow: 13.5 },
  { x: -0.4, z: -0.4, zoom: 0.72, shadow: 15.5 },
];

const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// 昼夜关键帧：时间、阳光色、阳光强度、天光色、地面反光色、环境光强度、海水色
const KEYS = [
  [0.0, '#ffc7a0', 1.4, '#f6d8cc', '#b7a48c', 2.2, '#a9a8d2'],
  [0.07, '#fff0d8', 2.6, '#e2f0fa', '#c9b99a', 1.7, '#8ad0dc'],
  [0.3, '#fff8ec', 3.0, '#e6f3fb', '#cbbf9f', 1.7, '#84cfdd'],
  [0.46, '#ffe3b4', 2.8, '#fde8d2', '#c9b494', 1.9, '#8bcbd2'],
  [0.53, '#ffc08c', 2.3, '#ffe2cc', '#c2a48c', 2.7, '#a99bcb'],
  [0.565, '#ff9a7a', 1.0, '#e6bccb', '#9a8496', 2.3, '#8a78b4'],
  [0.59, '#ff7f5e', 0.0, '#9d93c8', '#5f5a80', 1.6, '#56548a'],
  [0.63, '#a9bcff', 0.0, '#6170b0', '#3d4370', 1.1, '#2a3566'],
  [0.7, '#a9bcff', 0.85, '#5a69a6', '#373d68', 0.9, '#243060'],
  [0.93, '#a9bcff', 0.85, '#5a69a6', '#373d68', 0.9, '#243060'],
  [0.975, '#c9b6e8', 0.0, '#a297c8', '#665c80', 1.5, '#6a6398'],
  [1.0, '#ffc7a0', 1.4, '#f6d8cc', '#b7a48c', 2.2, '#a9a8d2'],
].map(([t, sun, si, sky, gnd, hi, sea]) => ({
  t,
  sun: new THREE.Color(sun),
  si,
  sky: new THREE.Color(sky),
  gnd: new THREE.Color(gnd),
  hi,
  sea: new THREE.Color(sea),
}));

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.beginPath();
  g.roundRect(9, 9, 110, 110, 24);
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Particles {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.mats = {
      dust: new THREE.MeshStandardMaterial({ color: C.dust, flatShading: true, roughness: 1, transparent: true, opacity: 0.9 }),
      smoke: new THREE.MeshStandardMaterial({ color: C.smoke, flatShading: true, roughness: 1, transparent: true, opacity: 0.75 }),
      spark: new THREE.MeshBasicMaterial({ color: C.spark }),
      drop: new THREE.MeshBasicMaterial({ color: C.drop, transparent: true, opacity: 0.85 }),
    };
    this.live = [];
    this.pool = [];
  }

  spawn(type, x, y, z, vx, vy, vz, life, size, grav = 0) {
    if (this.live.length > 260) return;
    const m = this.pool.pop() || new THREE.Mesh(this.geo);
    m.material = this.mats[type];
    m.position.set(x, y, z);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    m.scale.setScalar(0.001);
    this.scene.add(m);
    this.live.push({ m, vx, vy, vz, life, age: 0, size, grav, drag: type === 'smoke' ? 0.5 : type === 'spark' ? 1.5 : type === 'drop' ? 0.6 : 3.6 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const f = p.age / p.life;
      if (f >= 1) {
        this.scene.remove(p.m);
        this.pool.push(p.m);
        this.live.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.grav * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      p.m.rotation.x += dt;
      const s = p.size * Math.min(1, f * 8) * (1 - f) ** 0.7;
      p.m.scale.setScalar(Math.max(s, 0.001));
    }
  }
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.resScale = 1; // 渲染分辨率的倍数，掉帧时由 perf.js 调低
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 阴影贴图什么时候重画由 render() 决定，不必每帧都画
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowAt = -1e9;
    this.shadowGap = 10.5;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.sea);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    this.az = -Math.PI / 4;
    this.azGoal = this.az;
    this.zoom = FRAMES[0].zoom;
    this.zoomGoal = this.zoom;
    this.zoomMax = ZOOM_MAX;
    this.target = new THREE.Vector3(FRAMES[0].x, 0.7, FRAMES[0].z);
    this.targetGoal = this.target.clone();
    this.frame = FRAMES[0];

    this.hemi = new THREE.HemisphereLight('#ffffff', '#c9b99a', 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.anim = new Anim();
    this.particles = new Particles(this.scene);
    this.weather = new Weather(this.scene);
    this.fx = 1; // 画质允许天气的粒子画几成，由 perf.js 调
    this.wet = 0; // 天有多阴（0-1），下雨下雪时慢慢变阴
    this.wetGoal = 0;
    this.seasonStamp = '';
    this.dressStamp = sceneStamp();
    this.scatter = null; // 草地上的零碎：野花、草丛、落叶、雪堆
    this.puddles = null; // 水洼
    this.scatterKey = '';
    this.puddle = 0; // 水洼显出来几成：雨下一阵子才有，停了慢慢干
    this.raining = false;
    this.lastCtx = null;
    // 天气要知道的事：哪些树会落叶、画得多细、哪里是水面
    this.env = {
      trees: [],
      detail: SCENE.detail,
      isWater: (x, z) => {
        const c = this.world && this.world.cell(Math.floor(x + HALF_SIZE), Math.floor(z + HALF_SIZE));
        return !c || c.water;
      },
    };
    this.seasonTint = new THREE.Color(1, 1, 1);
    this.seasonBright = 1;
    this.markerBase = 0.26;
    this.time = 0;
    this.night = 0;
    this.sunTheta = 0;
    this.isDay = true;

    // 每个格子一个容器，零件都挂在容器下面
    this.cellGroups = [];
    this.parts = [];
    this.root = new THREE.Group();
    this.scene.add(this.root);
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const g = new THREE.Group();
        g.position.set(x - HALF_SIZE + 0.5, 0, z - HALF_SIZE + 0.5);
        this.root.add(g);
        this.cellGroups.push(g);
        this.parts.push(new Map());
      }
    }
    this.swayers = new Set();
    this.bobbers = new Set();
    this.spinners = new Set();
    this.turners = new Set();
    this.emitters = [];
    this.sprayers = [];
    this.smokeTimer = 0;
    this.sprayTimer = 0;

    // 拾取用的隐形盒子
    this.pickGeo = new THREE.BoxGeometry(1, 1, 1);
    this.pickMat = new THREE.MeshBasicMaterial();
    this.pickCells = new THREE.Group();
    this.pickBalconies = new THREE.Group();
    this.pickCells.visible = false;
    this.pickBalconies.visible = false;
    this.scene.add(this.pickCells, this.pickBalconies);
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const m = new THREE.Mesh(this.pickGeo, this.pickMat);
        m.userData = { x, z };
        this.pickCells.add(m);
      }
    }
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    // 摆放虚影、落点高亮、拆除标记
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.ghostType = null;
    this.ghostPos = new THREE.Vector3();
    this.ghostRot = 0;
    this.ghostShake = 0;
    this.ghostFresh = true;
    this.okColor = new THREE.Color('#f4fff0');
    this.badColor = new THREE.Color('#ff8f7c');

    this.hl = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, color: '#ffffff' }),
    );
    this.hl.rotation.x = -Math.PI / 2;
    this.hl.visible = false;
    this.hl.renderOrder = 3;
    this.scene.add(this.hl);
    this.hlPos = new THREE.Vector3();

    this.marker = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ff7a66', transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.marker.visible = false;
    this.marker.renderOrder = 3;
    this.scene.add(this.marker);

    // 点居民卡片时，在他的家上闪一下的标记
    this.pingBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.pingBox.visible = false;
    this.pingBox.renderOrder = 3;
    this.scene.add(this.pingBox);

    // 圈选框：四条边加一层淡淡的底色。拖动时，圈住的格子连同上面的东西一起跟着走
    this.selMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false });
    this.selFillMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false });
    this.selGroup = new THREE.Group();
    this.selBars = [0, 1, 2, 3].map(() => new THREE.Mesh(this.pickGeo, this.selMat));
    this.selFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.selFillMat);
    this.selFill.rotation.x = -Math.PI / 2;
    for (const m of [...this.selBars, this.selFill]) {
      m.renderOrder = 3;
      this.selGroup.add(m);
    }
    this.selGroup.visible = false;
    this.scene.add(this.selGroup);
    this.selBase = new THREE.Vector3();
    this.selOff = new THREE.Vector3();
    this.selGoal = new THREE.Vector3();
    this.lifted = [];

    this.hover = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // 有些手机浏览器转屏时不报 resize，或者报得太早，尺寸还是旧的
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    this.setTime(0.1);
    this.updateCamera(1);
  }

  // ---------- 地形 ----------

  setWorld(world) {
    this.world = world;
    if (this.terrain) {
      // 重新开始：把陆地和沙洲换成新世界的样子
      for (const m of [...this.zoneLand, ...this.zoneSand]) {
        if (!m) continue;
        this.scene.remove(m);
        m.geometry.dispose();
      }
      for (const g of this.cellGroups) g.position.y = 0;
      this.dropScatter();
    } else {
      this.terrain = buildTerrain(world);
      this.scene.add(this.terrain.base, this.terrain.sea);
      this.addGlints();
    }
    this.terrainGen = (this.terrainGen || 0) + 1;
    this.zoneLand = [];
    this.zoneSand = [];
    for (let zone = 0; zone <= MAX_STAGE; zone++) {
      if (zone <= world.stage) {
        this.zoneLand[zone] = buildZoneLand(world, zone);
        this.scene.add(this.zoneLand[zone]);
      } else {
        this.zoneSand[zone] = buildZoneSand(world, zone);
        this.scene.add(this.zoneSand[zone]);
      }
    }
    this.frameStage(world.stage, true);
  }

  // 海面上忽明忽暗的波光
  addGlints() {
    const geo = new THREE.PlaneGeometry(0.55, 0.05);
    geo.rotateX(-Math.PI / 2);
    this.glints = [];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      // 只放在地图外面的海上
      let x = 0;
      let z = 0;
      while (Math.abs(x) < HALF_SIZE + 0.6 && Math.abs(z) < HALF_SIZE + 0.6) {
        x = (Math.random() - 0.5) * 48;
        z = (Math.random() - 0.5) * 48;
      }
      m.position.set(x, -0.17, z);
      m.scale.x = 0.6 + Math.random() * 0.9;
      m.renderOrder = 2;
      m.userData = { phase: Math.random() * 6.28, speed: 0.35 + Math.random() * 0.4, x0: x };
      this.scene.add(m);
      this.glints.push(m);
    }
  }

  // 把镜头和阴影范围对准小岛现在的大小
  frameStage(stage, instant = false) {
    const f = FRAMES[stage];
    this.frame = f;
    this.targetGoal.set(f.x, 0.7, f.z);
    this.zoomGoal = f.zoom;
    if (instant) {
      this.target.copy(this.targetGoal);
      this.zoom = f.zoom;
    }
    const sc = this.sun.shadow.camera;
    sc.left = -f.shadow;
    sc.right = f.shadow;
    sc.top = f.shadow;
    sc.bottom = -f.shadow;
    sc.updateProjectionMatrix();
    this.sun.target.position.set(f.x, 0, f.z);
  }

  // 一片新陆地从海里升起来：离老岛近的格子先冒头，格子上的东西跟着一起升
  raiseZone(world, zone, startDelay = 0.6) {
    const sand = this.zoneSand[zone];
    if (sand) {
      this.zoneSand[zone] = null;
      this.anim.add(
        sand,
        1.6,
        (k) => {
          sand.position.y = -0.5 * ease.inOut(k);
        },
        {
          delay: startDelay,
          onDone: () => {
            this.scene.remove(sand);
            sand.geometry.dispose();
          },
        },
      );
    }
    const gen = this.terrainGen;
    const cells = buildZoneCells(world, zone);
    let last = 0;
    for (const c of cells) {
      const grp = this.cellGroups[c.z * SIZE + c.x];
      const dist = Math.hypot(c.x - START_CENTER.x, c.z - START_CENTER.z);
      const delay = startDelay + Math.max(0, dist - 4.5) * 0.13 + Math.random() * 0.08;
      last = Math.max(last, delay);
      c.mesh.position.y = RISE_DEPTH;
      grp.position.y = RISE_DEPTH;
      this.scene.add(c.mesh);
      this.anim.add(
        c.mesh,
        0.9,
        (k) => {
          const y = RISE_DEPTH * (1 - ease.outBack(k));
          c.mesh.position.y = y;
          grp.position.y = y;
        },
        {
          delay,
          onStart: () => {
            const p = c.mesh.position;
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * 6.28;
              this.particles.spawn('drop', p.x + Math.cos(a) * 0.3, -0.15, p.z + Math.sin(a) * 0.3, Math.cos(a) * 0.5, 1.6 + Math.random(), Math.sin(a) * 0.5, 0.7, 0.06 + Math.random() * 0.04, -4);
            }
          },
        },
      );
    }
    // 全部升完以后，把一格格的网格换成合并好的一整片
    this.anim.add({}, last + 1.0, () => {}, {
      onDone: () => {
        for (const c of cells) {
          this.scene.remove(c.mesh);
          this.cellGroups[c.z * SIZE + c.x].position.y = 0;
        }
        if (gen !== this.terrainGen || this.zoneLand[zone]) return;
        this.zoneLand[zone] = buildZoneLand(world, zone);
        this.scene.add(this.zoneLand[zone]);
        this.refreshScatter(world);
      },
    });
    return last + 1.0;
  }

  // ---------- 镜头 ----------

  pixelRatio() {
    return Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2) * this.resScale);
  }

  // 画质：scale 渲染分辨率的倍数；shadowSize 阴影贴图边长；shadowGap 阴影最少隔多少毫秒重画
  setQuality(scale, shadowSize, shadowGap) {
    if (scale !== this.resScale) {
      this.resScale = scale;
      this.renderer.setPixelRatio(this.pixelRatio());
    }
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== shadowSize) {
      sh.mapSize.set(shadowSize, shadowSize);
      if (sh.map) {
        sh.map.dispose();
        sh.map = null;
      }
      this.shadowAt = -1e9;
    }
    this.shadowGap = shadowGap;
  }

  // 画得多细：0 只换颜色、屋顶和树有雪；1 再加地上的零碎和小物件上的雪；2 全都有（冰凌、涟漪、更密的花草）
  setDetail(d) {
    if (d === SCENE.detail) return;
    SCENE.detail = d;
    this.env.detail = d;
    this.dressStamp = sceneStamp();
    this.resync();
  }

  // 世界没变，只是画法变了：照上一次的样子重画一遍
  resync() {
    if (this.world && this.lastCtx && this.terrain) this.sync(this.world, this.lastCtx, 'instant');
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.pixelRatio()); // 缩放网页或换屏幕时，像素比会变
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // 窗口很窄时保证整座岛都在画面里
    const vh = Math.max(VIEW_H, 21 / aspect);
    this.viewH = vh;
    // 竖着拿的手机为了装下整座岛，画面本来就缩小了好几倍；放大的上限跟着抬高，
    // 放到最大时房子在屏幕上和电脑上差不多大
    this.zoomMax = ZOOM_MAX * Math.min(2.5, vh / VIEW_H);
    this.zoomGoal = Math.min(this.zoomGoal, this.zoomMax);
    this.camera.left = (-vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(k) {
    this.az = lerp(this.az, this.azGoal, k);
    this.zoom = lerp(this.zoom, this.zoomGoal, k);
    this.target.lerp(this.targetGoal, k);
    const ce = Math.cos(ELEV);
    this.camera.position.set(
      this.target.x + Math.sin(this.az) * ce * CAM_DIST,
      this.target.y + Math.sin(ELEV) * CAM_DIST,
      this.target.z + Math.cos(this.az) * ce * CAM_DIST,
    );
    this.camera.lookAt(this.target);
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  rotateCam(dir) {
    this.azGoal += (dir * Math.PI) / 2;
  }

  zoomBy(delta) {
    this.zoomGoal = Math.min(this.zoomMax, Math.max(0.5, this.zoomGoal * Math.exp(-delta * 0.0012)));
  }

  // 双指捏合：按两指间距变化的倍数缩放
  zoomScale(f) {
    this.zoomGoal = Math.min(this.zoomMax, Math.max(0.5, this.zoomGoal * f));
  }

  pan(dx, dy) {
    const wpp = this.viewH / this.zoom / this.h;
    const rx = Math.cos(this.az);
    const rz = -Math.sin(this.az);
    const fx = -Math.sin(this.az);
    const fz = -Math.cos(this.az);
    const up = (dy * wpp) / Math.sin(ELEV);
    this.targetGoal.x = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, this.targetGoal.x - rx * dx * wpp + fx * up));
    this.targetGoal.z = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, this.targetGoal.z - rz * dx * wpp + fz * up));
  }

  focusOn(x, z) {
    this.targetGoal.x = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, x));
    this.targetGoal.z = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, z));
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h };
  }

  cellCenter(x, z, y = 0) {
    return new THREE.Vector3(x - HALF_SIZE + 0.5, y, z - HALF_SIZE + 0.5);
  }

  // ---------- 昼夜 ----------

  setTime(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const k = (t - a.t) / (b.t - a.t);
    this.sun.color.lerpColors(a.sun, b.sun, k);
    this.sun.intensity = lerp(a.si, b.si, k);
    this.hemi.color.lerpColors(a.sky, b.sky, k);
    this.hemi.groundColor.lerpColors(a.gnd, b.gnd, k);
    this.hemi.intensity = lerp(a.hi, b.hi, k);
    this.scene.background.lerpColors(a.sea, b.sea, k);
    // 季节给光染一点颜色；下雨下雪时阳光弱下去，天和海都灰一些
    const w = this.wet;
    this.sun.color.multiply(this.seasonTint);
    this.hemi.color.multiply(this.seasonTint).lerp(OVERCAST, w * 0.3);
    this.sun.intensity *= this.seasonBright * (1 - w * 0.4);
    this.hemi.intensity *= this.seasonBright * (1 - w * 0.04);
    this.scene.background.lerp(_a.copy(OVERCAST).multiplyScalar(0.3 + this.sun.intensity * 0.2), w * 0.28);
    if (this.terrain) this.terrain.seaMat.color.copy(this.scene.background);

    // 太阳从东(+x)到西(-x)，略偏南；夜里换成月亮
    let theta;
    this.isDay = t < 0.59 || t >= 0.975;
    if (t < 0.59) theta = Math.PI * Math.min(1, t / 0.565);
    else if (t < 0.975) theta = Math.PI * (0.25 + (0.5 * (t - 0.59)) / 0.385);
    else theta = 0;
    this.sunTheta = theta;
    this.sun.position.set(this.frame.x + Math.cos(theta) * 30, Math.sin(theta) * 24 + 7, this.frame.z + 14);

    const night = t < 0.5 ? 0 : t < 0.95 ? smooth(0.5, 0.62, t) : 1 - smooth(0.95, 1, t);
    this.night = night;
    for (let g = 0; g < 3; g++) {
      const on = smooth(0.15 + g * 0.22, 0.35 + g * 0.22, night);
      mats.glow[g].emissiveIntensity = on * 1.5;
    }
    mats.lamp.emissiveIntensity = 0.15 + night * 2.2;
    mats.lampGlow.opacity = night * 0.5;
    mats.pane.emissiveIntensity = night * 0.55;
    mats.beam.opacity = night * 0.2;
    mats.forge.emissiveIntensity = 0.9 + Math.sin(this.time * 9) * 0.12 + Math.sin(this.time * 23) * 0.06;
  }

  // ---------- 季节与天气 ----------

  // 颜色从季节 from 变到季节 to，k 是变到哪一步了（0-1）。只改颜色表和陆地；
  // 岛上的树、花园、菜地由随后的 sync 重画（它们的记号里带着 seasonStamp）
  setSeason(from, to, k) {
    for (const key of SEASON_KEYS) {
      _a.set(SEASON_COLORS[from][key] || SUMMER[key]);
      _b.set(SEASON_COLORS[to][key] || SUMMER[key]);
      C[key] = `#${_a.lerp(_b, k).getHexString()}`;
    }
    const la = SEASON_LIGHT[from];
    const lb = SEASON_LIGHT[to];
    this.seasonTint.setRGB(lerp(la[0], lb[0], k), lerp(la[1], lb[1], k), lerp(la[2], lb[2], k));
    this.seasonBright = lerp(la[3], lb[3], k);
    this.seasonStamp = `${from}${to}${k}`;
    // 积雪：入冬时分三档慢慢变厚，开春时慢慢化掉。树叶、花、落叶这些按离得近的那个季节算
    SCENE.snow = to === 3 ? Math.round(k * 3) : from === 3 ? Math.round((1 - k) * 3) : 0;
    SCENE.season = k >= 0.5 ? to : from;
    this.dressStamp = sceneStamp();
    resetLandCache();
    if (!this.terrain) return;
    // 已经长出来的陆地、还没长出来的沙洲，按新颜色重做。正在升起的那一片升完时自己会按新颜色合并
    const swap = (list, build) => {
      list.forEach((m, zone) => {
        if (!m) return;
        const y = m.position.y;
        this.scene.remove(m);
        m.geometry.dispose();
        list[zone] = build(this.world, zone);
        list[zone].position.y = y;
        this.scene.add(list[zone]);
      });
    };
    swap(this.zoneLand, buildZoneLand);
    swap(this.zoneSand, buildZoneSand);
  }

  // rain：下不下雨；drift：天上飘什么（'snow' 雪、'leaf' 落叶、'petal' 花瓣、null）；overcast：天阴不阴
  setWeather(rain, drift, overcast) {
    this.weather.set(rain, drift);
    this.wetGoal = overcast ? 1 : 0;
    this.raining = rain;
  }

  dropScatter() {
    for (const m of [this.scatter, this.puddles]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.scatter = null;
    this.puddles = null;
    this.scatterKey = '';
  }

  // 草地上的零碎跟着世界和季节走：哪格盖了东西、哪片陆地长出来了、季节和画质，有一样变了才重做
  refreshScatter(world = this.world) {
    if (!world || !this.terrain) return;
    let key = `${this.dressStamp}/${this.seasonStamp}/`;
    for (let zone = 0; zone <= MAX_STAGE; zone++) key += this.zoneLand[zone] ? 1 : 0;
    for (const c of world.cells) key += c.g ? (c.g.t === 'tree' ? 't' : 'x') : c.s.length ? 'x' : '.';
    if (key === this.scatterKey) return;
    this.dropScatter();
    this.scatterKey = key;
    const { ground, puddles } = buildScatter(world, (zone) => !!this.zoneLand[zone]);
    this.scatter = ground;
    this.puddles = puddles;
    if (ground) this.scene.add(ground);
    if (puddles) {
      puddles.visible = this.puddle > 0.1;
      this.scene.add(puddles);
    }
  }

  // ---------- 零件同步 ----------

  // mode：'place' 玩家刚摆放或拆除；'bulk' 撤销、重做、重置；'init' 首次载入；'instant' 整块移动后直接换好
  sync(world, ctx, mode = 'bulk') {
    let grown = 0;
    let order = 0;
    this.emitters = [];
    this.sprayers = [];
    this.lastCtx = ctx;
    const trees = [];
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = z * SIZE + x;
        const group = this.cellGroups[idx];
        const map = this.parts[idx];
        const descs = describeCell(world, x, z, ctx);
        const seen = new Set();
        for (const d of descs) {
          seen.add(d.key);
          const y = d.y || 0;
          const sig = d.kind + JSON.stringify(d.p) + (SEASONAL.has(d.kind) ? this.seasonStamp : '') + (DRESSED.has(d.kind) ? this.dressStamp : '');
          if (d.kind === 'tree' && d.p.seed % 2 === 0) trees.push([group.position.x, group.position.z]);
          const cur = map.get(d.key);
          if (cur && cur.sig === sig) {
            if (Math.abs(cur.y - y) > 1e-4) {
              cur.y = y;
              this.moveTo(cur.obj, y);
            }
            this.addEmitter(group, cur.obj, y);
            continue;
          }
          const obj = buildPart(d.kind, d.p);
          obj.position.y = y;
          obj.userData.phase = (x * 2.399 + z * 3.883) % 6.28; // 摇摆的节拍按位置定：换季重画时树不会突然抖一下
          group.add(obj);
          const rec = { obj, sig, y, kind: d.kind };
          map.set(d.key, rec);
          this.track(obj);
          this.addEmitter(group, obj, y);
          if (cur) {
            this.destroy(cur.obj);
            if (mode !== 'init' && mode !== 'instant') this.popIn(obj);
          } else if (mode === 'instant') {
            // 整块移动：东西已经在眼前挪过来了，直接出现，不再播动画
          } else if (mode === 'place' && d.anim === 'drop') {
            this.dropIn(obj, d.fall, () => this.impact(x, z, y, d.fall ? 1 : 0.7));
          } else if (mode === 'place') {
            this.growIn(obj, 0.16 + 0.045 * grown++);
          } else if (mode === 'init') {
            this.growIn(obj, 0.35 + (Math.abs(x - START_CENTER.x) + Math.abs(z - START_CENTER.z)) * 0.04);
          } else {
            this.growIn(obj, 0.012 * Math.min(order++, 20));
          }
        }
        for (const [key, rec] of map) {
          if (seen.has(key)) continue;
          map.delete(key);
          this.removePart(rec.obj, mode !== 'init' && mode !== 'instant', mode === 'place');
        }
      }
    }
    this.env.trees = trees;
    this.refreshScatter(world);
    this.rebuildPicks(world);
    return { grown };
  }

  // 烟囱冒烟、喷泉喷水的位置
  addEmitter(group, obj, y) {
    const u = obj.userData;
    const at = u.smoke || u.spray;
    if (!at) return;
    const [lx, ly, lz] = at;
    const r = obj.rotation.y;
    (u.smoke ? this.emitters : this.sprayers).push({
      x: group.position.x + lx * Math.cos(r) + lz * Math.sin(r),
      y: y + ly,
      z: group.position.z - lx * Math.sin(r) + lz * Math.cos(r),
    });
  }

  track(obj) {
    if (obj.userData.sway) {
      if (obj.userData.phase === undefined) obj.userData.phase = Math.random() * 6.28;
      this.swayers.add(obj);
    }
    for (const c of obj.children) {
      if (c.userData.bob) this.bobbers.add(c);
      if (c.userData.spin) this.spinners.add(c);
      if (c.userData.turn) this.turners.add(c);
    }
  }

  destroy(obj) {
    this.anim.cancel(obj);
    this.swayers.delete(obj);
    for (const c of obj.children) {
      this.bobbers.delete(c);
      this.spinners.delete(c);
      this.turners.delete(c);
      if (c.geometry && !c.userData.shared) c.geometry.dispose();
    }
    if (obj.parent) obj.parent.remove(obj);
  }

  removePart(obj, animate, dust) {
    if (!animate || !obj.visible) {
      this.destroy(obj);
      return;
    }
    this.swayers.delete(obj);
    if (dust) {
      const p = obj.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * 6.28;
        this.particles.spawn('dust', p.x, p.y + 0.15, p.z, Math.cos(a) * 1.1, 0.9 + Math.random() * 0.6, Math.sin(a) * 1.1, 0.45, 0.08 + Math.random() * 0.05, -1.5);
      }
    }
    const s0 = obj.scale.x;
    const r0 = obj.rotation.y;
    this.anim.add(
      obj,
      0.17,
      (k) => {
        const s = Math.max(0.001, s0 * (1 - ease.inBack(k)));
        obj.scale.setScalar(s);
        obj.rotation.y = r0 + k * 0.5;
      },
      { onDone: () => this.destroy(obj) },
    );
  }

  // 落下并压扁回弹。fall 为 false 时只有回弹（用于叠在楼上的块）
  dropIn(obj, fall, onImpact) {
    const y0 = obj.position.y;
    const fallT = fall ? 0.1 : 0;
    let hit = false;
    this.anim.add(obj, fallT + 0.6, (k, time) => {
      if (time < fallT) {
        const f = time / fallT;
        obj.position.y = y0 + 0.34 * (1 - f * f);
        obj.scale.set(0.9, 1.14, 0.9);
        return;
      }
      if (!hit) {
        hit = true;
        if (onImpact) onImpact();
      }
      const tau = time - fallT;
      const e = Math.exp(-8.5 * tau) * Math.cos(21 * tau);
      obj.position.y = y0;
      if (k >= 1) obj.scale.set(1, 1, 1);
      else obj.scale.set(1 + 0.2 * e, 1 - 0.34 * e, 1 + 0.2 * e);
    });
  }

  growIn(obj, delay = 0) {
    obj.visible = false;
    obj.scale.setScalar(0.001);
    this.anim.add(obj, 0.4, (k) => obj.scale.setScalar(Math.max(0.001, ease.outBack(k))), {
      delay,
      onStart: () => {
        obj.visible = true;
      },
    });
  }

  popIn(obj) {
    obj.scale.setScalar(0.8);
    this.anim.add(obj, 0.3, (k) => obj.scale.setScalar(0.8 + 0.2 * ease.outBack(k)));
  }

  moveTo(obj, y) {
    const y0 = obj.position.y;
    obj.visible = true;
    this.anim.add(obj, 0.42, (k) => {
      obj.position.y = y0 + (y - y0) * ease.outBack(k);
      const e = Math.sin(k * Math.PI) * 0.12;
      obj.scale.set(1 - e * 0.5, 1 + e, 1 - e * 0.5);
      if (k >= 1) obj.scale.set(1, 1, 1);
    });
  }

  wobble(x, z, amp, delay) {
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return;
    const idx = z * SIZE + x;
    if (!this.parts[idx].size) return;
    const g = this.cellGroups[idx];
    this.anim.add(
      g,
      0.55,
      (k, t) => {
        const e = Math.exp(-7.5 * t) * Math.sin(19 * t);
        if (k >= 1) g.scale.set(1, 1, 1);
        else g.scale.set(1 + amp * 0.5 * e, 1 - amp * e, 1 + amp * 0.5 * e);
      },
      { delay },
    );
  }

  // 落地的冲击：一圈尘土，周围的建筑跟着晃一下
  impact(x, z, y, strength = 1) {
    const cx = x - HALF_SIZE + 0.5;
    const cz = z - HALF_SIZE + 0.5;
    const n = Math.round(8 * strength);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + Math.random() * 0.5;
      const sp = 1.5 + Math.random() * 0.9;
      this.particles.spawn('dust', cx + Math.cos(a) * 0.4, y + 0.05, cz + Math.sin(a) * 0.4, Math.cos(a) * sp, 0.5 + Math.random() * 0.5, Math.sin(a) * sp, 0.5 + Math.random() * 0.2, 0.07 + Math.random() * 0.06, -0.6);
    }
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const dist = Math.hypot(dx, dz);
        this.wobble(x + dx, z + dz, (0.07 * strength) / dist, 0.03 * dist);
      }
    }
  }

  ping(x, z, level) {
    const b = this.pingBox;
    this.anim.cancel(b);
    b.position.set(x - HALF_SIZE + 0.5, level * H + H / 2, z - HALF_SIZE + 0.5);
    b.visible = true;
    this.anim.add(
      b,
      1.5,
      (k, t) => {
        const s = 1 + 0.08 * Math.sin(t * 9);
        b.scale.set(0.98 * s, H + 0.06, 0.98 * s);
        b.material.opacity = 0.5 * (1 - k) * (0.6 + 0.4 * Math.sin(t * 9));
      },
      {
        onDone: () => {
          b.visible = false;
        },
      },
    );
  }

  sparkle(x, z, y) {
    const cx = x - HALF_SIZE + 0.5;
    const cz = z - HALF_SIZE + 0.5;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28;
      const r = 0.2 + Math.random() * 0.5;
      this.particles.spawn('spark', cx + Math.cos(a) * r, y + Math.random() * 0.3, cz + Math.sin(a) * r, Math.cos(a) * 0.5, 1.2 + Math.random() * 1.3, Math.sin(a) * 0.5, 0.9 + Math.random() * 0.5, 0.04 + Math.random() * 0.03, -0.4);
    }
  }

  // ---------- 拾取 ----------

  rebuildPicks(world) {
    let i = 0;
    while (this.pickBalconies.children.length) this.pickBalconies.remove(this.pickBalconies.children[0]);
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const c = world.cell(x, z);
        const m = this.pickCells.children[i++];
        const h = Math.max(world.heightOf(c) * H, 0.04);
        const y0 = c.water ? -0.22 : c.locked ? -0.08 : 0;
        m.position.set(x - HALF_SIZE + 0.5, y0 + h / 2, z - HALF_SIZE + 0.5);
        m.scale.set(1, h, 1);
        m.userData.n = c.s.length;
        for (let lv = 0; lv < c.s.length; lv++) {
          for (let d = 0; d < 4; d++) {
            if (!c.s[lv].b[d]) continue;
            const b = new THREE.Mesh(this.pickGeo, this.pickMat);
            b.position.set(x - HALF_SIZE + 0.5 + DIRS[d].x * 0.58, lv * H + 0.1, z - HALF_SIZE + 0.5 + DIRS[d].z * 0.58);
            b.scale.set(d % 2 ? 0.34 : 0.64, 0.34, d % 2 ? 0.64 : 0.34);
            b.userData = { x, z, balcony: { level: lv, dir: d } };
            this.pickBalconies.add(b);
          }
        }
      }
    }
    this.pickCells.updateMatrixWorld(true);
    this.pickBalconies.updateMatrixWorld(true);
  }

  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.pickBalconies.children, ...this.pickCells.children], false);
    if (!hits.length) return null;
    const hit = hits[0];
    const u = hit.object.userData;
    if (u.balcony) return { x: u.x, z: u.z, balcony: u.balcony, face: -1, level: u.balcony.level };
    const n = hit.face.normal;
    let face = -1;
    if (Math.abs(n.y) < 0.5) face = n.x > 0.5 ? 1 : n.x < -0.5 ? 3 : n.z > 0.5 ? 2 : 0;
    const level = face < 0 ? Math.max(0, u.n - 1) : Math.min(Math.max(0, u.n - 1), Math.max(0, Math.floor((hit.point.y + 1e-4) / H)));
    return { x: u.x, z: u.z, face, level };
  }

  // 鼠标指着地面上的哪一格（不管上面盖了什么）
  pickGround(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    const clamp = (v) => Math.min(SIZE - 1, Math.max(0, Math.floor(v + HALF_SIZE)));
    return { x: clamp(ray.origin.x + ray.direction.x * t), z: clamp(ray.origin.z + ray.direction.z * t) };
  }

  // ---------- 圈选与整块移动 ----------

  // rect：{ x0, z0, x1, z1 }，传 null 取消圈选。
  // state：'box' 正在圈、'idle' 圈好了、'ok' / 'bad' 正拖着走（能放 / 不能放）
  // cells：拖动时要跟着走的格子；dx、dz：现在挪了多少格
  setSelection(rect, state = 'idle', cells = [], dx = 0, dz = 0) {
    if (!rect) {
      this.clearLift();
      this.selGroup.visible = false;
      return;
    }
    this.frameSelection(rect, state);
    const carrying = state === 'ok' || state === 'bad';
    if (carrying) {
      if (!this.lifted.length) {
        this.lifted = cells.map((p) => ({ g: this.cellGroups[p.z * SIZE + p.x], x: p.x - HALF_SIZE + 0.5, z: p.z - HALF_SIZE + 0.5 }));
      }
      this.selGoal.set(dx, 0.2, dz);
    } else {
      this.clearLift();
    }
  }

  // 整块搬动的预览：把这些格子上的东西抬起来，摆到各自的新位置、转好方向；世界本身还没改。
  // pairs：[{ from, to }]；turns：顺时针一共转了几个 90°（一直累加，转起来才顺）
  setCarry(rect, state, pairs, turns) {
    const shown = this.selGroup.visible;
    const ox = this.selBase.x + this.selOff.x;
    const oz = this.selBase.z + this.selOff.z;
    this.frameSelection(rect, state);
    // 框从上一个位置滑到新位置，不跳
    if (shown) this.selOff.set(ox - this.selBase.x, 0, oz - this.selBase.z);
    else this.selOff.set(0, 0, 0);
    this.selGoal.set(0, 0, 0);
    const prev = new Map(this.lifted.filter((l) => l.free).map((l) => [l.g, l]));
    this.lifted = pairs.map(({ from, to }) => {
      const g = this.cellGroups[from.z * SIZE + from.x];
      const x = from.x - HALF_SIZE + 0.5;
      const z = from.z - HALF_SIZE + 0.5;
      const l = prev.get(g) || { g, x, z, px: x, py: 0, pz: z, pr: 0, free: true };
      l.tx = to.x - HALF_SIZE + 0.5;
      l.tz = to.z - HALF_SIZE + 0.5;
      l.tr = (-turns * Math.PI) / 2;
      return l;
    });
  }

  // 画圈选的框：位置、大小、颜色
  frameSelection(rect, state) {
    const w = rect.x1 - rect.x0 + 1;
    const d = rect.z1 - rect.z0 + 1;
    const [n, s, e, wst] = this.selBars;
    n.position.set(0, 0, -d / 2);
    s.position.set(0, 0, d / 2);
    e.position.set(w / 2, 0, 0);
    wst.position.set(-w / 2, 0, 0);
    n.scale.set(w + 0.07, 0.035, 0.07);
    s.scale.set(w + 0.07, 0.035, 0.07);
    e.scale.set(0.07, 0.035, d + 0.07);
    wst.scale.set(0.07, 0.035, d + 0.07);
    this.selFill.scale.set(w, d, 1);
    this.selBase.set((rect.x0 + rect.x1) / 2 - HALF_SIZE + 0.5, 0.04, (rect.z0 + rect.z1) / 2 - HALF_SIZE + 0.5);
    const color = state === 'bad' ? '#ff8a76' : state === 'ok' ? '#c9f5b0' : state === 'box' ? '#ffffff' : '#ffe08a';
    this.selMat.color.set(color);
    this.selFillMat.color.set(color);
    this.selGroup.visible = true;
  }

  // 把跟着鼠标走的格子放回原位
  clearLift() {
    for (const l of this.lifted) {
      l.g.position.set(l.x, 0, l.z);
      l.g.rotation.y = 0;
    }
    this.lifted = [];
    this.selOff.set(0, 0, 0);
    this.selGoal.set(0, 0, 0);
  }

  // 鼠标是不是指着正被抬着的那些东西（按各自的包围盒算）
  hitsLifted(clientX, clientY) {
    if (!this.lifted.length) return false;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const box = this.liftBox || (this.liftBox = new THREE.Box3());
    return this.lifted.some((l) => {
      box.setFromObject(l.g);
      return !box.isEmpty() && this.raycaster.ray.intersectsBox(box);
    });
  }

  // 整块放下以后，落地的东西一起压一下
  settle(cells) {
    cells.forEach((p, i) => {
      this.wobble(p.x, p.z, 0.16, 0);
      if (i % 2 === 0) {
        const a = Math.random() * 6.28;
        this.particles.spawn('dust', p.x - HALF_SIZE + 0.5 + Math.cos(a) * 0.4, 0.05, p.z - HALF_SIZE + 0.5 + Math.sin(a) * 0.4, Math.cos(a) * 1.4, 0.6, Math.sin(a) * 1.4, 0.5, 0.08, -0.6);
      }
    });
  }

  // ---------- 虚影与高亮 ----------

  setHover(h) {
    this.hover = h;
    if (!h) {
      this.ghost.visible = false;
      this.hl.visible = false;
      this.marker.visible = false;
      this.ghostFresh = true;
      return;
    }
    const cx = h.x - HALF_SIZE + 0.5;
    const cz = h.z - HALF_SIZE + 0.5;
    if (h.kind === 'place') {
      this.marker.visible = false;
      if (this.ghostType !== h.type) this.buildGhost(h.type);
      const y = h.level * H;
      this.ghostPos.set(cx, y, cz);
      this.ghostRot = h.type === 'dock' ? DIR_RY[opp(Math.max(0, h.dir))] : h.rot ? DIR_RY[h.dir] : 0;
      mats.ghost.color.copy(h.valid ? this.okColor : this.badColor);
      this.hl.material.color.set(h.valid ? '#ffffff' : '#ff8a76');
      this.hlPos.set(cx, (h.type === 'balcony' ? 0 : y) + 0.02, cz);
      if (this.ghostFresh) {
        this.ghost.position.copy(this.ghostPos);
        this.ghost.rotation.y = this.ghostRot;
        this.hl.position.copy(this.hlPos);
        this.ghostFresh = false;
      }
      this.ghost.visible = true;
      this.hl.visible = true;
    } else {
      this.ghost.visible = false;
      this.ghostFresh = true;
      this.hl.visible = false;
      this.marker.visible = h.valid;
      // 拆除是红框；粉刷时框是要刷上去的那种颜色
      const tint = h.kind === 'paint';
      this.marker.material.color.set(tint ? (h.brush === 'wall' ? C.wallPaint : C.roofPaint)[h.color] : '#ff7a66');
      this.markerBase = tint ? 0.58 : 0.26;
      if (tint) {
        if (h.brush === 'roof') {
          this.marker.position.set(cx, (h.level + 1) * H + 0.24, cz);
          this.marker.scale.set(1.02, 0.5, 1.02);
        } else {
          this.marker.position.set(cx, h.level * H + H / 2, cz);
          this.marker.scale.set(0.9, H * 0.94, 0.9);
        }
      } else if (h.kind === 'removeBalcony') {
        const d = h.dir;
        this.marker.position.set(cx + DIRS[d].x * 0.58, h.level * H + 0.12, cz + DIRS[d].z * 0.58);
        this.marker.scale.set(d % 2 ? 0.38 : 0.7, 0.36, d % 2 ? 0.7 : 0.38);
      } else if (h.solid) {
        const hh = (h.tall || 1) * H;
        this.marker.position.set(cx, h.level * H + hh / 2 + 0.12, cz);
        this.marker.scale.set(0.98, hh + 0.3, 0.98);
      } else {
        this.marker.position.set(cx, 0.2, cz);
        this.marker.scale.set(0.98, 0.5, 0.98);
      }
    }
  }

  buildGhost(type) {
    for (const c of [...this.ghost.children]) {
      c.traverse((o) => {
        if (o.geometry && !o.userData.shared) o.geometry.dispose();
      });
      this.ghost.remove(c);
    }
    for (const d of ghostParts(type)) {
      const o = buildPart(d.kind, d.p);
      for (const c of [...o.children]) {
        if (c.userData.fx) o.remove(c);
        else {
          c.material = mats.ghost;
          c.castShadow = false;
          c.receiveShadow = false;
        }
      }
      o.rotation.y = 0;
      this.ghost.add(o);
    }
    this.ghostType = type;
    this.ghostFresh = true;
  }

  rejectGhost() {
    this.ghostShake = 0.32;
  }

  // ---------- 每帧 ----------

  update(dt) {
    this.time += dt;
    this.updateCamera(1 - Math.exp(-dt * 9));
    this.anim.update(dt);
    this.particles.update(dt);
    // 天气：阴晴慢慢变；雨雪只落在镜头看得到的那一片
    this.wet += Math.sign(this.wetGoal - this.wet) * Math.min(Math.abs(this.wetGoal - this.wet), dt / 8);
    const span = this.viewH / this.zoom;
    const reach = Math.min(30, Math.max(span / 2 / Math.sin(ELEV), (span * this.w) / this.h / 2) + 3);
    this.weather.update(dt, this.target.x, this.target.z, reach, this.renderer.domElement.height / span, this.fx, this.night, this.env);
    // 水洼：雨下了半分钟才显出来，雨停后慢慢干掉
    const pg = this.raining ? 1 : 0;
    this.puddle += Math.sign(pg - this.puddle) * Math.min(Math.abs(pg - this.puddle), dt / (pg ? 30 : 50));
    mats.puddle.opacity = 0.5 * smooth(0.1, 1, this.puddle);
    if (this.puddles) this.puddles.visible = this.puddle > 0.1;

    for (const o of this.swayers) {
      const ph = o.userData.phase;
      o.rotation.z = Math.sin(this.time * 1.25 + ph) * 0.04;
      o.rotation.x = Math.cos(this.time * 1.05 + ph) * 0.03;
    }
    for (const o of this.bobbers) {
      o.position.y = -0.25 + Math.sin(this.time * 1.6 + o.id) * 0.015;
      o.rotation.z = Math.sin(this.time * 1.1 + o.id) * 0.06;
    }

    for (const o of this.spinners) o.rotation.z -= dt * o.userData.spin;
    for (const o of this.turners) o.rotation.y += dt * o.userData.turn;

    this.sprayTimer -= dt;
    if (this.sprayTimer <= 0) {
      this.sprayTimer = 0.11;
      for (const e of this.sprayers) {
        const a = Math.random() * 6.28;
        this.particles.spawn('drop', e.x, e.y, e.z, Math.cos(a) * 0.32, 1.25 + Math.random() * 0.3, Math.sin(a) * 0.32, 0.62, 0.035 + Math.random() * 0.02, -4.2);
      }
    }

    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.5;
      for (const e of this.emitters) {
        this.particles.spawn('smoke', e.x, e.y, e.z, 0.12 + Math.random() * 0.1, 0.5, (Math.random() - 0.5) * 0.1, 2.4, 0.11 + Math.random() * 0.05, 0.05);
      }
    }

    if (this.ghost.visible) {
      const k = 1 - Math.exp(-dt * 24);
      this.ghost.position.lerp(this.ghostPos, k);
      let dr = this.ghostRot - this.ghost.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.ghost.rotation.y += dr * (1 - Math.exp(-dt * 18));
      const bob = 0.05 + Math.sin(this.time * 4) * 0.02;
      for (const c of this.ghost.children) c.position.y = bob;
      if (this.ghostShake > 0) {
        this.ghostShake -= dt;
        const s = Math.sin(this.ghostShake * 60) * 0.07 * Math.max(0, this.ghostShake / 0.32);
        this.ghost.position.x += Math.cos(this.az) * s;
        this.ghost.position.z += -Math.sin(this.az) * s;
      }
      this.hl.position.lerp(this.hlPos, k);
      this.hl.scale.setScalar(0.96 + Math.sin(this.time * 5) * 0.03);
    }
    if (this.marker.visible) this.marker.material.opacity = this.markerBase + Math.sin(this.time * 6) * 0.08;
    if (this.selGroup.visible) {
      const sk = 1 - Math.exp(-dt * 22);
      this.selOff.lerp(this.selGoal, sk);
      this.selGroup.position.set(this.selBase.x + this.selOff.x, this.selBase.y, this.selBase.z + this.selOff.z);
      this.selFillMat.opacity = 0.14 + Math.sin(this.time * 4) * 0.04;
      for (const l of this.lifted) {
        if (!l.free) {
          l.g.position.set(l.x + this.selOff.x, this.selOff.y, l.z + this.selOff.z);
          continue;
        }
        // 预览搬动：各去各的位置，转到各自的朝向
        l.px += (l.tx - l.px) * sk;
        l.py += (0.2 - l.py) * sk;
        l.pz += (l.tz - l.pz) * sk;
        l.pr += (l.tr - l.pr) * sk;
        l.g.position.set(l.px, l.py, l.pz);
        l.g.rotation.y = l.pr;
      }
    }
    if (this.terrain) {
      this.terrain.sea.position.y = -0.2 + Math.sin(this.time * 0.8) * 0.012;
      const dim = 0.5 - this.night * 0.32;
      for (const m of this.glints) {
        const u = m.userData;
        const s = Math.sin(this.time * u.speed + u.phase);
        m.material.opacity = s > 0 ? s * s * dim : 0;
        m.position.x = u.x0 + Math.sin(this.time * 0.15 + u.phase) * 0.4;
      }
    }
  }

  render(now = performance.now()) {
    if (now - this.shadowAt >= this.shadowGap) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowAt = now;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // 用同一套模型渲染工具栏缩略图
  makeThumbs(specs) {
    const size = 160;
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#d8c8b0', 1.9));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(-2, 6, 5);
    scene.add(sun);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    const out = {};
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    const s = new THREE.Vector3();
    // 工具栏上的小图不跟着季节变：先换回夏天的颜色、去掉雪，画完再换回来
    const keepScene = { ...SCENE };
    const keepC = Object.fromEntries(SEASON_KEYS.map((k) => [k, C[k]]));
    Object.assign(SCENE, { season: 1, snow: 0, detail: 0 });
    Object.assign(C, SUMMER);
    for (const [id, parts] of Object.entries(specs)) {
      const grp = new THREE.Group();
      for (const d of parts) {
        const o = buildPart(d.kind, d.p);
        o.position.y = d.y || 0;
        for (const ch of [...o.children]) if (ch.userData.fx) o.remove(ch);
        grp.add(o);
      }
      scene.add(grp);
      box.setFromObject(grp);
      box.getCenter(c);
      box.getSize(s);
      const half = Math.max(s.x, s.y, s.z) * 0.74 + 0.06;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
      cam.position.set(c.x - 6, c.y + 5.5, c.z + 6);
      cam.lookAt(c);
      r.render(scene, cam);
      out[id] = canvas.toDataURL('image/png');
      scene.remove(grp);
      grp.traverse((o) => {
        if (o.geometry && !o.userData.shared) o.geometry.dispose();
      });
    }
    Object.assign(SCENE, keepScene);
    Object.assign(C, keepC);
    r.dispose();
    r.forceContextLoss();
    return out;
  }
}
