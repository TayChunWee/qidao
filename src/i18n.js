// 多语言。界面上的文字都不直接写在代码里，而是用 t('键', 参数…) 到当前语言的文字表里取。
// 文字表在 lang/ 下，一种语言一个文件；表里的值要么是一句话，要么是一个拼句子的函数。
// 所有文字都在用到的那一刻才取，所以换语言不需要刷新页面。
import zh from './lang/zh.js';
import en from './lang/en.js';
import ja from './lang/ja.js';

// name：这种语言对自己的称呼，语言选单里就这么写；tag：写进网页 lang 属性的代号（字体按它来选）
export const LANGS = [
  { id: 'zh', name: '中文', tag: 'zh-CN' },
  { id: 'en', name: 'English', tag: 'en' },
  { id: 'ja', name: '日本語', tag: 'ja' },
];
const DICT = { zh, en, ja };

// 没选过语言时，按浏览器的语言偏好挑；三种都不是就用英文
function detect() {
  const prefs = typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language];
  for (const p of prefs) {
    const id = String(p).toLowerCase().slice(0, 2);
    if (DICT[id]) return id;
  }
  return 'en';
}

let cur = detect();

export const getLang = () => cur;

export function setLang(id) {
  if (DICT[id]) cur = id;
  if (typeof document !== 'undefined') document.documentElement.lang = LANGS.find((l) => l.id === cur).tag;
  return cur;
}

// 取一句文字。当前语言里没有的键退回中文，中文里也没有就原样返回键名（方便发现漏翻的）
export function t(key, ...args) {
  let v = DICT[cur][key];
  if (v === undefined) v = zh[key];
  if (typeof v === 'function') return v(...args);
  return v === undefined ? key : v;
}

// 模块的说明。有几句提到了键盘鼠标的，另有一份给触屏用的写法（键名后面带 .touch）
// 粉刷的十二样工具（wall0…roof5）共用两条文字，颜色当参数传进去
const BRUSH = /^(wall|roof)(\d)$/;

export function descOf(id, touch) {
  const m = BRUSH.exec(id);
  const base = m ? `desc.${m[1]}Paint` : `desc.${id}`;
  const key = `${base}.touch`;
  const use = touch && (DICT[cur][key] !== undefined || zh[key] !== undefined) ? key : base;
  return m ? t(use, Number(m[2])) : t(use);
}

// 模块的名字
export const nameOf = (id) => {
  const m = BRUSH.exec(id);
  return m ? t(`name.${m[1]}Paint`, Number(m[2])) : t(`name.${id}`);
};
