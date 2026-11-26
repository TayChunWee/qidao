// 帧率与画质。
// 1. 按玩家选的帧率上限出帧（屏幕刷新得更快时，隔几次刷新画一帧）。
// 2. 掉帧时自动把渲染分辨率降一档，稳住一阵子之后再试着升回去。
// 3. 估计屏幕的刷新率：帧率再高也高不过它，掉没掉帧要和它比。

export const FPS_CHOICES = [60, 90, 120, 144];

const COMMON_HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 200, 240];
// 画质档位。scale：渲染分辨率的倍数；shadow：阴影贴图边长；gap：阴影最少隔多少毫秒重画一次
// （阴影不必每帧都画：帧率高于 90 时隔一帧画一次，眼睛看不出差别）
const QUALITY = [
  { scale: 1, shadow: 2048, gap: 10.5 },
  { scale: 0.85, shadow: 2048, gap: 10.5 },
  { scale: 0.72, shadow: 2048, gap: 10.5 },
  { scale: 0.6, shadow: 1024, gap: 30 },
  { scale: 0.5, shadow: 1024, gap: 30 },
];

// 玩家在设置里选的画质。'auto'：跟着帧率在上面几档之间自动调；其余三样固定在某一档不动
export const QUALITY_MODES = ['auto', 'low', 'mid', 'high'];
const FIXED = { high: 0, mid: 1, low: 3 };
// 每一档下，雨雪这些画几成
const FX = [1, 0.8, 0.65, 0.4, 0.3];
// 每一档下，季节的打扮画得多细：2 全都有；1 少一些（没有冰凌和涟漪，花草稀一半）；0 只换颜色、屋顶和树有雪
const DETAIL = [2, 1, 1, 0, 0];

function snapHz(hz) {
  for (const c of COMMON_HZ) if (Math.abs(hz - c) / c < 0.06) return c;
  return Math.round(hz);
}

export class Pacer {
  constructor(view) {
    this.view = view;
    this.cap = 144; // 帧率上限
    this.hz = 0; // 屏幕刷新率（估计）。0 表示还没量出来
    this.q = 0; // 现在用的画质档位
    this.mode = 'auto'; // 玩家选的画质
    this.fps = 0; // 最近一秒实际画了多少帧
    this.dt = 16; // 这一帧离上一帧多少毫秒
    this.active = false; // 标题画面上不调画质
    this.onStats = null;

    this.count = 0;
    this.lastRaw = 0;
    this.then = 0;
    this.lastDraw = 0;
    this.winStart = 0;
    this.raw = [];
    this.drawn = 0;
    this.dirty = true;
    this.bad = 0;
    this.good = 0;
    this.retry = 8; // 稳住多少秒之后试着升一档
    this.raisedAt = -1e9;
    this.avgAt = []; // 每一档画质下量到的帧间隔
    this.stuck = 0;
    this.hold = 0; // 这个时刻之前不再调画质
    this.holdFor = 60000;
    this.probe = 0;
    this.probeDts = [];
    this.probedAt = -1e9;
    this.probeWait = 5000;
    this.mismatch = 0;
  }

  get stats() {
    return { fps: Math.round(this.fps), hz: this.hz, cap: this.cap, scale: QUALITY[this.q].scale };
  }

  setCap(fps) {
    this.cap = fps;
    this.retarget();
    if (this.onStats) this.onStats(this.stats);
  }

  // 目标帧率变了（换了上限或换了屏幕）：之前量到的都不作数了
  retarget() {
    this.bad = 0;
    this.good = 0;
    this.stuck = 0;
    this.avgAt = [];
    this.hold = 0;
  }

  setMode(mode) {
    this.mode = QUALITY_MODES.includes(mode) ? mode : 'auto';
    this.retarget();
    this.setQ(this.mode === 'auto' ? 0 : FIXED[this.mode]);
    if (this.onStats) this.onStats(this.stats);
  }

  setQ(q) {
    this.q = q;
    const k = QUALITY[q];
    this.view.setQuality(k.scale, k.shadow, k.gap);
    this.view.fx = FX[q];
    this.view.setDetail(DETAIL[q]);
    this.dirty = true; // 切换那一下会卡一帧，这一秒不算数
  }

