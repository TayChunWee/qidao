// 音效和海浪声全部用 Web Audio 实时合成。背景音乐默认播放 music/ 里的曲目（见 music.js），
// 也可以在设置里换回合成音乐：和弦铺底 + 五声音阶旋律，建得越多乐器层越多，昼夜切换时换一套和弦与音色。
// 所有声部都踩在同一套拍点上（半拍一格，不摇摆、不随机错位）：旋律是带长音的四小节乐句，
// 伴奏是一拍一个音的分解和弦，低音只在第一、三拍。
// 音效：摆放、拆除、旋转、无效、界面、愿望达成。摆放音与音乐同调，连续摆放逐级升高。
import { MusicPlayer } from './music.js';

// 曲目相对合成音乐的音量。曲目的响度已经统一，这个数让两者听起来差不多响
const FILE_LEVEL = 1;
// 雨声有多大（过滤之前的白噪声乘上它）。要的是若有若无的细雨，不是哗哗的大雨
const RAIN_LEVEL = 0.03;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9]; // C 大调五声音阶

// 每小节一个和弦，八小节一轮
// 白天以大和弦为主、从主和弦起，听起来明亮；夜里换成更柔和的一轮，但不落到小调上
const PROG_DAY = [
  [48, 55, 62, 64], // Cadd9
  [47, 55, 62, 67], // G/B
  [45, 52, 60, 67], // Am7
  [53, 57, 60, 67], // Fadd9
  [52, 55, 60, 67], // C/E
  [53, 57, 60, 64], // Fmaj7
  [43, 50, 60, 62], // Gsus4
  [43, 50, 59, 62], // G
];
const PROG_NIGHT = [
  [53, 57, 60, 64], // Fmaj7
  [52, 55, 60, 67], // C/E
  [50, 57, 60, 65], // Dm7
  [48, 55, 62, 64], // Cadd9
  [53, 57, 60, 64], // Fmaj7
  [43, 50, 59, 64], // G6
  [45, 52, 60, 67], // Am7
  [47, 55, 62, 67], // G/B
];
// 旋律的节奏型：[从第几个半拍开始, 占几个半拍]。长音多、音符少，听起来才舒展
const RHYTHMS = [
  [[0, 2], [2, 2], [4, 4]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 3], [3, 1], [4, 4]],
  [[0, 2], [2, 1], [3, 1], [4, 4]],
  [[0, 6], [6, 2]],
  [[2, 2], [4, 2], [6, 2]],
];
// 一句话收尾用的节奏型：落在长音上
const CADENCES = [[[0, 8]], [[0, 4], [4, 4]], [[0, 2], [2, 6]]];
// 四小节一句：起、承（往上走）、转（往下回）、合（落下来）。数字是在音阶上走几级
const CONTOUR = [
  [-1, 0, 1, 1, 2],
  [-1, 1, 1, 2],
  [-2, -1, -1, 0, 1],
  [-2, -1, -1],
];
// 分解和弦一拍一个音，单双小节换一个走法
const HARP = [
  [0, 1, 2, 3],
  [0, 2, 3, 1],
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * k);
      d[i] = lp * (1 - k) ** 2.6;
    }
  }
  return buf;
}

