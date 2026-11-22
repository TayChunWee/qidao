import { View } from './view.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import { Pacer } from './perf.js';
import { t } from './i18n.js';

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.hidden = false;
  el.textContent = t('fatal', msg);
}

try {
  const view = new View(document.getElementById('scene'));
  const audio = new AudioEngine();
  const pacer = new Pacer(view);
  const game = new Game(view, audio, pacer);
  window.__game = game; // 方便调试

  const frame = (now) => {
    requestAnimationFrame(frame);
    if (!pacer.tick(now)) return; // 还没到下一帧的时间
    game.update(Math.min(0.05, pacer.dt / 1000));
    view.render(now);
  };
  requestAnimationFrame(frame);
} catch (err) {
  console.error(err);
  fatal(String(err && err.message ? err.message : err));
}