  // 每次屏幕刷新调用一次。返回 true 表示这一帧要画，间隔在 this.dt 里
  tick(now) {
    const rawDt = now - this.lastRaw;
    this.lastRaw = now;
    if (this.count++ === 0) {
      this.then = this.lastDraw = this.winStart = now;
      this.probe = 14;
      return true;
    }

    // 量屏幕刷新率：空转几帧不画，这时两次回调之间的间隔就是屏幕的刷新间隔
    if (this.probe > 0) {
      this.probeDts.push(rawDt);
      if (--this.probe === 0) this.endProbe(now);
      return false;
    }

    if (rawDt > 250) this.dirty = true; // 切到后台再回来、或者卡了一大下
    else this.raw.push(rawDt);

    // 到点了才画。允许提前半个刷新间隔，这样总是落在离预定时间最近的那次刷新上
    const interval = 1000 / this.cap;
    const due = this.then + interval;
    if (now < due - 500 / (this.hz || 60)) return false;
    this.then = now - due > interval ? now : due;
    this.dt = now - this.lastDraw;
    this.lastDraw = now;
    this.drawn++;
    if (now - this.winStart >= 1000) this.closeWindow(now);
    return true;
  }

  endProbe(now) {
    const s = this.probeDts.slice(3).sort((a, b) => a - b);
    const mid = s[Math.floor(s.length / 2)];
    this.probeDts = [];
    if (mid > 2 && mid < 50) {
      const hz = snapHz(1000 / mid);
      if (hz === this.hz) {
        // 量出来还是老样子：是机器跟不上而不是屏幕换了，下次隔久一点再量
        this.probeWait = Math.min(Math.max(this.probeWait * 2, 30000), 600000);
      } else {
        this.probeWait = 5000;
        this.hz = hz;
        this.retarget();
      }
    }
    this.probedAt = now;
    this.mismatch = 0;
    this.then = now - 1000;
    this.winStart = now;
    this.raw.length = 0;
    this.drawn = 0;
    this.dirty = true;
    if (this.onStats) this.onStats(this.stats);
  }

  closeWindow(now) {
    const span = now - this.winStart;
    this.fps = (this.drawn * 1000) / span;
    if (!this.dirty && this.raw.length >= 20) {
      // 回调的间隔和以为的刷新率对不上：可能是窗口拖到了另一块屏幕上，也可能只是机器跟不上。
      // 分不清的时候先重新量一次刷新率，量完再决定要不要动画质
      const s = this.raw.slice().sort((a, b) => a - b);
      const est = snapHz(1000 / s[Math.floor(s.length * 0.2)]);
      if (est < this.hz * 0.8 || est > this.hz * 1.15) this.mismatch++;
      else this.mismatch = 0;
      const canProbe = now - this.probedAt > this.probeWait;
      if (this.mismatch >= 2 && canProbe) this.probe = 10;
      else if (this.active && !(this.mismatch && canProbe)) this.adapt(now, span / this.drawn);
    }
    this.winStart = now;
    this.drawn = 0;
    this.raw.length = 0;
    this.dirty = false;
    if (this.onStats) this.onStats(this.stats);
  }

  // avg：这一秒里平均多少毫秒一帧
  adapt(now, avg) {
    if (this.mode !== 'auto' || now < this.hold || !this.hz) return;
    const target = 1000 / Math.min(this.cap, this.hz);
    if (avg > target * 1.08) {
      this.good = 0;
      this.avgAt[this.q] = avg;
      if (++this.bad < 2) return;
      this.bad = 0;
      if (this.q < QUALITY.length - 1) {
        // 刚升上来就掉帧：这台机器撑不住那一档，下次隔久一点再试
        if (now - this.raisedAt < 6000) this.retry = Math.min(this.retry * 2, 240);
        this.setQ(this.q + 1);
      } else if (++this.stuck >= 3) {
        // 降到底了还是不够快：瓶颈不在分辨率上。退回到不比最低档慢的最高一档，过一阵子再说，
        // 免得白白把画面弄糊
        let best = this.q;
        for (let i = this.q - 1; i >= 0; i--) if (this.avgAt[i] <= avg * 1.08) best = i;
        this.stuck = 0;
        this.holdFor = Math.min(this.holdFor * 2, 1200000);
        this.hold = now + this.holdFor;
        if (best !== this.q) this.setQ(best);
      }
    } else {
      this.bad = 0;
      this.stuck = 0;
      if (this.q > 0 && ++this.good >= this.retry) {
        this.good = 0;
        this.raisedAt = now;
        this.setQ(this.q - 1);
      }
    }
  }
}
