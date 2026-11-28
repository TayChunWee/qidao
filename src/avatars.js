// 居民头像：每人一张用代码画的简笔头像，画在 40×40 的格子里，外面由样式裁成圆形、垫上各人衣服的颜色。
// 头像很小（手机上只有三十来像素），认人靠的是"颜色 + 轮廓"：帽子、发型的形状要一眼分得开，细节只是点缀。
// 帽子的种类、头发和帽子的颜色与岛上的小人一致（wishes.js 里的 look），这里只补上小人身上画不出来的东西。
// 画法是"描边"：每一块实心的颜色外面勾一圈深色的线，像贴纸。勾线不用一块块手写，画完以后由 outline() 统一加。
import { C } from './config.js';

const INK = '#4a3a32';
const GOLD = '#e9b949';
const RED = '#d9503f';
const LEAF = '#7fc063';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (hex, to, k) => `rgb(${rgb(hex).map((v, i) => Math.round(v + (to[i] - v) * k)).join(',')})`;
const dark = (hex, k) => mix(hex, [40, 28, 24], k);
const lite = (hex, k) => mix(hex, [255, 255, 255], k);
// 头发上的那道光：深色头发提亮，白头发反过来压暗一点
const sheen = (hex) => {
  const [r, g, b] = rgb(hex);
  return 0.3 * r + 0.59 * g + 0.11 * b > 178 ? dark(hex, 0.13) : lite(hex, 0.24);
};
const line = (d, col, w) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// 四档心情 + 难过，对应嘴巴的形状（坐标是按整张脸占满 40×40 写的，用的时候缩到头的大小）
// low：嘴往下挪多少，留给嘴上有胡子的人
const MOUTH = ['M15 26h10', 'M14 25q6 4 12 0', 'M13 24q7 8 14 0', 'M12 23q8 12 16 0z', 'M14 28q6-5 12 0'];
const face = (mood, low) =>
  `<g transform="translate(20 24) scale(.7) translate(-20 -17)">` +
  (mood === 3
    ? '<circle cx="9.5" cy="23" r="3.2" fill="#f0806a" opacity=".45"/><circle cx="30.5" cy="23" r="3.2" fill="#f0806a" opacity=".45"/>' +
      // 最开心的时候眼睛笑成两道弯
      line('M11.3 18.3q2.7-3.8 5.4 0M23.3 18.3q2.7-3.8 5.4 0', INK, 2.3)
    : `<circle cx="14" cy="17" r="2.3" fill="${INK}"/><circle cx="26" cy="17" r="2.3" fill="${INK}"/><circle cx="14.9" cy="16" r=".8" fill="#fff"/><circle cx="26.9" cy="16" r=".8" fill="#fff"/>`) +
  `<g transform="translate(0 ${low})"><path d="${MOUTH[mood] || MOUTH[1]}" fill="${mood === 3 ? INK : 'none'}" stroke="${INK}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>` +
  (mood === 3 ? '<ellipse cx="20" cy="27.3" rx="3.5" ry="1.5" fill="#ee8a78"/>' : '') +
  `</g></g>`;

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
const cap = (h, fr = 'crop') => `<path d="${CAP}${FRINGE[fr]}" fill="${h}"/>${line('M12.4 14.6Q14.8 12.2 18.6 11.7', sheen(h), 1.1)}`;
const bunShine = (h, x, y) => line(`M${x - 2.9} ${y - 1}Q${x - 1.7} ${y - 3.2} ${x + 0.7} ${y - 3.4}`, sheen(h), 1);
const SIDES = 'M7.9 17.4L7.8 24.6Q9.6 21 11.4 17.8ZM32.1 17.4L32.2 24.6Q30.4 21 28.6 17.8Z';

