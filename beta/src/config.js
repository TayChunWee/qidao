// 全局常量、色板和模块定义。逻辑和渲染都从这里取值。

export const SIZE = 20; // 整张地图的边长（格），小岛一开始只占中间一块
export const MAX_LEVEL = 5; // 最高层数
export const H = 0.62; // 每层高度
export const BODY = 0.84; // 房间主体宽度
export const HALF = BODY / 2;
export const DAY_LENGTH = 600; // 一昼夜的秒数（十分钟）
export const SEASON_DAYS = 3; // 一个季节几天。季节：0 春 1 夏 2 秋 3 冬
// 版本：每次发布到线上时改成当天的日期。显示在"制作与鸣谢"里，也随玩家的反馈一起寄出
export const VERSION = '2026-11-27';
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
  snow: '#f7fafc',
  snowShade: '#dfe8f0',
  ice: '#d3e7f0',
  tuft: '#97c574', // 草地上的小草丛

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
  // 粉刷的六种颜色：白、红、黄、绿、蓝、紫。墙用浅的一套，屋顶用深的一套。
  // 白墙实际用上面 walls 里那几种深浅不一的米白，红顶用 roofs 里的前三种红
  wallPaint: ['#f7e8d0', '#f0b6aa', '#f6dc98', '#cbe0b2', '#c0d8e8', '#dbcae8'],
  roofPaint: ['#efe8d8', '#dc7860', '#e2b25c', '#8fb46e', '#78a6ae', '#a58cc4'],
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
  treeTop: '#97c980', // 阔叶树最顶上那一团：春天开花，秋天变黄
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

// 每个季节要换掉的颜色，没写的沿用 C 里原本的。夏天就是 C 原本的样子。
// 冬天这里只管把草和树叶换成挂霜的浅色；屋顶和树上的积雪在 models.js 里另画
export const SEASON_COLORS = [
  { grassA: '#c0de92', grassB: '#b4d688', leafA: '#9ad086', leafB: '#86c47a', treeTop: '#f5bccb', gardenBed: '#a2d088', crop: '#a6d47c', tuft: '#a3d27e' },
  {},
  { grassA: '#d0cf8a', grassB: '#c6c580', leafA: '#e3a04c', leafB: '#d0703e', leafC: '#c9c070', treeTop: '#eec65c', pineA: '#5c9468', pineB: '#6aa173', gardenBed: '#aebf7a', crop: '#c2b862', tuft: '#c4b266' },
  { grassA: '#e4ece0', grassB: '#dae4d6', leafA: '#e2ebe6', leafB: '#d0ded8', leafC: '#cfdcc8', treeTop: '#f3f7f5', pineA: '#7ba58e', pineB: '#9bbfaa', gardenBed: '#cbd8c4', crop: '#b9c6aa', tuft: '#b9b08a' },
];
// 各个季节的光：阳光和天光各乘上这个颜色，最后一个数是亮度的倍数。秋天偏金，冬天偏冷、暗一点
export const SEASON_LIGHT = [
  [1, 1, 0.98, 1],
  [1.02, 1, 0.96, 1.04],
  [1.05, 0.96, 0.86, 0.98],
  [0.93, 0.97, 1.06, 0.93],
];

// 粉刷的颜色编号：0 白 1 红 2 黄 3 绿 4 蓝 5 紫。新盖的房间是白墙、红顶
export const PAINTS = [0, 1, 2, 3, 4, 5];
export const WALL_DEFAULT = 0;
export const ROOF_DEFAULT = 1;

// 模块的名字和说明都在 lang/ 的文字表里（name.<id>、desc.<id>、tab.<id>）
export const TABS = [{ id: 'build' }, { id: 'ground' }, { id: 'paint' }];

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
  // 粉刷：六种墙色、六种顶色，各算一样工具，点哪栋刷哪栋。brush：刷墙还是刷屋顶；color：第几种颜色
  ...PAINTS.map((c) => ({ id: `wall${c}`, tab: 'paint', paint: true, brush: 'wall', color: c })),
  ...PAINTS.map((c) => ({ id: `roof${c}`, tab: 'paint', paint: true, brush: 'roof', color: c })),
];
// 一页里排在第十个以后的没有数字键
for (const tab of TABS) MODULES.filter((m) => m.tab === tab.id).forEach((m, i) => (m.key = i < 9 ? String(i + 1) : ''));
