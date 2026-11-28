// 居民头像：每人一张用代码画的简笔头像，画在 40×40 的格子里，外面由样式裁成圆形、垫上各人衣服的颜色。
// 头像很小（手机上只有三十来像素），认人靠的是"颜色 + 轮廓"：帽子、发型的形状要一眼分得开，细节只是点缀。
// 帽子的种类、头发和帽子的颜色与岛上的小人一致（wishes.js 里的 look），这里只补上小人身上画不出来的东西。
import { C } from './config.js';

const INK = '#4a3a32';
const GOLD = '#e9b949';
const RED = '#d9503f';
const LEAF = '#7fc063';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (hex, to, k) => `rgb(${rgb(hex).map((v, i) => Math.round(v + (to[i] - v) * k)).join(',')})`;
const dark = (hex, k) => mix(hex, [40, 28, 24], k);
const lite = (hex, k) => mix(hex, [255, 255, 255], k);

// 四档心情 + 难过，对应嘴巴的形状（坐标是按整张脸占满 40×40 写的，用的时候缩到头的大小）
const MOUTH = ['M15 26h10', 'M14 25q6 4 12 0', 'M13 24q7 8 14 0', 'M12 23q8 12 16 0z', 'M14 28q6-5 12 0'];
const face = (mood) =>
  `<g transform="translate(20 24) scale(.7) translate(-20 -17)">` +
  (mood === 3 ? '<circle cx="9.5" cy="23" r="3.2" fill="#f0806a" opacity=".45"/><circle cx="30.5" cy="23" r="3.2" fill="#f0806a" opacity=".45"/>' : '') +
  `<circle cx="14" cy="17" r="2.3" fill="${INK}"/><circle cx="26" cy="17" r="2.3" fill="${INK}"/>` +
  `<path d="${MOUTH[mood] || MOUTH[1]}" fill="${mood === 3 ? INK : 'none'}" stroke="${INK}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>` +
  (mood === 3 ? '<ellipse cx="20" cy="27.3" rx="3.5" ry="1.5" fill="#ee8a78"/>' : '') +
  `</g>`;

// ---------- 头发 ----------

// 盖住头顶的那一片：外沿都一样，刘海各不相同
const CAP = 'M7.6 23.6A12.4 13 0 0 1 32.4 23.6';
const FRINGE = {
  crop: 'Q31 18.6 20 18Q9 18.6 7.6 23.6Z',
  part: 'Q31.6 20.4 27 19.6Q19 19.2 14.4 14.4Q9.6 17.6 7.6 23.6Z',
  centre: 'Q31 19.4 26.6 19Q21.8 17.8 20 13.4Q18.2 17.8 13.4 19Q9 19.4 7.6 23.6Z',
  bowl: 'L32.3 20.8H7.7Z',
  high: 'Q31 17 20 15.4Q9 17 7.6 23.6Z',
  // 斜着垂下来、遮住一只眼睛
  sweep: 'L31.6 29.4Q22 27 13.6 15.4Q9.6 18 7.6 23.6Z',
};
const cap = (h, fr = 'crop') => `<path d="${CAP}${FRINGE[fr]}" fill="${h}"/>`;
const SIDES = 'M7.9 17.4L7.8 24.6Q9.6 21 11.4 17.8ZM32.1 17.4L32.2 24.6Q30.4 21 28.6 17.8Z';
const TUFTS = (h) => `<ellipse cx="8.3" cy="21.8" rx="2.8" ry="4.5" fill="${h}"/><ellipse cx="31.7" cy="21.8" rx="2.8" ry="4.5" fill="${h}"/>`;