// 头后面的头发（先画，被头挡住一部分）
const BACK = {
  long: (h) => `<path d="M6.5 25A13.5 14.6 0 0 1 33.5 25L34.8 41H5.2Z" fill="${h}"/>${line('M8.6 31V39M31.4 31V39', dark(h, 0.14), 0.7)}`,
  bob: (h) => `<path d="M6.3 24.5A13.7 14.4 0 0 1 33.7 24.5Q35.2 32.6 30.6 35.2H9.4Q4.8 32.6 6.3 24.5Z" fill="${h}"/>`,
  tails: (h, s) =>
    `<ellipse cx="5.4" cy="24.6" rx="3.3" ry="6.6" transform="rotate(14 5.4 24.6)" fill="${h}"/>` +
    `<ellipse cx="34.6" cy="24.6" rx="3.3" ry="6.6" transform="rotate(-14 34.6 24.6)" fill="${h}"/>` +
    [7.6, 32.4].map((x) => `<path d="M${x} 18.4l-2.6-1.9v3.8zM${x} 18.4l2.6-1.9v3.8z" fill="${s.bow}"/><circle cx="${x}" cy="18.4" r=".9" fill="${dark(s.bow, 0.2)}"/>`).join(''),
  // 秃顶的人两鬓剩下的头发：画在头的后面，只从两侧耳朵上方露出一点（画在头前面会像戴了耳罩）
  ring: (h) => `<g fill="${h}"><circle cx="7.7" cy="18.8" r="3.1"/><circle cx="7.2" cy="22.8" r="2.9"/><circle cx="32.3" cy="18.8" r="3.1"/><circle cx="32.8" cy="22.8" r="2.9"/></g>`,
  pony: (h) => `<ellipse cx="33.6" cy="25.6" rx="3.1" ry="7.4" transform="rotate(-13 33.6 25.6)" fill="${h}"/><circle cx="32.2" cy="19.6" r="1.4" fill="${GOLD}"/>`,
};

const HAIR = {
  crop: (h, s) => cap(h, s.fr),
  bun: (h, s) => `<circle cx="20" cy="8.6" r="4.9" fill="${h}"/>${bunShine(h, 20, 8.6)}${cap(h, s.fr)}`,
  buns: (h, s) => `<circle cx="9.4" cy="11.8" r="5" fill="${h}"/><circle cx="30.6" cy="11.8" r="5" fill="${h}"/>${bunShine(h, 9.4, 11.8)}${bunShine(h, 30.6, 11.8)}${cap(h, s.fr)}`,
  // 头顶翘起一撮
  tuft: (h, s) => `<path d="M17.6 11.6Q17 4.4 24.6 3.8Q21.4 7 22.6 11.6Z" fill="${h}"/>${cap(h, s.fr)}`,
  spiky: (h) =>
    `<path d="M7.6 23.6L6.4 16.4L10.4 18.2L10 10.4L14.6 14L16.4 6.4L20 12L23.6 6.4L25.4 14L30 10.4L29.6 18.2L33.6 16.4L32.4 23.6Q31 19 20 18.4Q9 19 7.6 23.6Z" fill="${h}"/>` +
    line('M12.6 16.4L12.2 13.4M17.4 13.4L17 10.2', sheen(h), 0.9),
  // 一朵一朵的卷发
  curly: (h) =>
    `<g fill="${h}"><circle cx="9.3" cy="20" r="4.6"/><circle cx="12.4" cy="14.4" r="5.1"/><circle cx="20" cy="11.4" r="5.9"/><circle cx="27.6" cy="14.4" r="5.1"/><circle cx="30.7" cy="20" r="4.6"/>` +
    `<circle cx="14.6" cy="17.4" r="3.5"/><circle cx="20" cy="16.8" r="3.7"/><circle cx="25.4" cy="17.4" r="3.5"/></g>` +
    line('M9.6 13.6Q10.6 11 13 10.4M16.6 9.4Q18 7.2 20.6 7M25.6 11.4Q27.4 10.4 29 11.4M7 19.4Q7 17.6 8.2 16.6', sheen(h), 0.9) +
    line('M12.6 19.6Q14.6 21.4 16.6 19.8M23.4 19.8Q25.4 21.4 27.4 19.6', dark(h, 0.16), 0.7),
  // 头顶光光的，只剩两鬓
  bald: () => `<ellipse cx="15.6" cy="16.8" rx="2.6" ry="1.4" transform="rotate(-28 15.6 16.8)" fill="#fff" opacity=".4"/>`,
  // 头顶挽一个小髻
  knot: (h) => `<circle cx="20" cy="10.6" r="3.6" fill="${h}"/>${line('M16.8 12.9h6.4', dark(h, 0.3), 1.1)}`,
  sides: (h) => `<path d="${SIDES}" fill="${h}"/>`,
};

