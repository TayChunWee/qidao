// 背景音乐：播放 music/ 文件夹里的曲目。
// 三种放法：随机轮播（两首之间留一小段安静，只剩海浪声）、指定一首单曲循环、或者不放曲目改用合成音乐。
// 曲目全部是作者以 CC0 方式公开的作品，响度已经统一过。url 是作者发布这首曲子的页面，列在"制作与鸣谢"里。

export const TRACKS = [
  { id: 'ocean-breeze', title: 'Ocean Breeze', by: 'HoliznaCC0', file: '01-ocean-breeze.mp3', url: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ocean-breeze-lofi-ukulele-peaceful-mp3/' },
  { id: 'calm-currents', title: 'Calm Currents', by: 'HoliznaCC0', file: '02-calm-currents.mp3', url: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/calm-currents-lofi-relax-calm' },
  { id: 'tokyo-sunset', title: 'Tokyo Sunset', by: 'HoliznaCC0', file: '03-tokyo-sunset.mp3', url: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tokyo-sunset-lofi-peaceful-soft/' },
  { id: 'infinite-echoes', title: 'Infinite Echoes', by: 'HoliznaCC0', file: '04-infinite-echoes.mp3', url: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/infinite-echoes-lofi-dreamy-soft/' },
  { id: 'a-cup-of-tea', title: 'A cup of tea', by: 'TAD', file: '05-a-cup-of-tea.mp3', url: 'https://opengameart.org/content/lofi-compilation' },
  { id: 'bartender', title: 'Bartender', by: 'TAD', file: '06-bartender.mp3', url: 'https://opengameart.org/content/lofi-compilation' },
  { id: 'bluebonnet', title: 'Bluebonnet', by: 'Kistol', file: '07-bluebonnet.mp3', url: 'https://opengameart.org/content/bluebonnet' },
  { id: 'sunset-plains', title: 'Sunset Plains', by: 'Yoiyami', file: '08-sunset-plains.mp3', url: 'https://opengameart.org/content/sunset-plains' },
  { id: 'apple-cider', title: 'Apple Cider', by: 'Zane Little Music', file: '09-apple-cider.mp3', url: 'https://opengameart.org/content/apple-cider' },
  { id: 'sleepy-little-mouse', title: 'Sleepy Little Mouse', by: 'Tsorthan Grove', file: '10-sleepy-little-mouse.mp3', url: 'https://opengameart.org/content/sleepy-little-mouse' },
];

const DIR = 'music/';
const GAP = 7; // 轮播时两首之间安静几秒
const LOOP_GAP = 3; // 单曲循环时，一遍放完隔几秒再来
const FADE = 0.9; // 切歌时旧的一首用多少秒淡出

const byId = (id) => TRACKS.find((t) => t.id === id);

export class MusicPlayer {
  constructor() {
    this.mode = 'shuffle'; // 'shuffle'、某一首的 id、或 'synth'
    this.track = null; // 正在放的曲目；两首之间的空当里是 null
    this.bag = [];
    this.fails = 0;
    this.paused = false;
    this.onChange = null; // 换歌、歇下来时通知界面：(track | null) => void
    this.onFail = null; // 曲目都放不出来（比如文件缺失）
  }

  // 必须在用户点击之后调用。dest：声音送到哪个节点
  attach(ctx, dest) {
    this.ctx = ctx;
    // 始终只用这一个播放器换着放，浏览器才不会把后面几首当成"没经用户同意的自动播放"拦下来
    const el = (this.el = new Audio());
    el.preload = 'auto';
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(this.gain);
    this.gain.connect(dest);
    el.addEventListener('ended', () => this.rest());
    el.addEventListener('error', () => this.failed());
    el.addEventListener('playing', () => (this.fails = 0));
  }

  setMode(mode) {
    if (mode !== 'shuffle' && mode !== 'synth' && !byId(mode)) mode = 'shuffle';
    this.mode = mode;
    if (!this.el) return;
    if (mode === 'synth') this.stop();
    else if (mode !== 'shuffle') {
      if (!this.track || this.track.id !== mode) this.play(byId(mode));
    } else if (!this.track) this.play(this.draw(null)); // 正在放的那首让它放完
  }

  // "下一首"。轮播时换一首；单曲循环时改成循环列表里的下一首。返回换完之后的放法
  skip() {
    if (this.mode === 'synth' || !this.el) return this.mode;
    if (this.mode === 'shuffle') this.play(this.draw(this.track));
    else {
      const next = TRACKS[(TRACKS.indexOf(byId(this.mode)) + 1) % TRACKS.length];
      this.mode = next.id;
      this.play(next);
    }
    return this.mode;
  }

  // 从打乱的一摞里抽下一首：一摞抽完才重新洗，而且不和刚放完的那首重复
  draw(last) {
    if (!this.bag.length) {
      this.bag = TRACKS.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (last && this.bag.length > 1 && this.bag[this.bag.length - 1] === last) this.bag.unshift(this.bag.pop());
    }
    return this.bag.pop();
  }

  play(track) {
    clearTimeout(this.timer);
    this.track = track;
    if (this.onChange) this.onChange(track);
    const el = this.el;
    const g = this.gain.gain;
    const begin = () => {
      if (this.track !== track) return;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(1, now);
      el.src = DIR + track.file;
      // 页面在后台时先不出声，回到前台由 setPaused 接着放
      if (!this.paused) el.play().catch(() => {});
    };
    if (!el.paused && !el.ended && el.currentTime > 0) {
      g.setTargetAtTime(0, this.ctx.currentTime, FADE / 4);
      this.timer = setTimeout(begin, FADE * 1000);
    } else begin();
  }

  // 一首放完：安静一会儿再放下一首
  rest() {
    const last = this.track;
    this.track = null;
    if (this.onChange) this.onChange(null);
    this.wait(last, this.mode === 'shuffle' ? GAP : LOOP_GAP);
  }

  wait(last, seconds) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.mode === 'synth') return;
      this.play(this.mode === 'shuffle' ? this.draw(last) : byId(this.mode));
    }, seconds * 1000);
  }

  // 这一首加载不了：轮播时换下一首再试，接连都不行就放弃
  failed() {
    if (!this.track) return;
    this.fails++;
    const last = this.track;
    this.track = null;
    if (this.onChange) this.onChange(null);
    if (this.fails >= (this.mode === 'shuffle' ? TRACKS.length : 2)) {
      if (this.onFail) this.onFail();
      return;
    }
    this.wait(last, 0.3);
  }

  stop() {
    clearTimeout(this.timer);
    this.track = null;
    if (this.onChange) this.onChange(null);
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, FADE / 4);
    this.timer = setTimeout(() => this.el.pause(), FADE * 1000);
  }

  // 页面切到后台时停下，回来接着放
  setPaused(paused) {
    this.paused = paused;
    if (!this.el || !this.track) return;
    if (paused) this.el.pause();
    else this.el.play().catch(() => {});
  }
}
