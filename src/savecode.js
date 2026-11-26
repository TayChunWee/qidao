// 把存档变成一段只有字母和数字的文字：方便复制、发给自己，换手机或清了缓存后再贴回来。
// 做法：存档写成 JSON（连着的空地只记个数）→ LZW 压缩 → 每 6 位写成一个字符 → 末尾三位校验。
// 不用浏览器自带的压缩接口，老一些的手机内置浏览器里没有。不依赖游戏里别的代码。

const HEAD = 'QD1'; // 开头的记号，末尾的数字是这种写法的版本
// 61 个字符各表示一个数；z 留作转义：z0 z1 z2 表示 61 62 63。这样整段文字里只有字母和数字，
// 聊天软件不会把它当成格式符号吃掉，双击也能整段选中
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxy';
const MAX_CODE = 120000; // 再长的文字不去解：正常的存档只有几千个字符
const MAX_TEXT = 400000;
const MAX_CELLS = 10000;

const bad = () => {
  throw new Error('bad');
};
const digit = (v) => (v < 61 ? DIGITS[v] : 'z' + DIGITS[v - 61]);
const widthFor = (size) => 32 - Math.clz32(size - 1); // 词典里有 size 个词时，一个编号要几位

function compress(text) {
  const dict = new Map();
  let next = 128;
  let w = '';
  let acc = 0;
  let bits = 0;
  let out = '';
  const put = (s) => {
    const width = widthFor(next);
    acc = (acc << width) | (s.length === 1 ? s.charCodeAt(0) : dict.get(s));
    bits += width;
    while (bits >= 6) {
      bits -= 6;
      out += digit((acc >> bits) & 63);
    }
    acc &= (1 << bits) - 1;
  };
  for (let i = 0; i < text.length; i++) {
    const wc = w + text[i];
    if (wc.length === 1 || dict.has(wc)) {
      w = wc;
      continue;
    }
    put(w);
    dict.set(wc, next++);
    w = text[i];
  }
  if (w) put(w);
  if (bits) out += digit((acc << (6 - bits)) & 63);
  return out;
}

function expand(code) {
  const table = []; // 编号 128 起的词
  let acc = 0;
  let bits = 0;
  let prev = '';
  let count = 0; // 已经读出几个编号。写的那一边每写一个编号就多记一个词，所以位数能跟着算出来
  let out = '';
  for (let i = 0; i < code.length; i++) {
    let v = DIGITS.indexOf(code[i]);
    if (code[i] === 'z') {
      v = DIGITS.indexOf(code[++i]);
      if (v < 0 || v > 2) bad();
      v += 61;
    } else if (v < 0) bad();
    acc = (acc << 6) | v;
    bits += 6;
    const width = widthFor(128 + count);
    if (bits < width) continue;
    bits -= width;
    const n = (acc >> bits) & ((1 << width) - 1);
    acc &= (1 << bits) - 1;
    let word;
    if (n < 128) word = String.fromCharCode(n);
    else if (n - 128 < table.length) word = table[n - 128];
    else if (count && n - 128 === table.length) word = prev + prev[0];
    else bad();
    if (count) table.push(prev + word[0]);
    out += word;
    if (out.length > MAX_TEXT) bad();
    prev = word;
    count++;
  }
  return out;
}

function checksum(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return DIGITS[h % 61] + DIGITS[Math.floor(h / 61) % 61] + DIGITS[Math.floor(h / 3721) % 61];
}

// save：game.js 里存进浏览器的那个对象（world 是一串 JSON）
export function encodeSave(save) {
  const cells = [];
  let run = 0;
  const flush = () => {
    if (run) cells.push(run === 1 ? 0 : -run);
    run = 0;
  };
  for (const c of JSON.parse(save.world)) {
    if (c === 0) run++;
    else {
      flush();
      cells.push(c);
    }
  }
  flush();
  const json = JSON.stringify({ v: save.v, w: cells, l: save.level, t: Math.round(save.t * 1000) / 1000, r: save.roster, d: save.done ? 1 : 0 });
  const ascii = json.replace(/[\u0080-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  const body = compress(ascii);
  return HEAD + body + checksum(body);
}

// 从一段文字里找出存档并还原成 save 的样子；认不出来、缺了一截或被改过，都抛出错误。
// 还原出来的内容没有核对过是否合理，用之前由 game.js 再查一遍
export function decodeSave(text) {
  const raw = String(text);
  if (raw.length > MAX_CODE) bad();
  const find = (s) => s.match(/QD1[0-9A-Za-z]{8,}/g) || [];
  // 聊天软件里长文字会被折行，所以先把空白都去掉再找；找不到对得上校验的，再按原样找一次
  const tries = [...find(raw.replace(/[\s​-‍﻿]/g, '')), ...find(raw)];
  const code = tries.find((s) => checksum(s.slice(3, -3)) === s.slice(-3));
  if (!code) bad();
  const data = JSON.parse(expand(code.slice(3, -3)));
  if (!data || !Array.isArray(data.w)) bad();
  const cells = [];
  for (const c of data.w) {
    if (typeof c === 'number') {
      const n = c === 0 ? 1 : -c;
      if (!Number.isInteger(n) || n < 1 || cells.length + n > MAX_CELLS) bad();
      for (let i = 0; i < n; i++) cells.push(0);
    } else cells.push(c);
    if (cells.length > MAX_CELLS) bad();
  }
  return { v: data.v, world: JSON.stringify(cells), level: data.l, t: data.t, roster: data.r, done: !!data.d };
}