// ---------- 帽子 ----------

const HAT = {
  // 草帽：tint 是帽带的颜色
  straw: (look) =>
    `<ellipse cx="20" cy="15.9" rx="17.7" ry="4.4" fill="${dark(C.straw, 0.2)}"/><ellipse cx="20" cy="14.8" rx="17.7" ry="4.2" fill="${C.straw}"/>` +
    line('M5.4 14.6h3.2M31.4 14.6h3.2M9.4 16.9h3M27.6 16.9h3M17 18.2h6', dark(C.straw, 0.16), 0.5) +
    `<path d="M11.4 14.2Q11.6 4.4 20 4.4Q28.4 4.4 28.6 14.2Q20 16.6 11.4 14.2Z" fill="${lite(C.straw, 0.12)}"/>` +
    line('M13.3 10Q13.9 6.6 17.8 5.6', lite(C.straw, 0.55), 1) +
    `<path d="M11.46 11.4Q20 14 28.54 11.4L28.6 14.2Q20 16.6 11.4 14.2Z" fill="${look.tint || dark(C.straw, 0.28)}"/>`,
  // 斗笠
  li: () =>
    `<path d="M1.8 17.6Q20 25.4 38.2 17.6Q20 21 1.8 17.6Z" fill="${dark(C.straw, 0.3)}"/><path d="M1.8 17.6L20 3.2L38.2 17.6Q20 22.6 1.8 17.6Z" fill="${C.straw}"/>` +
    line('M20 3.2L11.4 19.6M20 3.2L20 21M20 3.2L28.6 19.6M20 3.2L5.4 18.4M20 3.2L34.6 18.4', dark(C.straw, 0.2), 0.6) +
    line('M12.8 9Q20 11 27.2 9M7.4 13.6Q20 17 32.6 13.6', dark(C.straw, 0.14), 0.5) +
    `<circle cx="20" cy="3.6" r="1.1" fill="${dark(C.straw, 0.34)}"/>`,
  // 鸭舌帽：tint 是帽子的颜色
  cap: (look) => {
    const c = look.tint || C.metal;
    return (
      `<path d="M8.2 19A11.8 11.8 0 0 1 31.8 19Z" fill="${c}"/>` +
      line('M20 7.4Q14.2 10.4 12.8 18M20 7.4Q25.8 10.4 27.2 18', dark(c, 0.14), 0.5) +
      line('M12.4 11.2Q15.4 8.2 18.6 8', lite(c, 0.32), 1.1) +
      `<circle cx="20" cy="7.5" r="1.1" fill="${dark(c, 0.26)}"/>` +
      `<path d="M6.6 18.7Q20 15.2 33.4 18.7Q33.2 21.2 20 21.6Q6.8 21.2 6.6 18.7Z" fill="${dark(c, 0.26)}"/>` +
      line('M10.4 18.4Q20 16.3 29.6 18.4', lite(c, 0.12), 0.5)
    );
  },
  // 面包师的高帽：tint 是帽子的颜色
  toque: (look) => {
    const c = look.tint || '#f6f1e6';
    return (
      `<g fill="${c}"><circle cx="13.2" cy="10" r="5.2"/><circle cx="20" cy="7.4" r="6"/><circle cx="26.8" cy="10" r="5.2"/><path d="M10 10h20l-.5 9.6h-19Z"/></g>` +
      line('M15.4 9.4V15M20 8.4V15M24.6 9.4V15', dark(c, 0.12), 0.6) +
      `<path d="M10.36 16h19.28l-.14 3.6h-19Z" fill="${dark(c, 0.1)}"/>`
    );
  },
  // 贝雷帽：tint 是帽子的颜色
  beret: (look) => {
    const c = look.tint || '#c0504a';
    return (
      line('M21.4 6.8L22.8 3.4', dark(c, 0.2), 1.5) +
      `<ellipse cx="19" cy="12.6" rx="13.4" ry="6.7" transform="rotate(-9 19 12.6)" fill="${c}"/>` +
      line('M9.6 12.6Q13 8.4 19 8', lite(c, 0.28), 1.1) +
      line('M7.4 16.6Q19 21 31.6 14.4', dark(c, 0.22), 0.9)
    );
  },
  // 观星人的尖帽，和头发一个颜色
  cone: (look) =>
    `<path d="M10.4 15.2Q13.6 7 23.8 1.6Q24.4 9.4 29.6 15.2Q20 18 10.4 15.2Z" fill="${look.hair}"/>` +
    `<ellipse cx="20" cy="15.7" rx="14.8" ry="3.4" fill="${lite(look.hair, 0.14)}"/>` +
    `<path d="M10.9 14.6Q20 17.4 29.1 14.6Q20 12.6 10.9 14.6Z" fill="${look.hair}"/>` +
    `<path d="M19.4 6.2l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z" fill="${C.spark}"/><circle cx="23.7" cy="2.1" r="1.3" fill="${C.spark}"/>` +
    `<circle cx="14.8" cy="12.4" r=".6" fill="${C.spark}"/><circle cx="25.2" cy="11" r=".7" fill="${C.spark}"/><circle cx="22.6" cy="5.4" r=".5" fill="${C.spark}"/>`,
};

