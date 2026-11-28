// 繁荣度与小岛等级。繁荣度 = 全岛居民的评价之和（勉强 1、满意 2、惊喜 3），实现一个"新想法"再加 1。
// 等级只升不降：升级解锁新模块、提高居民上限，有几级还会让小岛长出新的陆地。
import { t, nameOf } from './i18n.js';
import { MODULES } from './config.js';

// 粉刷的十二样工具是一起解锁的，等级表里只写一个 'paint'
const BRUSHES = MODULES.filter((m) => m.brush).map((m) => m.id);
export const expandUnlock = (ids) => ids.flatMap((id) => (id === 'paint' ? [id, ...BRUSHES] : [id]));

// need：升到这一级需要的繁荣度；cap：居民上限；stage：小岛扩张到第几阶段；unlock：这一级解锁的模块
export const LEVELS = [
  { need: 0, cap: 3, unlock: ['room', 'balcony', 'road', 'garden', 'tree'] },
  { need: 4, cap: 4, unlock: ['lamp', 'shop'] },
  { need: 8, cap: 5, unlock: ['dock', 'well', 'paint'] },
  { need: 12, cap: 7, stage: 1, unlock: ['tower', 'field', 'bridge'] },
  { need: 16, cap: 9, unlock: ['workshop', 'windmill', 'orchard'] },
  { need: 20, cap: 12, stage: 2, unlock: ['greenhouse', 'pavilion', 'library'] },
  { need: 27, cap: 14, unlock: ['market', 'fountain'] },
  { need: 33, cap: 17, stage: 3, unlock: ['lighthouse', 'inn'] },
  { need: 41, cap: 21, unlock: ['stilt', 'terrace'] },
  { need: 50, cap: 24, final: true, unlock: ['clock'] },
];
export const MAX_LV = LEVELS.length - 1;

export function prosperityOf(results) {
  let p = 0;
  for (const r of results) p += r.tier + (r.tier >= 1 && r.bonus && r.bonus.done ? 1 : 0);
  return p;
}

export function levelFor(p) {
  let lv = 0;
  while (lv < MAX_LV && p >= LEVELS[lv + 1].need) lv++;
  return lv;
}

export function stageFor(lv) {
  let s = 0;
  for (let i = 0; i <= lv; i++) if (LEVELS[i].stage) s = LEVELS[i].stage;
  return s;
}

export function unlockedAt(lv) {
  const set = new Set();
  for (let i = 0; i <= lv; i++) for (const id of expandUnlock(LEVELS[i].unlock)) set.add(id);
  return set;
}

// 某个模块在哪一级解锁
export function unlockLevel(id) {
  const key = BRUSHES.includes(id) ? 'paint' : id;
  return LEVELS.findIndex((l) => l.unlock.includes(key));
}

// 升到 lv 级带来了什么，分行描述（升级提示和"下一级"预告都用它）
export function rewardsOf(lv) {
  const L = LEVELS[lv];
  const out = [];
  if (L.final) out.push(t('reward.final1'));
  if (L.stage) out.push(t('reward.stage', L.stage));
  if (L.unlock.length) out.push(t('reward.unlock', L.unlock.map(nameOf)));
  if (lv > 0 && L.cap > LEVELS[lv - 1].cap) out.push(t('reward.cap', L.cap));
  if (L.final) out.push(t('reward.final2'));
  return out;
}