// 头后面的头发（先画，被头挡住一部分）
const BACK = {
  long: (h) => `<path d="M6.5 25A13.5 14.6 0 0 1 33.5 25L34.8 41H5.2Z" fill="${h}"/>`,
  bob: (h) => `<path d="M6.3 24.5A13.7 14.4 0 0 1 33.7 24.5Q35.2 32.6 30.6 35.2H9.4Q4.8 32.6 6.3 24.5Z" fill="${h}"/>`,
  tails: (h, s) =>
    `<ellipse cx="5.4" cy="24.6" rx="3.3" ry="6.6" transform="rotate(14 5.4 24.6)" fill="${h}"/>` +
    `<ellipse cx="34.6" cy="24.6" rx="3.3" ry="6.6" transform="rotate(-14 34.6 24.6)" fill="${h}"/>` +
    `<circle cx="7.6" cy="18.4" r="2" fill="${s.bow}"/><circle cx="32.4" cy="18.4" r="2" fill="${s.bow}"/>`,
  pony: (h) => `<ellipse cx="33.6" cy="25.6" rx="3.1" ry="7.4" transform="rotate(-13 33.6 25.6)" fill="${h}"/>`,
};

const HAIR = {
  crop: (h, s) => cap(h, s.fr),
  bun: (h, s) => `<circle cx="20" cy="8.6" r="4.9" fill="${h}"/>${cap(h, s.fr)}`,
  buns: (h, s) => `<circle cx="9.4" cy="11.8" r="5" fill="${h}"/><circle cx="30.6" cy="11.8" r="5" fill="${h}"/>${cap(h, s.fr)}`,
  // 头顶翘起一撮
  tuft: (h, s) => `<path d="M17.6 11.6Q17 4.4 24.6 3.8Q21.4 7 22.6 11.6Z" fill="${h}"/>${cap(h, s.fr)}`,
  spiky: (h) =>
    `<path d="M7.6 23.6L6.4 16.4L10.4 18.2L10 10.4L14.6 14L16.4 6.4L20 12L23.6 6.4L25.4 14L30 10.4L29.6 18.2L33.6 16.4L32.4 23.6Q31 19 20 18.4Q9 19 7.6 23.6Z" fill="${h}"/>`,
  // 一朵一朵的卷发
  curly: (h) =>
    `<g fill="${h}"><circle cx="9.3" cy="20" r="4.6"/><circle cx="12.4" cy="14.4" r="5.1"/><circle cx="20" cy="11.4" r="5.9"/><circle cx="27.6" cy="14.4" r="5.1"/><circle cx="30.7" cy="20" r="4.6"/>` +
    `<circle cx="14.6" cy="17.4" r="3.5"/><circle cx="20" cy="16.8" r="3.7"/><circle cx="25.4" cy="17.4" r="3.5"/></g>`,
  // 头顶光光的，只剩两鬓
  bald: (h) => `${TUFTS(h)}<ellipse cx="15.6" cy="16.8" rx="2.6" ry="1.4" transform="rotate(-28 15.6 16.8)" fill="#fff" opacity=".4"/>`,
  // 头顶挽一个小髻
  knot: (h) => `${TUFTS(h)}<circle cx="20" cy="10.6" r="3.6" fill="${h}"/><path d="M16.8 12.9h6.4" stroke="${dark(h, 0.3)}" stroke-width="1.1" stroke-linecap="round"/>`,
  sides: (h) => `<path d="${SIDES}" fill="${h}"/>`,
};

// ---------- 帽子 ----------