function noiseBuffer(ctx, seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.7;
    this.sfxVol = 0.8;
    this.intensity = 0;
    this.bright = 1;
    this.combo = 0;
    this.lastPlace = 0;
    this.rhythm = null;
    this.melNote = 76;
    this.bpm = 68;
    this.beat = 60 / this.bpm;
    this.step = 0;
    this.prog = PROG_DAY;
    this.music = new MusicPlayer();
    this.trackMode = 'shuffle';
    this.synthOn = false;
    this.raining = false;
    this.rainGain = null;
    // 页面切到后台（换了标签页、最小化、关掉）就停声，回来再接着响
    const sync = () => this.setPaused(document.hidden);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => this.setPaused(true));
    window.addEventListener('pageshow', sync);
  }

  setPaused(paused) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    if (paused) this.ctx.suspend();
    else this.ctx.resume();
    this.music.setPaused(paused);
  }

  get ready() {
    return !!this.ctx;
  }

  // 必须在用户点击之后调用
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const G = (v, to) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (to) g.connect(to);
      return g;
    };

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = G(1.2, comp);
    // 音乐总线过一道均衡：压低低频、提亮高频，避免整体发闷
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'lowshelf';
    lowCut.frequency.value = 190;
    lowCut.gain.value = -3;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 2600;
    air.gain.value = 2.5;
    lowCut.connect(air);
    air.connect(this.master);
    this.musicBus = G(this.musicVol, lowCut);
    this.sfxBus = G(this.sfxVol, this.master);
    // 合成音乐的各个乐器层都先进这里，放曲目的时候整个关掉；海浪声不经过它，一直都在
    this.synthBus = G(0, this.musicBus);
    // 曲目是做好的成品，不再过均衡和压缩，直接输出
    this.fileBus = G(this.musicVol * FILE_LEVEL, ctx.destination);

    // 混响只留一点空间感：尾巴短（约 1.2 秒），回送量小，免得声音糊成一片
    const ir = impulse(ctx, 1.2);
    const mRev = ctx.createConvolver();
    mRev.buffer = ir;
    mRev.connect(G(0.34, this.synthBus));
    this.mSend = G(1, mRev);
    const sRev = ctx.createConvolver();
    sRev.buffer = ir;
    sRev.connect(G(0.5, this.sfxBus));
    this.sfx = G(1, this.sfxBus);
    this.sfx.connect(G(0.16, sRev));

    // 每个乐器层：干声进音乐总线，另一路进混响
    const layer = (dry, wet, on) => {
      const input = G(on ? 1 : 0);
      input.connect(G(dry, this.synthBus));
      input.connect(G(wet, this.mSend));
      return input;
    };
    this.L = {
      pad: layer(0.75, 0.2, false),
      bass: layer(1.0, 0, false),
      mel: layer(0.95, 0.2, true),
      arp: layer(0.9, 0.14, false),
      flute: layer(0.85, 0.3, false),
    };
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 2600;
    this.padFilter.Q.value = 0.4;
    this.padFilter.connect(this.L.pad);
    this.arpFilter = ctx.createBiquadFilter();
    this.arpFilter.type = 'lowpass';
    this.arpFilter.frequency.value = 3200;
    this.arpFilter.connect(this.L.arp);

    // 海浪底噪
    const sea = ctx.createBufferSource();
    sea.buffer = noiseBuffer(ctx, 4, true);
    sea.loop = true;
    const seaLp = ctx.createBiquadFilter();
    seaLp.type = 'lowpass';
    seaLp.frequency.value = 1200;
    const seaHp = ctx.createBiquadFilter();
    seaHp.type = 'highpass';
    seaHp.frequency.value = 260;
    const seaGain = G(0.035, this.musicBus);
    sea.connect(seaLp);
    seaLp.connect(seaHp);
    seaHp.connect(seaGain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    lfo.connect(G(0.022, seaGain.gain));
    lfo.start();
    sea.start();
    if (this.raining) this.setRain(true);

    this.noise = noiseBuffer(ctx, 1, false);

    const now = ctx.currentTime;
    this.L.pad.gain.setTargetAtTime(1, now, 1.5);
    this.nextTime = now + 0.4;
    this.applyIntensity();
    this.timer = setInterval(() => this.tick(), 60);

    this.music.attach(ctx, this.fileBus);
    // 曲目文件都放不出来的话，退回合成音乐，免得游戏没有音乐
    this.music.onFail = () => {
      this.useSynth(true);
      if (this.music.onChange) this.music.onChange(null);
    };
    this.setTrack(this.trackMode);
  }

  // ---------- 外部控制 ----------

  setMusic(v) {
    this.musicVol = v;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    this.fileBus.gain.setTargetAtTime(v * FILE_LEVEL, this.ctx.currentTime, 0.05);
  }

  // 背景音乐放什么：'shuffle' 随机轮播、某一首的 id（单曲循环）、'synth' 合成音乐
  setTrack(mode) {
    this.trackMode = mode;
    if (!this.ctx) return;
    this.music.setMode(mode);
    this.trackMode = this.music.mode;
    this.useSynth(this.trackMode === 'synth');
  }

  // "下一首"，返回换完之后的放法
  nextTrack() {
    if (this.ctx) this.trackMode = this.music.skip();
    return this.trackMode;
  }

  useSynth(on) {
    if (on === this.synthOn) return;
    this.synthOn = on;
    const now = this.ctx.currentTime;
    this.synthBus.gain.setTargetAtTime(on ? 1 : 0, now, 0.4);
    if (on) {
      // 从下一小节的开头接着奏
      this.step = Math.ceil(this.step / 8) * 8;
      this.nextTime = now + 0.5;
    }
  }

  // 细雨声：一层沙沙的底，加一层更细的高频，音量很小、慢慢起伏。和海浪一样走音乐那一路，
  // 所以它和背景音乐的音量比例是固定的，怎么调音量都不会盖过音乐。第一次下雨时才搭起来
  setRain(on) {
    this.raining = on;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (!this.rainGain) {
      if (!on) return;
      const g = (this.rainGain = ctx.createGain());
      g.gain.value = 0;
      g.connect(this.musicBus);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 3, false);
      src.loop = true;
      const band = (type, f, q) => {
        const b = ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = f;
        if (q) b.Q.value = q;
        return b;
      };
      const mix = (v) => {
        const m = ctx.createGain();
        m.gain.value = v;
        m.connect(g);
        return m;
      };
      // 底：落在地上、屋顶上的沙沙声
      const hp = band('highpass', 700);
      const lp = band('lowpass', 3800);
      src.connect(hp);
      hp.connect(lp);
      lp.connect(mix(1));
      // 上面薄薄一层更细的声音
      const fine = band('bandpass', 6200, 0.8);
      src.connect(fine);
      fine.connect(mix(0.45));
      // 一阵大一阵小
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const depth = ctx.createGain();
      depth.gain.value = RAIN_LEVEL * 0.22;
      lfo.connect(depth);
      depth.connect(g.gain);
      lfo.start();
      src.start();
    }
    // 雨声慢慢起来，雨停了慢慢收
    this.rainGain.gain.setTargetAtTime(on ? RAIN_LEVEL : 0, now, on ? 2.5 : 3.5);
  }

  setSfx(v) {
    this.sfxVol = v;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // 建造规模 -> 乐器层数
  setIntensity(count) {
    const lv = count >= 16 ? 3 : count >= 8 ? 2 : count >= 3 ? 1 : 0;
    if (lv === this.intensity) return;
    this.intensity = lv;
    this.applyIntensity();
  }

  applyIntensity() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 分解和弦从一开始就轻轻地在，让音乐有流动感；建得多了再加上低音和长笛
    this.L.arp.gain.setTargetAtTime(this.intensity >= 2 ? 1 : 0.6, now, 1.2);
    this.L.bass.gain.setTargetAtTime(this.intensity >= 1 ? 1 : 0, now, 1.2);
    this.L.flute.gain.setTargetAtTime(this.intensity >= 2 ? 1 : 0, now, 1.2);
  }

  // 1 = 白天，0 = 夜晚
  setBright(b) {
    this.bright = b;
    if (this.ctx) this.padFilter.frequency.setTargetAtTime(1100 + 1500 * b, this.ctx.currentTime, 1.5);
  }

  // ---------- 发声单元 ----------

  tone(dest, type, f, t, peak, a, d, { detune = 0, sustain = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (sustain > 0) g.gain.setValueAtTime(peak, t + a + sustain);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + sustain + d);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + sustain + d + 0.05);
    return o;
  }

  burst(dest, t, dur, peak, type, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    return f;
  }

  // 八音盒音色
  // len：余音长短的倍数。旋律用短一点的，音和音之间才不会叠成一片
  bell(dest, m, t, vel, len = 1) {
    const f = mtof(m);
    this.tone(dest, 'sine', f, t, 0.2 * vel, 0.005, 1.25 * len);
    this.tone(dest, 'sine', f * 2, t, 0.07 * vel, 0.004, 0.5 * len);
    this.tone(dest, 'sine', f * 3.01, t, 0.03 * vel, 0.003, 0.16);
  }

  // ---------- 音乐调度 ----------

  tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.synthOn) return;
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.1;
    while (this.nextTime < ctx.currentTime + 0.3) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.beat / 2;
      this.step++;
    }
  }

  // 每半拍调用一次。所有声部都用同一个 t，谁也不提前、不拖后
  scheduleStep(step, t) {
    const slot = step % 8;
    const bar = Math.floor(step / 8);
    const inProg = bar % 8;
    const night = this.bright < 0.5;
    if (slot === 0) {
      if (inProg === 0) this.prog = night ? PROG_NIGHT : PROG_DAY;
      this.chord = this.prog[inProg];
      this.motifNow = this.genMotif(this.chord, bar, night);
      this.playPad(this.chord, t);
      // 长笛隔一小节吹一个长音，从第一拍起，和铺底一起换气
      if (bar % 2 === 1) this.playFlute(this.chord[bar % 4 === 1 ? 3 : 2] + 12, t, this.beat * 3);
    }

    // 低音只在第一、三拍，最低只到 A2，避免发闷
    const root = this.chord[0] < 45 ? this.chord[0] + 12 : this.chord[0];
    if (slot === 0) {
      this.tone(this.L.bass, 'sine', mtof(root), t, 0.15, 0.02, 1.5);
      this.tone(this.L.bass, 'triangle', mtof(root), t, 0.025, 0.02, 0.8);
    } else if (slot === 4) {
      this.tone(this.L.bass, 'sine', mtof(this.chord[1]), t, 0.07, 0.02, 1.1);
    }

    const note = this.motifNow[slot];
    if (note) {
      this.bell(this.L.mel, note.m, t, note.v, note.len);
      // 白天的长音偶尔在高八度轻轻叠一个音，添一点亮色
      if (!night && note.dur >= 4 && Math.random() < 0.3) this.bell(this.L.mel, note.m + 12, t, note.v * 0.22, note.len * 0.8);
    }

    // 分解和弦：一拍一个音，像慢慢拨的竖琴
    if (slot % 2 === 0) {
      const q = slot / 2;
      const f = mtof(this.chord[HARP[bar % 2][q]] + 12);
      this.tone(this.arpFilter, 'triangle', f, t, q === 0 ? 0.055 : 0.042, 0.006, 0.95);
      this.tone(this.arpFilter, 'sine', f * 2, t, 0.01, 0.006, 0.5);
    }
  }

  playPad(chord, t) {
    const dur = this.beat * 4;
    // 铺底不用最低的根音，改放到高八度，声音更通透
    const notes = [chord[1], chord[2], chord[3], chord[0] + 12];
    for (const m of notes) {
      const f = mtof(m);
      this.tone(this.padFilter, 'triangle', f, t, 0.026, 0.9, 1.8, { detune: -5, sustain: dur - 0.9 });
      this.tone(this.padFilter, 'sine', f, t, 0.034, 0.9, 1.8, { detune: 6, sustain: dur - 0.9 });
    }
    this.tone(this.padFilter, 'sine', mtof(chord[2] + 12), t, 0.012, 1.2, 1.8, { sustain: dur - 1.2 });
  }

  playFlute(m, t, dur) {
    const o = this.tone(this.L.flute, 'sine', mtof(m), t, 0.07, 0.22, 0.7, { sustain: dur });
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = this.ctx.createGain();
    vg.gain.value = 3.5;
    vib.connect(vg);
    vg.connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur + 1);
    this.tone(this.L.flute, 'triangle', mtof(m), t, 0.012, 0.22, 0.7, { sustain: dur });
  }

  // 生成一小节旋律。四小节是一句：第二小节多半重复第一小节的节奏，第四小节落在长音上收住。
  // 音高在五声音阶上一级一级地走，强拍和长音落在和弦音上
  genMotif(chord, bar, night) {
    const out = new Array(8).fill(null);
    const inPhrase = bar % 4;
    // 夜里留白多一些：一句里的第二小节有时空着
    if (night && inPhrase === 1 && Math.random() < 0.5) return out;

    let rhythm;
    if (inPhrase === 3) rhythm = pick(CADENCES);
    else if (inPhrase === 1 && this.rhythm && Math.random() < 0.7) rhythm = this.rhythm;
    else rhythm = pick(RHYTHMS);
    if (inPhrase !== 3) this.rhythm = rhythm;

    const lo = night ? 67 : 72;
    const hi = night ? 81 : 86;
    const scale = [];
    for (let m = lo; m <= hi; m++) if (PENTA.includes(m % 12)) scale.push(m);
    const chordPc = chord.map((n) => n % 12);
    const mid = (scale.length - 1) / 2;

    let idx = 0;
    let bestD = 99;
    scale.forEach((m, i) => {
      const d = Math.abs(m - this.melNote);
      if (d < bestD) {
        bestD = d;
        idx = i;
      }
    });

    rhythm.forEach(([slot, dur], i) => {
      let step = pick(CONTOUR[inPhrase]);
      // 走得太高或太低了就往中间带，免得一直贴着边
      if ((idx - mid > 2 && step > 0) || (mid - idx > 2 && step < 0)) step = -step;
      idx = Math.max(0, Math.min(scale.length - 1, idx + step));
      const strong = slot % 4 === 0 || dur >= 4 || (inPhrase === 3 && i === rhythm.length - 1);
      if (strong) {
        for (const off of [0, -1, 1, -2, 2]) {
          const j = idx + off;
          if (j >= 0 && j < scale.length && chordPc.includes(scale[j] % 12)) {
            idx = j;
            break;
          }
        }
      }
      const accent = slot === 0 ? 1 : slot === 4 ? 0.86 : 0.72;
      out[slot] = {
        m: scale[idx],
        v: accent * (0.82 + Math.random() * 0.18),
        dur,
        len: Math.min(1.7, 0.65 + dur * 0.16), // 长音的余音也长一些
      };
    });
    this.melNote = scale[idx];
    return out;
  }

  // ---------- 音效 ----------

  get now() {
    return this.ctx.currentTime + 0.005;
  }

  // 摆放：与音乐同调的拨弦声，连续摆放逐级升高，楼层越高音越高
  place(level = 0, soft = false) {
    if (!this.ctx) return;
    const ms = performance.now();
    this.combo = ms - this.lastPlace < 1600 ? Math.min(this.combo + 1, 9) : 0;
    this.lastPlace = ms;
    const i = Math.min(this.combo + level * 2, 14);
    const m = 60 + 12 * Math.floor(i / 5) + PENTA[i % 5];
    const t = this.now;
    const f = mtof(m);
    const v = soft ? 0.6 : 1;
    this.tone(this.sfx, 'triangle', f, t, 0.2 * v, 0.004, 0.32);
    this.tone(this.sfx, 'sine', f * 2, t, 0.07 * v, 0.004, 0.2);
    // 落地的闷响
    const o = this.tone(this.sfx, 'sine', 150, t, 0.34 * v, 0.004, 0.16);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.13);
    this.burst(this.sfx, t, 0.07, 0.07 * v, 'highpass', 1800);
  }

  remove() {
    if (!this.ctx) return;
    const t = this.now;
    const o = this.tone(this.sfx, 'sine', 520, t, 0.2, 0.004, 0.16);
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.13);
    this.burst(this.sfx, t, 0.1, 0.06, 'bandpass', 900);
    this.combo = 0;
  }

  rotate() {
    if (!this.ctx) return;
    const t = this.now;
    const f = this.burst(this.sfx, t, 0.09, 0.09, 'bandpass', 900);
    f.Q.value = 2;
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
    this.tone(this.sfx, 'sine', 880, t + 0.02, 0.05, 0.003, 0.07);
  }

  invalid() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(this.sfx, 'triangle', 147, t, 0.2, 0.005, 0.12);
    this.tone(this.sfx, 'triangle', 117, t + 0.09, 0.2, 0.005, 0.18);
  }

  // 虚影吸附到新格子时极轻的一声
  snap() {
    if (!this.ctx) return;
    this.tone(this.sfx, 'sine', 1320, this.now, 0.018, 0.002, 0.035);
  }

  // 自动生成的部分长出来
  grow(n = 1) {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < Math.min(n, 4); i++) {
      this.tone(this.sfx, 'sine', mtof(84 + PENTA[(i * 2) % 5]), t + i * 0.05, 0.05, 0.004, 0.22);
    }
  }

  click() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(this.sfx, 'sine', 740, t, 0.09, 0.003, 0.06);
    this.tone(this.sfx, 'sine', 1110, t + 0.03, 0.06, 0.003, 0.08);
  }

  hover() {
    if (!this.ctx) return;
    this.tone(this.sfx, 'sine', 980, this.now, 0.022, 0.003, 0.05);
  }

  undo() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(this.sfx, 'triangle', 660, t, 0.1, 0.004, 0.09);
    this.tone(this.sfx, 'triangle', 495, t + 0.06, 0.1, 0.004, 0.12);
  }

  redo() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(this.sfx, 'triangle', 495, t, 0.1, 0.004, 0.09);
    this.tone(this.sfx, 'triangle', 660, t + 0.06, 0.1, 0.004, 0.12);
  }

  // 愿望达成：上行的琶音，档位越高音越多
  wish(tier) {
    if (!this.ctx) return;
    const t = this.now;
    const notes = [72, 76, 79, 84, 88, 91].slice(0, 3 + tier);
    notes.forEach((m, i) => this.bell(this.sfx, m, t + i * 0.09, 0.9));
  }

  // 新居民上岛：三声明亮的钟音
  arrive() {
    if (!this.ctx) return;
    const t = this.now;
    [79, 76, 84].forEach((m, i) => this.bell(this.sfx, m, t + i * 0.14, 0.85));
    const f = this.burst(this.sfx, t, 0.5, 0.03, 'bandpass', 700);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
  }

  // 小岛升级：一串上行的钟音，底下垫一个和弦
  levelUp() {
    if (!this.ctx) return;
    const t = this.now;
    [60, 64, 67].forEach((m) => this.tone(this.sfx, 'triangle', mtof(m), t, 0.07, 0.25, 1.6, { sustain: 0.5 }));
    [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => this.bell(this.sfx, m, t + 0.05 + i * 0.1, 0.95));
    const f = this.burst(this.sfx, t, 1.1, 0.035, 'bandpass', 900);
    f.frequency.exponentialRampToValueAtTime(4200, t + 1.0);
  }

  // 新陆地从海里升起来：低沉的隆隆声加水花
  rise() {
    if (!this.ctx) return;
    const t = this.now;
    const low = this.burst(this.sfx, t, 2.6, 0.16, 'lowpass', 140);
    low.frequency.linearRampToValueAtTime(320, t + 2.2);
    for (let i = 0; i < 7; i++) {
      const f = this.burst(this.sfx, t + 0.25 + i * 0.3 + Math.random() * 0.1, 0.35, 0.03, 'bandpass', 1400 + Math.random() * 1600);
      f.Q.value = 0.8;
    }
  }

  // 居民有了新想法：轻轻的两声
  idea() {
    if (!this.ctx) return;
    const t = this.now;
    this.bell(this.sfx, 81, t, 0.6);
    this.bell(this.sfx, 86, t + 0.12, 0.7);
  }

  // 愿望变差：两声下行
  sigh() {
    if (!this.ctx) return;
    const t = this.now;
    this.bell(this.sfx, 76, t, 0.6);
    this.bell(this.sfx, 72, t + 0.16, 0.6);
  }
}
