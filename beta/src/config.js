// 全局常量、色板和模块定义。逻辑和渲染都从这里取值。

export const SIZE = 20; // 整张地图的边长（格），小岛一开始只占中间一块
export const MAX_LEVEL = 5; // 最高层数
export const H = 0.62; // 每层高度
export const BODY = 0.84; // 房间主体宽度
export const HALF = BODY / 2;
export const DAY_LENGTH = 240; // 一昼夜的秒数
// 版本：每次发布到线上时改成当天的日期。显示在"制作与鸣谢"里，也随玩家的反馈一起寄出
export const VERSION = '2026-11-24';
export const AUTHOR = 'ovob'; // 作者署名，显示在"制作与鸣谢"最上面

// 方向：0 北(-z) 1 东(+x) 2 南(+z) 3 西(-x)
export const DIRS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
export const opp = (d) => (d + 2) % 4;
// 让模型的 +z 正面朝向方向 d 所需的 Y 轴旋转
export const DIR_RY = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export function hash(...n) {
  let h = 2166136261;
  for (const v of n) {
    h ^= (v + 0x9e3779b9) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return (h ^ (h >>> 13)) >>> 0;
}
export const rand01 = (...n) => hash(...n) / 4294967296;

export const C = {
  sea: '#84cfdd',
  grassA: '#b7d68c',
  grassB: '#abcd82',
  soil: '#c7a678',
  sand: '#f0dfb2',
  rock: '#b9b3a8',

  walls: ['#f7e8d0', '#f4dcc4', '#f1e3c6', '#f8e4d8', '#ece0c8'],
  wallShade: '#e3d0b2',
  trim: '#dcc6a4',
  frame: '#fff7e8',
  door: '#8f5f48',
  doorShop: '#5f8f8a',
  shutter: '#7fb0a8',
  wood: '#bb8d62',
  woodLight: '#d2a878',
  woodDark: '#8c6446',
  stone: '#d6cfc2',
  stoneDark: '#aca598',
  metal: '#5f5c68',
  terracotta: '#cf7a58',

  roofs: ['#dc7860', '#d26e58', '#c66452', '#7fa9a2', '#6f9c9c'],
  flatTop: '#e9dcc2',
  towerStone: '#ddd7cb',
  towerRoof: '#6f8fb2',
  shopWall: '#f6d9b8',
  awningA: '#e8755f',
  awningB: '#fff4e2',
  brick: '#cd9272',
  brickDark: '#a9725a',

  road: '#e8dabc',
  roadStone: '#f3e9d0',
  gardenBed: '#96c67c',
  gardenEdge: '#dccda6',
  stem: '#6fa35f',
  leafA: '#84bd72',
  leafB: '#6fab66',
  leafC: '#97c980',
  pineA: '#62a070',
  pineB: '#71ad7b',
  trunk: '#9c7150',
  flowers: ['#f39aa3', '#f8d36e', '#ffffff', '#c9a2ea', '#f59170'],
  water: '#8fd3e0',

  glassDay: '#a6cde0',
  glassNight: '#ffd27c',
  skin: '#f6d2b4',
  straw: '#ecd28c',
  sandA: '#f3e3b4',
  sandB: '#ecd9a6',
  foam: '#fffdf4',
  fieldSoil: '#b98f66',
  fieldRow: '#a57c56',
  crop: '#8fc46a',
  cropB: '#e9a23f',
  wheat: '#ecc86a',
  sail: '#fbf3e2',
  millWall: '#f3e6cf',
  millRoof: '#b9705a',
  lightWhite: '#faf4ea',
  lightRed: '#e0705c',
  glassPane: '#bfe6e2',
  canopyA: '#6fa9c9',
  canopyB: '#fff4e2',
  pavRoof: '#5f9c93',
  drop: '#d9f3f7',
  dust: '#f1e6d0',
  smoke: '#f6f3ec',
  spark: '#ffe08a',
};

// 模块的名字和说明都在 lang/ 的文字表里（name.<id>、desc.<id>、tab.<id>）
export const TABS = [{ id: 'build' }, { id: 'ground' }];

// tab：在工具栏的哪一页；rot：摆放时 R 键是否有意义；paint：是否支持按住拖动连续摆放
// 数字键 1-9 对应当前这一页里从左到右的模块
export const MODULES = [
  { id: 'room', tab: 'build' },
  { id: 'balcony', tab: 'build', rot: true },
  { id: 'tower', tab: 'build' },
  { id: 'shop', tab: 'build', rot: true },
  { id: 'workshop', tab: 'build', rot: true },
  { id: 'windmill', tab: 'build', rot: true },
  { id: 'greenhouse', tab: 'build', rot: true },
  { id: 'market', tab: 'build', rot: true },
  { id: 'lighthouse', tab: 'build' },
  { id: 'road', tab: 'ground', paint: true },
  { id: 'garden', tab: 'ground', paint: true },
  { id: 'tree', tab: 'ground', paint: true },
  { id: 'lamp', tab: 'ground' },
  { id: 'dock', tab: 'ground' },
  { id: 'well', tab: 'ground' },
  { id: 'field', tab: 'ground', paint: true },
  { id: 'pavilion', tab: 'ground' },
  { id: 'fountain', tab: 'ground' },
];
for (const tab of TABS) MODULES.filter((m) => m.tab === tab.id).forEach((m, i) => (m.key = String(i + 1)));