const HAT = {
  // 草帽：tint 是帽带的颜色
  straw: (look) =>
    `<ellipse cx="20" cy="15.9" rx="17.7" ry="4.4" fill="${dark(C.straw, 0.2)}"/><ellipse cx="20" cy="14.8" rx="17.7" ry="4.2" fill="${C.straw}"/>` +
    `<path d="M11.4 14.2Q11.6 4.4 20 4.4Q28.4 4.4 28.6 14.2Q20 16.6 11.4 14.2Z" fill="${lite(C.straw, 0.12)}"/>` +
    `<path d="M11.46 11.4Q20 14 28.54 11.4L28.6 14.2Q20 16.6 11.4 14.2Z" fill="${look.tint || dark(C.straw, 0.28)}"/>`,
  // 斗笠
  li: () =>
    `<path d="M1.8 17.6Q20 25.4 38.2 17.6Q20 21 1.8 17.6Z" fill="${dark(C.straw, 0.3)}"/><path d="M1.8 17.6L20 3.2L38.2 17.6Q20 22.6 1.8 17.6Z" fill="${C.straw}"/>` +
    `<path d="M20 3.2L11.4 19.6M20 3.2L20 21M20 3.2L28.6 19.6" fill="none" stroke="${dark(C.straw, 0.2)}" stroke-width=".7"/>`,
  // 鸭舌帽：tint 是帽子的颜色
  cap: (look) => {
    const c = look.tint || C.metal;
    return (
      `<path d="M8.2 19A11.8 11.8 0 0 1 31.8 19Z" fill="${c}"/><path d="M13 10.4Q17 7.8 21 8" fill="none" stroke="${lite(c, 0.3)}" stroke-width="1.1" stroke-linecap="round"/>` +
      `<path d="M6.6 18.7Q20 15.2 33.4 18.7Q33.2 21.2 20 21.6Q6.8 21.2 6.6 18.7Z" fill="${dark(c, 0.26)}"/>`
    );
  },
  // 贝雷帽：tint 是帽子的颜色
  beret: (look) => {
    const c = look.tint || '#c0504a';
    return (
      `<path d="M21.4 6.8L22.8 3.4" stroke="${dark(c, 0.2)}" stroke-width="1.5" stroke-linecap="round"/>` +
      `<ellipse cx="19" cy="12.6" rx="13.4" ry="6.7" transform="rotate(-9 19 12.6)" fill="${c}"/>` +
      `<path d="M9.6 12.6Q13 8.4 19 8" fill="none" stroke="${lite(c, 0.28)}" stroke-width="1.1" stroke-linecap="round"/>`
    );
  },
  // 观星人的尖帽，和头发一个颜色
  cone: (look) =>
    `<path d="M10.4 15.2Q13.6 7 23.8 1.6Q24.4 9.4 29.6 15.2Q20 18 10.4 15.2Z" fill="${look.hair}"/>` +
    `<ellipse cx="20" cy="15.7" rx="14.8" ry="3.4" fill="${lite(look.hair, 0.14)}"/>` +
    `<path d="M10.9 14.6Q20 17.4 29.1 14.6Q20 12.6 10.9 14.6Z" fill="${look.hair}"/>` +
    `<path d="M19.4 6.2l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z" fill="${C.spark}"/><circle cx="23.7" cy="2.1" r="1.3" fill="${C.spark}"/>`,
};

// ---------- 配饰 ----------
// 每样东西画在哪一层：neck 在头后面、肩膀上面；beard 在嘴底下；lip 在嘴上面；top 最上面

const flower = (x, y, r, col, mid = '#f6d86b') =>
  [0, 72, 144, 216, 288].map((a) => `<circle cx="${x}" cy="${y - r}" r="${r * 0.72}" transform="rotate(${a} ${x} ${y})" fill="${col}"/>`).join('') +
  `<circle cx="${x}" cy="${y}" r="${r * 0.6}" fill="${mid}"/>`;

