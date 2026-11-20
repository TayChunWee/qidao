// 全局常量、色板和模块定义。逻辑和渲染都从这里取值。

export const SIZE = 20; // 整张地图的边长（格），小岛一开始只占中间一块
export const MAX_LEVEL = 5; // 最高层数
export const H = 0.62; // 每层高度
export const BODY = 0.84; // 房间主体宽度
export const HALF = BODY / 2;
export const DAY_LENGTH = 240; // 一昼夜的秒数

// 方向：0 北(-z) 1 东(+x) 2 南(+z) 3 西(-x)
export const DIRS = [
  { x: 0, z: -1, name: '北' },
  { x: 1, z: 0, name: '东' },
  { x: 0, z: 1, name: '南' },
  { x: -1, z: 0, name: '西' },
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

export const NAMES = {
  room: '房间',
  balcony: '阳台',
  road: '路',
  garden: '花园',
  tree: '树',
  shop: '小店',
  workshop: '工坊',
  tower: '塔楼',
  lamp: '灯柱',
  dock: '码头',
  well: '水井',
  field: '菜地',
  fountain: '喷泉',
  pavilion: '凉亭',
  market: '集市',
  greenhouse: '温室',
  windmill: '风车',
  lighthouse: '灯塔',
};

export const TABS = [
  { id: 'build', name: '建筑' },
  { id: 'ground', name: '地面' },
];

// tab：在工具栏的哪一页；rot：摆放时 R 键是否有意义；paint：是否支持按住拖动连续摆放
// 数字键 1-9 对应当前这一页里从左到右的模块
export const MODULES = [
  { id: 'room', tab: 'build', desc: '可以一层层叠高。挨着的房间会自己连通。' },
  { id: 'balcony', tab: 'build', rot: true, desc: '装在二层以上房间的外墙上。按 R 换朝向。' },
  { id: 'tower', tab: 'build', desc: '石砌的塔楼，可以叠高，顶上有尖顶。' },
  { id: 'shop', tab: 'build', rot: true, desc: '只能开在底层，楼上可以住人。热闹，但有点吵。' },
  { id: 'workshop', tab: 'build', rot: true, desc: '只能开在底层，楼上可以住人。烟囱会跟着楼一起长高。' },
  { id: 'windmill', tab: 'build', rot: true, desc: '独立的一座，上面不能再盖。叶片会慢慢转。' },
  { id: 'greenhouse', tab: 'build', rot: true, desc: '独立的玻璃房，上面不能再盖。夜里会透出暖光。' },
  { id: 'market', tab: 'build', rot: true, desc: '露天的集市摊位，上面不能再盖。热闹，也有点吵。' },
  { id: 'lighthouse', tab: 'build', desc: '要建在水边。很高，夜里会亮起来。' },
  { id: 'road', tab: 'ground', paint: true, desc: '按住拖动可以连续铺。门会朝着路开。' },
  { id: 'garden', tab: 'ground', paint: true, desc: '一小片花圃。有人很喜欢它。' },
  { id: 'tree', tab: 'ground', paint: true, desc: '会随风轻轻摇。' },
  { id: 'lamp', tab: 'ground', desc: '天黑以后会亮起来。' },
  { id: 'dock', tab: 'ground', desc: '只能建在紧挨陆地的水面上。' },
  { id: 'well', tab: 'ground', desc: '一口石头水井。' },
  { id: 'field', tab: 'ground', paint: true, desc: '按住拖动可以连续开垦。' },
  { id: 'pavilion', tab: 'ground', desc: '可以走进去歇脚的小亭子。' },
  { id: 'fountain', tab: 'ground', desc: '哗哗的水声，很多人喜欢。' },
];
for (const tab of TABS) MODULES.filter((m) => m.tab === tab.id).forEach((m, i) => (m.key = String(i + 1)));