// ---------- 配饰 ----------
// 每样东西画在哪一层：neck 在头后面、肩膀上面；beard 在嘴底下；face 在五官底下；lip 在嘴上面；top 最上面

// 花瓣、辫子这种几块拼成一样东西的，包成一组，勾线时只勾整体的外沿
const flower = (x, y, r, col, mid = '#f6d86b') =>
  `<g fill="${col}">${[0, 72, 144, 216, 288].map((a) => `<circle cx="${x}" cy="${y - r}" r="${r * 0.72}" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g>` +
  `<circle cx="${x}" cy="${y}" r="${r * 0.6}" fill="${mid}"/>`;
// 嘴上的胡子自己带一圈细一点的勾线（和别处一样粗的话像两片嘴唇）
const LIP = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"`;

const EXTRA = {
  blush: () => ['face', '<circle cx="12.5" cy="28.3" r="2.3" fill="#f0806a" opacity=".42"/><circle cx="27.5" cy="28.3" r="2.3" fill="#f0806a" opacity=".42"/>'],
  // 圆眼镜、方眼镜
  glasses: () => [
    'top',
    `<g fill="rgba(255,255,255,.32)" stroke="${INK}" stroke-width=".95"><circle cx="15.8" cy="24" r="3.4"/><circle cx="24.2" cy="24" r="3.4"/></g>` +
      line('M19.2 23.6h1.6M12.4 23.6L9 22.6M27.6 23.6L31 22.6', INK, 0.95) +
      line('M13.6 22.6l1.2-1M22 22.6l1.2-1', '#fff', 0.6),
  ],
  specs: () => [
    'top',
    `<g fill="rgba(255,255,255,.32)" stroke="${INK}" stroke-width="1"><rect x="12.3" y="21.2" width="6.6" height="5.6" rx="1.3"/><rect x="21.1" y="21.2" width="6.6" height="5.6" rx="1.3"/></g>` +
      line('M18.9 23.4h2.2M12.3 23.2L9 22.4M27.7 23.2L31 22.4', INK, 1) +
      line('M13.6 23.2l1.4-1.2M22.4 23.2l1.4-1.2', '#fff', 0.6),
  ],
  // 胡子都用头发的颜色
  stache: (l) => ['lip', `<path d="M20 27.6Q17.6 25.7 13.4 28.2Q17 29.8 20 28.5Q23 29.8 26.6 28.2Q22.4 25.7 20 27.6Z" fill="${l.hair}" ${LIP}/>`],
  walrus: (l) => [
    'lip',
    `<path d="M20 27.4Q16.4 25.3 12.4 27.9Q12.8 32.7 15.4 32.9Q17.2 29.9 20 28.9Q22.8 29.9 24.6 32.9Q27.2 32.7 27.6 27.9Q23.6 25.3 20 27.4Z" fill="${l.hair}" ${LIP}/>` +
      line('M20 27.6V28.8', dark(l.hair, 0.14), 0.5),
  ],
  beard: (l) => ['beard', `<path d="M8.6 26.4Q8.4 39 20 39Q31.6 39 31.4 26.4Q29.6 33.5 20 33.9Q10.4 33.5 8.6 26.4Z" fill="${l.hair}"/>`],
  longbeard: (l) => [
    'beard',
    `<path d="M8.6 26.4Q7.8 36 14 40L20 44L26 40Q32.2 36 31.4 26.4Q29.6 33.3 20 33.7Q10.4 33.3 8.6 26.4Z" fill="${l.hair}"/>` + line('M16.4 35.4V39M20 35V40M23.6 35.4V39', dark(l.hair, 0.13), 0.6),
  ],
  goatee: (l) => ['beard', `<path d="M16.2 33.3Q20 32 23.8 33.3Q23.4 38.8 20 41Q16.6 38.8 16.2 33.3Z" fill="${l.hair}"/>`],
  brows: (l) => ['top', line('M12.6 21.1q3-2.1 5.8-.5M27.4 21.1q-3-2.1-5.8-.5', l.hair, 1.7)],
  // 发髻底下扎的头绳
  tie: () => ['top', line('M16.4 12.5Q20 10.9 23.6 12.5', '#f6c453', 1.5)],
  // 发髻上横插的簪子、铅笔
  stick: () => ['top', `${line('M13 5.6L27 11', GOLD, 1.3)}<circle cx="12.6" cy="5.4" r="1.5" fill="${RED}"/><circle cx="12.2" cy="5" r=".5" fill="#fff" opacity=".6"/>`],
  pencil: () => ['top', line('M27.4 5.4L13.6 11.2', '#f2c14e', 1.7) + line('M27.4 5.4l-1.4.6', '#e8806a', 1.7) + line('M13.6 11.2l-1.5.7', INK, 1.4)],
  earrings: () => ['top', `<circle cx="8.7" cy="29.6" r="1.5" fill="${GOLD}"/><circle cx="31.3" cy="29.6" r="1.5" fill="${GOLD}"/>`],
  drops: () => ['top', `<path d="M8.7 28l1.2 2.2a1.3 1.3 0 1 1-2.4 0zM31.3 28l1.2 2.2a1.3 1.3 0 1 1-2.4 0z" fill="#8fd8ee"/>`],
  flowers: () => ['top', flower(28.8, 14.8, 3, '#f7a8c0') + flower(11.2, 13.4, 2.2, '#fff3d0', '#f2b84b')],
  plum: () => ['top', flower(27.2, 12.2, 2.7, '#d9483b')],
  rainbow: () => [
    'top',
    ['#e8604f', '#f2c14e', '#5fa8d8'].map((c, i) => line(`M${8.4 + i * 0.2} ${17.6 + i}Q20 ${9.6 + i} ${31.6 - i * 0.2} ${17.6 + i}`, c, 1.05)).join(''),
  ],
  // 两个发髻上的小蝴蝶结
  bows: () => ['top', [12.2, 27.8].map((x) => `<path d="M${x} 15.4l-2.3-1.6v3.2zM${x} 15.4l2.3-1.6v3.2z" fill="#fff3d0"/><circle cx="${x}" cy="15.4" r=".8" fill="#f2b84b"/>`).join('')],
  // 额头上扎的头巾，结打在一边
  bandana: () => ['top', `<path d="M31.6 19.4l5-2.8-.7 4.4zM31.8 20.4l4.2 3.6-4-.2z" fill="${dark(RED, 0.15)}"/>${line('M7.9 20.7Q20 15.6 32.1 20.7', RED, 2.9)}`],
  // 脸上贴的创可贴
  plaster: () => ['top', `<g transform="rotate(-24 27.8 28.2)"><rect x="25.6" y="27.3" width="4.4" height="1.9" rx=".9" fill="#fff6e4" stroke="${dark(C.skin, 0.3)}" stroke-width=".35"/><path d="M27.3 27.4v1.7M28.3 27.4v1.7" stroke="${dark(C.skin, 0.3)}" stroke-width=".35"/></g>`],
  kerchief: () => ['neck', `<path d="M11.4 33.6Q20 38.4 28.6 33.6L20 42.5Z" fill="${RED}"/>`],
  bowtie: () => ['neck', `<path d="M20 38l-5.4-2.9v5.8zM20 38l5.4-2.9v5.8z" fill="${RED}"/><circle cx="20" cy="38" r="1.2" fill="${dark(RED, 0.2)}"/>`],
  // 推在额头上的泳镜
  goggles: (l) => [
    'top',
    line('M8.1 19.6Q20 13 31.9 19.6', dark(l.hair, 0.2), 1.5) +
      `<g fill="#c4ecf4" stroke="#f2b84b" stroke-width="1.1"><ellipse cx="15.5" cy="16.7" rx="3.6" ry="2.7"/><ellipse cx="24.5" cy="16.7" rx="3.6" ry="2.7"/></g>` +
      line('M13.8 16.4l1.6-1.2M22.8 16.4l1.6-1.2', '#fff', 0.7),
  ],
  // 推在头顶的墨镜
  shades: () => [
    'top',
    // 镜框是白的：深色镜片压在深色头发上会糊成一块
    `<g fill="#3d4663" stroke="#fff8ea" stroke-width="1.2"><rect x="11" y="12.2" width="7.8" height="5" rx="2.3"/><rect x="21.2" y="12.2" width="7.8" height="5" rx="2.3"/></g>` +
      line('M18.8 14.2h2.4', '#fff8ea', 1.1) +
      `<path d="M12.8 14.6l2.2-1.4M23 14.6l2.2-1.4" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".75"/>`,
  ],
  // 夹在耳朵上的东西：木匠的铅笔、画画的笔、写诗的羽毛
  earpencil: () => ['top', line('M31.4 16.2L33.7 25', '#f2c14e', 1.8) + line('M31.2 15.4l.3 1.2', INK, 1.8)],
  earbrush: () => ['top', line('M31.6 17.4L33.6 25.4', '#a8794f', 1.5) + line('M31.2 15.2l.4 2', '#5fa8d8', 2)],
  quill: () => ['top', `<path d="M9.6 22.4Q3.6 15.6 6.4 8.4Q11.6 13.4 10.6 22Z" fill="#fff"/>${line('M9.9 23.6L6.9 10.6', dark('#ffffff', 0.25), 0.6)}`],
  // 嘴里叼的麦秆
  stalk: () => ['top', `${line('M23 31.2L32 27.4', '#c9a550', 1.1)}<ellipse cx="33" cy="26.9" rx="2.1" ry="1.1" transform="rotate(-22 33 26.9)" fill="#e3c063"/>`],
  // 头顶冒出来的小芽
  sprout: () => [
    'top',
    line('M20 11.6Q19.4 8.4 20.4 6.2', '#5f9f4f', 1.3) +
      `<ellipse cx="17.4" cy="5.6" rx="3" ry="1.6" transform="rotate(-24 17.4 5.6)" fill="${LEAF}"/><ellipse cx="23.2" cy="5" rx="3" ry="1.6" transform="rotate(22 23.2 5)" fill="#93d478"/>`,
  ],
  // 发髻上的两片叶子
  leaves: () => ['top', `<ellipse cx="16.6" cy="4.8" rx="3.2" ry="1.7" transform="rotate(-30 16.6 4.8)" fill="${LEAF}"/><ellipse cx="23.4" cy="4.6" rx="3.2" ry="1.7" transform="rotate(28 23.4 4.6)" fill="#a3e088"/>`],
  // 草帽上别的果子
  apple: () => ['top', `<circle cx="26.4" cy="8.4" r="2.7" fill="#d9483b"/><circle cx="25.6" cy="7.6" r=".8" fill="#fff" opacity=".5"/><ellipse cx="27.9" cy="5.3" rx="1.9" ry="1" transform="rotate(-35 27.9 5.3)" fill="${LEAF}"/>`],
  // 草帽带子上打的蝴蝶结
  ribbon: (l) => ['top', `<path d="M27.6 12.8l-4.2-2.6v5zM27.6 12.8l4-2.2-.4 4.8z" fill="${dark(l.tint || RED, 0.12)}"/><circle cx="27.6" cy="12.8" r="1" fill="${dark(l.tint || RED, 0.3)}"/>`],
  // 帽徽：守灯塔的是金色圆徽，送信的是一只信封
  badge: () => ['top', `<circle cx="20" cy="13.4" r="2.1" fill="${GOLD}"/><circle cx="20" cy="13.4" r="1" fill="${dark(GOLD, 0.2)}"/>`],
  letter: () => ['top', `<rect x="17.2" y="11.6" width="5.6" height="3.8" rx=".5" fill="#fff8ea"/>${line('M17.4 11.9l2.6 2 2.6-2', '#c9a550', 0.6)}`],
  // 贝雷帽上别的音符
  note: () => ['top', `<ellipse cx="12.6" cy="13.6" rx="1.5" ry="1.1" transform="rotate(-20 12.6 13.6)" fill="#fff8ea"/>${line('M13.9 13.2V8.8l2.2.8', '#fff8ea', 0.8)}`],
  // 两条垂到肩上的辫子
  braids: (l) => [
    'top',
    [8.4, 31.6]
      .map(
        (x) =>
          `<g fill="${l.hair}">${[27.6, 31, 34.4].map((y) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="2.3"/>`).join('')}</g>` +
          line(`M${x - 1.6} 29.3h3.2M${x - 1.6} 32.7h3.2`, dark(l.hair, 0.2), 0.5) +
          `<circle cx="${x}" cy="36.9" r="1.5" fill="${RED}"/>`,
      )
      .join(''),
  ],
  // 脸上蹭到的颜料
  paint: () => ['top', `<circle cx="27.6" cy="28.6" r="1.5" fill="#5fa8d8"/><circle cx="12.8" cy="27" r="1.1" fill="#f2c14e"/>`],
};

// ---------- 每个人的样子 ----------
// hair：没戴帽子的人的发型（戴帽子的只露两鬓）；fr：刘海；back：头后面的头发；x：配饰
const WHO = {
  tang: { hair: 'bun', fr: 'part', x: ['tie'] },
  mo: { x: ['stache'] },
  chen: { hair: 'tuft', x: ['blush'] },
  gui: { hair: 'bun', fr: 'centre', x: ['stick', 'earrings'] },
  tie: { x: ['beard', 'brows'] },
  xing: {},
  chao: { x: ['kerchief'] },
  nao: { hair: 'spiky', x: ['bandana', 'plaster'] },
  song: { hair: 'bald', back: 'ring', x: ['brows', 'stache'] },
  he: { back: 'bob', x: ['earbrush'] },
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
  yin: { hair: 'crop', fr: 'sweep', back: 'long', x: ['quill'] },
  fu: { x: ['stache', 'blush'] },
  di: { back: 'long', x: ['note'] },
  deng: { x: ['beard', 'badge'] },
  cai: { back: 'pony', x: ['paint'] },
  qi: { hair: 'crop', fr: 'part', x: ['specs', 'bowtie'] },
  hong: { hair: 'bun', fr: 'part', x: ['rainbow'] },
  lan: { x: ['walrus'] },
  mei: { hair: 'bun', x: ['plum', 'earrings'] },
  zi: { hair: 'crop', fr: 'bowl', back: 'tails', bow: '#d6b4f5' },
  wan: { hair: 'knot', back: 'ring', x: ['longbeard', 'brows'] },
  xin: { x: ['letter'] },
  qiao: { x: ['braids', 'ribbon'] },
  guo: { back: 'bob', x: ['apple', 'blush'] },
  juan: { hair: 'bun', x: ['pencil', 'specs'] },
  wang: { hair: 'buns', x: ['bows', 'blush'] },
  lu: { hair: 'crop', back: 'bob', x: ['shades'] },
  ting: { back: 'long', x: ['drops'] },
  zhong: { x: ['goatee', 'glasses'] },
};

// ---------- 勾线 ----------

// 把一串图形拆成最外层的一个个元素（除了 <g>…</g>，别的都是自己收尾的单个标签）
function pieces(svg) {
  const out = [];
  let i = 0;
  while (i < svg.length) {
    let end;
    if (svg.startsWith('<g', i)) {
      let depth = 1;
      end = i + 2;
      while (depth) {
        const open = svg.indexOf('<g', end);
        const close = svg.indexOf('</g>', end);
        if (open !== -1 && open < close) {
          depth++;
          end = open + 2;
        } else {
          depth--;
          end = close + 4;
        }
      }
    } else end = svg.indexOf('>', i) + 1;
    out.push(svg.slice(i, end));
    i = end;
  }
  return out;
}

const attr = (tag, name) => (new RegExp(` ${name}="([^"]+)"`).exec(tag) || [])[1];
const EDGE = ` stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"`;