const EXTRA = {
  blush: () => ['face', '<circle cx="12.5" cy="28.3" r="2.3" fill="#f0806a" opacity=".42"/><circle cx="27.5" cy="28.3" r="2.3" fill="#f0806a" opacity=".42"/>'],
  // 圆眼镜、方眼镜
  glasses: () => [
    'top',
    `<g fill="rgba(255,255,255,.32)" stroke="${INK}" stroke-width=".95"><circle cx="15.8" cy="24" r="3.4"/><circle cx="24.2" cy="24" r="3.4"/></g><path d="M19.2 23.6h1.6" stroke="${INK}" stroke-width=".95"/>`,
  ],
  specs: () => [
    'top',
    `<g fill="rgba(255,255,255,.32)" stroke="${INK}" stroke-width="1"><rect x="12.3" y="21.2" width="6.6" height="5.6" rx="1.3"/><rect x="21.1" y="21.2" width="6.6" height="5.6" rx="1.3"/></g><path d="M18.9 23.4h2.2" stroke="${INK}" stroke-width="1"/>`,
  ],
  // 胡子都用头发的颜色。嘴上的胡子描一圈肤色的边，张嘴大笑时才不会和嘴糊成一片
  stache: (l) => ['lip', `<path d="M20 28Q17.6 26 13.4 28.5Q17 30.2 20 28.8Q23 30.2 26.6 28.5Q22.4 26 20 28Z" fill="${l.hair}" stroke="${C.skin}" stroke-width=".7"/>`],
  walrus: (l) => ['lip', `<path d="M20 27.7Q16.4 25.6 12.4 28.2Q12.8 33 15.4 33.2Q17.2 30.2 20 29.2Q22.8 30.2 24.6 33.2Q27.2 33 27.6 28.2Q23.6 25.6 20 27.7Z" fill="${l.hair}" stroke="${C.skin}" stroke-width=".7"/>`],
  beard: (l) => ['beard', `<path d="M8.6 26.4Q8.4 39 20 39Q31.6 39 31.4 26.4Q29.6 33.5 20 33.9Q10.4 33.5 8.6 26.4Z" fill="${l.hair}"/>`],
  longbeard: (l) => ['beard', `<path d="M8.6 26.4Q7.8 36 14 40L20 44L26 40Q32.2 36 31.4 26.4Q29.6 33.3 20 33.7Q10.4 33.3 8.6 26.4Z" fill="${l.hair}"/>`],
  goatee: (l) => ['beard', `<path d="M16.2 33.3Q20 32 23.8 33.3Q23.4 38.8 20 41Q16.6 38.8 16.2 33.3Z" fill="${l.hair}"/>`],
  brows: (l) => ['top', `<path d="M12.6 21.1q3-2.1 5.8-.5M27.4 21.1q-3-2.1-5.8-.5" fill="none" stroke="${l.hair}" stroke-width="1.7" stroke-linecap="round"/>`],
  // 发髻上横插的簪子、铅笔
  stick: () => ['top', `<path d="M13 5.6L27 11" stroke="${GOLD}" stroke-width="1.3" stroke-linecap="round"/><circle cx="12.6" cy="5.4" r="1.5" fill="${RED}"/>`],
  pencil: () => ['top', `<path d="M27.4 5.4L13.6 11.2" stroke="#f2c14e" stroke-width="1.7" stroke-linecap="round"/><path d="M13.6 11.2l-1.5.7" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`],
  earrings: () => ['top', `<circle cx="8.7" cy="29.6" r="1.5" fill="${GOLD}"/><circle cx="31.3" cy="29.6" r="1.5" fill="${GOLD}"/>`],
  flowers: () => ['top', flower(28.8, 14.8, 3, '#f7a8c0') + flower(11.2, 13.4, 2.2, '#fff3d0', '#f2b84b')],
  plum: () => ['top', flower(27.2, 12.2, 2.7, '#d9483b')],
  rainbow: () => [
    'top',
    ['#e8604f', '#f2c14e', '#5fa8d8'].map((c, i) => `<path d="M${8.4 + i * 0.2} ${17.6 + i}Q20 ${9.6 + i} ${31.6 - i * 0.2} ${17.6 + i}" fill="none" stroke="${c}" stroke-width="1.05"/>`).join(''),
  ],
  // 额头上扎的头巾，结打在一边
  bandana: () => ['top', `<path d="M31.6 19.4l5-2.8-.7 4.4zM31.8 20.4l4.2 3.6-4-.2z" fill="${dark(RED, 0.15)}"/><path d="M7.9 20.7Q20 15.6 32.1 20.7" fill="none" stroke="${RED}" stroke-width="2.9"/>`],
  kerchief: () => ['neck', `<path d="M11.4 33.6Q20 38.4 28.6 33.6L20 42.5Z" fill="${RED}"/>`],
  bowtie: () => ['neck', `<path d="M20 38l-5.4-2.9v5.8zM20 38l5.4-2.9v5.8z" fill="${RED}"/>`],
  // 推在额头上的泳镜
  goggles: (l) => [
    'top',
    `<path d="M8.1 19.6Q20 13 31.9 19.6" fill="none" stroke="${dark(l.hair, 0.2)}" stroke-width="1.5"/>` +
      `<g fill="#c4ecf4" stroke="#f2b84b" stroke-width="1.1"><ellipse cx="15.5" cy="16.7" rx="3.6" ry="2.7"/><ellipse cx="24.5" cy="16.7" rx="3.6" ry="2.7"/></g>`,
  ],
  // 推在头顶的墨镜
  shades: () => [
    'top',
    `<rect x="11.2" y="12.4" width="7.8" height="4.9" rx="2.3" fill="${INK}"/><rect x="21" y="12.4" width="7.8" height="4.9" rx="2.3" fill="${INK}"/><path d="M19 14.4h2" stroke="${INK}" stroke-width="1.1"/>` +
      `<path d="M12.8 14.2l2-1.1M22.6 14.2l2-1.1" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".6"/>`,
  ],
  // 木匠夹在耳朵上的铅笔
  earpencil: () => ['top', `<path d="M31.4 16.2L33.7 25" stroke="#f2c14e" stroke-width="1.8" stroke-linecap="round"/><path d="M31.2 15.4l.3 1.2" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`],
  // 嘴里叼的麦秆
  stalk: () => ['top', `<path d="M23 30.4L32 26.8" stroke="#c9a550" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="33" cy="26.3" rx="2.1" ry="1.1" transform="rotate(-22 33 26.3)" fill="#e3c063"/>`],
  // 头顶冒出来的小芽
  sprout: () => [
    'top',
    `<path d="M20 11.6Q19.4 8.4 20.4 6.2" fill="none" stroke="#5f9f4f" stroke-width="1.3" stroke-linecap="round"/>` +
      `<ellipse cx="17.4" cy="5.6" rx="3" ry="1.6" transform="rotate(-24 17.4 5.6)" fill="${LEAF}"/><ellipse cx="23.2" cy="5" rx="3" ry="1.6" transform="rotate(22 23.2 5)" fill="#93d478"/>`,
  ],
  // 发髻上的两片叶子
  leaves: () => ['top', `<ellipse cx="16.6" cy="4.8" rx="3.2" ry="1.7" transform="rotate(-30 16.6 4.8)" fill="${LEAF}"/><ellipse cx="23.4" cy="4.6" rx="3.2" ry="1.7" transform="rotate(28 23.4 4.6)" fill="#a3e088"/>`],
  // 草帽上别的果子
  apple: () => ['top', `<circle cx="26.4" cy="8.4" r="2.7" fill="#d9483b"/><circle cx="25.6" cy="7.6" r=".8" fill="#fff" opacity=".5"/><ellipse cx="27.9" cy="5.3" rx="1.9" ry="1" transform="rotate(-35 27.9 5.3)" fill="${LEAF}"/>`],
  // 草帽带子上打的蝴蝶结
  ribbon: (l) => ['top', `<path d="M27.6 12.8l-4.2-2.6v5zM27.6 12.8l4-2.2-.4 4.8z" fill="${dark(l.tint || RED, 0.12)}"/>`],
  // 帽徽
  badge: () => ['top', `<circle cx="20" cy="13.4" r="2.1" fill="${GOLD}"/>`],
  // 两条垂到肩上的辫子
  braids: (l) => [
    'top',
    [8.4, 31.6]
      .map((x) => [27.6, 31, 34.4].map((y) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="2.3" fill="${l.hair}"/>`).join('') + `<circle cx="${x}" cy="${36.9}" r="1.5" fill="${RED}"/>`)
      .join(''),
  ],
  // 脸上蹭到的颜料
  paint: () => ['top', `<circle cx="27.6" cy="28.6" r="1.5" fill="#5fa8d8"/><circle cx="12.8" cy="27" r="1.1" fill="#f2c14e"/>`],
};

// ---------- 每个人的样子 ----------
// hair：没戴帽子的人的发型（戴帽子的只露两鬓）；fr：刘海；back：头后面的头发；x：配饰
const WHO = {
  tang: { hair: 'bun', fr: 'part' },
  mo: { x: ['stache'] },
  chen: { hair: 'tuft', x: ['blush'] },
  gui: { hair: 'bun', fr: 'centre', x: ['stick', 'earrings'] },
  tie: { x: ['beard', 'brows'] },
  xing: {},
  chao: { x: ['kerchief'] },
  nao: { hair: 'spiky', x: ['bandana'] },
  song: { hair: 'bald', x: ['brows', 'stache'] },
  he: { back: 'bob' },
  hua: { hair: 'bun', x: ['flowers'] },
  yun: { hair: 'curly' },
  hai: { hair: 'crop', fr: 'high', back: 'bob', x: ['goggles'] },
  shu: { x: ['longbeard', 'glasses'] },
  dou: { hair: 'crop', fr: 'bowl', x: ['sprout', 'blush'] },
  jing: { hair: 'bun', fr: 'centre', x: ['glasses'] },
  yubo: { x: ['longbeard', 'brows'] },
  tian: { x: ['stache', 'stalk'] },
  mai: { hair: 'bun', x: ['braids'] },
  su: { x: ['blush'] },
  yu: { hair: 'crop', x: ['beard', 'earpencil'] },
  jue: { hair: 'bun', x: ['leaves'] },
  yin: { hair: 'crop', fr: 'sweep', back: 'long' },
  fu: { x: ['stache', 'blush'] },
  di: { back: 'long' },
  deng: { x: ['beard', 'badge'] },
  cai: { back: 'pony', x: ['paint'] },
  qi: { hair: 'crop', fr: 'part', x: ['specs', 'bowtie'] },
  hong: { hair: 'bun', x: ['rainbow'] },
  lan: { x: ['walrus'] },
  mei: { hair: 'bun', x: ['plum', 'earrings'] },
  zi: { hair: 'crop', fr: 'bowl', back: 'tails', bow: '#d6b4f5' },
  wan: { hair: 'knot', x: ['longbeard', 'brows'] },
  xin: { x: ['badge'] },
  qiao: { x: ['braids', 'ribbon'] },
  guo: { back: 'bob', x: ['apple', 'blush'] },
  juan: { hair: 'bun', x: ['pencil', 'specs'] },
  wang: { hair: 'buns', x: ['blush'] },
  lu: { hair: 'crop', back: 'bob', x: ['shades'] },
  ting: { back: 'long' },
  zhong: { x: ['goatee', 'glasses'] },
};

// 一张头像。look：wishes.js 里这位居民的样子（衣服、头发的颜色，帽子）；mood：0 到 3 是四档评价
export function avatar(id, look, mood = 1) {
  const s = WHO[id] || { hair: 'crop' };
  const h = look.hair;
  const layer = { neck: '', beard: '', face: '', lip: '', top: '' };
  for (const name of s.x || []) {
    const [where, svg] = EXTRA[name](look);
    layer[where] += svg;
  }
  return (
    `<svg viewBox="0 0 40 40">` +
    (s.back ? BACK[s.back](h, s) : '') +
    `<path d="M2 41Q3.4 31 20 31Q36.6 31 38 41Z" fill="rgba(60,36,28,.17)"/>` +
    layer.neck +
    `<circle cx="8.7" cy="25.6" r="2.1" fill="${dark(C.skin, 0.07)}"/><circle cx="31.3" cy="25.6" r="2.1" fill="${dark(C.skin, 0.07)}"/>` +
    `<circle cx="20" cy="24.5" r="11.5" fill="${C.skin}" stroke="rgba(74,58,50,.3)" stroke-width=".6"/>` +
    layer.beard +
    layer.face +
    face(mood) +
    layer.lip +
    (look.hat ? HAIR.sides(h) + HAT[look.hat](look) : HAIR[s.hair || 'crop'](h, s)) +
    layer.top +
    `</svg>`
  );
}
