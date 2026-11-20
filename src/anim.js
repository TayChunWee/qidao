// 极简补间管理器：每个对象同一时间只跑一个补间，新的会顶掉旧的。

export const ease = {
  outCubic: (k) => 1 - (1 - k) ** 3,
  outBack: (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2,
  inBack: (k) => 2.4 * k ** 3 - 1.4 * k ** 2,
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
};

export class Anim {
  constructor() {
    this.list = [];
  }

  // fn(k, time)：k 为 0..1 的进度，time 为已运行秒数
  add(obj, dur, fn, { delay = 0, onStart, onDone } = {}) {
    this.cancel(obj);
    const t = { obj, dur, fn, delay, onStart, onDone, time: 0, started: false, dead: false };
    this.list.push(t);
    return t;
  }

  cancel(obj) {
    for (const t of this.list) if (t.obj === obj) t.dead = true;
  }

  update(dt) {
    const cur = this.list;
    for (let i = 0; i < cur.length; i++) {
      const t = cur[i];
      if (t.dead) continue;
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay > 0) continue;
      }
      if (!t.started) {
        t.started = true;
        if (t.onStart) t.onStart();
      }
      t.time += dt;
      const k = Math.min(1, t.time / t.dur);
      t.fn(k, t.time);
      if (k >= 1) {
        t.dead = true;
        if (t.onDone) t.onDone();
      }
    }
    this.list = this.list.filter((t) => !t.dead);
  }
}