// 给每一块实心的颜色垫一个加粗的深色底，露出来的那一圈就是勾线；当成形状用的粗线也一样垫一条。
// 不勾的：半透明的影子和腮红、自己已经带边的（眼镜、泳镜、嘴上的胡子）、很小的圆点、细的装饰线。
function outline(svg) {
  return pieces(svg)
    .map((el) => {
      const tag = el.slice(0, el.indexOf('>') + 1);
      const fill = attr(tag, 'fill');
      const stroke = attr(tag, 'stroke');
      if (fill === 'none') {
        const w = attr(tag, 'stroke-width');
        if (!stroke || stroke === INK || stroke.startsWith('rgba') || !(+w >= 1.2)) return el;
        return el.replace(`stroke="${stroke}"`, `stroke="${INK}"`).replace(`stroke-width="${w}"`, `stroke-width="${+w + 2}"`) + el;
      }
      if (!fill || fill.startsWith('rgba') || stroke || attr(tag, 'opacity')) return el;
      if (el.startsWith('<circle') && +attr(tag, 'r') < 1.2) return el;
      const at = tag.length - (el.startsWith('<g') ? 1 : 2);
      return el.slice(0, at) + EDGE + el.slice(at) + el;
    })
    .join('');
}

// 一张头像。look：wishes.js 里这位居民的样子（衣服、头发的颜色，帽子）；mood：0 到 3 是四档评价
export function avatar(id, look, mood = 1) {
  const s = WHO[id] || { hair: 'crop' };
  const h = look.hair;
  const x = s.x || [];
  const layer = { neck: '', beard: '', face: '', lip: '', top: '' };
  for (const name of x) {
    const [where, svg] = EXTRA[name](look);
    layer[where] += svg;
  }
  return (
    `<svg viewBox="0 0 40 40">` +
    outline(
      (s.back ? BACK[s.back](h, s) : '') +
      // 肩膀、衣领、下巴底下的影子
      `<path d="M2 41Q3.4 31 20 31Q36.6 31 38 41Z" fill="rgba(60,36,28,.17)"/>` +
      line('M2 41Q3.4 31 20 31Q36.6 31 38 41', INK, 1.3) +
      line('M13.6 33.4Q20 40.6 26.4 33.4', 'rgba(255,255,255,.34)', 1.2) +
      `<ellipse cx="20" cy="36.2" rx="7.4" ry="1.7" fill="rgba(60,36,28,.16)"/>` +
      layer.neck +
      `<circle cx="8.7" cy="25.6" r="2.1" fill="${dark(C.skin, 0.07)}"/><circle cx="31.3" cy="25.6" r="2.1" fill="${dark(C.skin, 0.07)}"/>` +
      `<circle cx="20" cy="24.5" r="11.5" fill="${C.skin}"/>` +
      layer.beard +
      layer.face +
      line('M19.2 26.1q.8.9 1.6 0', dark(C.skin, 0.24), 0.7) +
      face(mood, x.includes('stache') || x.includes('walrus') ? 1.8 : 0) +
      layer.lip +
      (look.hat ? HAIR.sides(h) + HAT[look.hat](look) : HAIR[s.hair || 'crop'](h, s)) +
      layer.top,
    ) +
    `</svg>`
  );
}
