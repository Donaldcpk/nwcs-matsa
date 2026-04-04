/**
 * 一次性／可重跑：Map65 無限之塔事件、Map20 五層獎勵、共用事件 99 傳送
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const defaultPage = (extra = {}) => ({
  conditions: {
    actorId: 1,
    actorValid: false,
    itemId: 1,
    itemValid: false,
    selfSwitchCh: 'A',
    selfSwitchValid: false,
    switch1Id: 1,
    switch1Valid: false,
    switch2Id: 1,
    switch2Valid: false,
    variableId: 1,
    variableValid: false,
    variableValue: 0,
  },
  directionFix: false,
  image: {
    characterIndex: 0,
    characterName: 'People1',
    direction: 2,
    pattern: 0,
    tileId: 0,
  },
  list: [{ code: 0, indent: 0, parameters: [] }],
  moveFrequency: 3,
  moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
  moveSpeed: 3,
  moveType: 0,
  priorityType: 1,
  stepAnime: false,
  through: false,
  trigger: 0,
  walkAnime: true,
  ...extra,
});

function patchMap65() {
  const p = path.join(ROOT, 'data', 'Map065.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  m.displayName = '無限之塔';

  const ev1 = m.events[1];
  if (ev1) {
    ev1.x = 1;
    ev1.y = 1;
    ev1.name = '召喚水晶（裝飾）';
    ev1.note = '<Tower:crystal>';
    ev1.pages = [
      {
        conditions: ev1.pages[0].conditions,
        directionFix: true,
        image: { tileId: 0, characterName: '!Crystal', direction: 6, pattern: 1, characterIndex: 3 },
        list: [
          { code: 101, indent: 0, parameters: ['', 0, 0, 2, '水晶'] },
          {
            code: 401,
            indent: 0,
            parameters: ['無限之塔的召喚水晶。此處僅作為劇情／氛圍用，無需互動亦可。'],
          },
          { code: 0, indent: 0, parameters: [] },
        ],
        moveFrequency: 3,
        moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
        moveSpeed: 3,
        moveType: 0,
        priorityType: 0,
        stepAnime: true,
        through: true,
        trigger: 0,
        walkAnime: true,
      },
    ];
  }

  const ev24 = m.events[24];
  if (ev24) {
    ev24.name = '下一層（樓層+1）';
    ev24.note = '<Tower:nextFloor>';
    ev24.pages = [
      defaultPage({
        directionFix: true,
        image: { tileId: 0, characterName: '!Flame', direction: 2, pattern: 1, characterIndex: 0 },
        priorityType: 1,
        list: [
          { code: 111, indent: 0, parameters: [1, 1, 0, 100, 3] },
          { code: 101, indent: 1, parameters: ['', 0, 0, 2, ''] },
          { code: 401, indent: 1, parameters: ['已達第 100 層，無法再往下一層。'] },
          { code: 0, indent: 1, parameters: [] },
          { code: 411, indent: 0, parameters: [] },
          { code: 122, indent: 1, parameters: [1, 1, 1, 0, 1] },
          { code: 101, indent: 1, parameters: ['', 0, 0, 2, ''] },
          { code: 401, indent: 1, parameters: ['已切換至「下一層」目標：第 \\V[1] 層（請至中央挑戰敵人）。'] },
          { code: 0, indent: 1, parameters: [] },
        ],
      }),
    ];
  }

  const ev25 = m.events[25];
  if (ev25) {
    ev25.name = '塔層敵人（隨變數1）';
    ev25.note = '<LFS:enemy><Tower:battle>';
    ev25.pages = [
      defaultPage({
        directionFix: false,
        image: { tileId: 0, characterName: 'SF_Monster', direction: 2, pattern: 1, characterIndex: 5 },
        list: [
          { code: 101, indent: 0, parameters: ['', 0, 0, 2, '無限之塔'] },
          {
            code: 401,
            indent: 0,
            parameters: ['目前將挑戰：第 \\V[1] 層。準備好了嗎？'],
          },
          { code: 117, indent: 0, parameters: [99] },
          { code: 0, indent: 0, parameters: [] },
        ],
      }),
    ];
  }

  m.events[26] = {
    id: 38,
    name: '上一層（樓層-1）',
    note: '<Tower:prevFloor>',
    pages: [
      defaultPage({
        directionFix: true,
        image: { tileId: 0, characterName: '!Flame', direction: 2, pattern: 1, characterIndex: 0 },
        list: [
          { code: 111, indent: 0, parameters: [1, 1, 0, 1, 2] },
          { code: 101, indent: 1, parameters: ['', 0, 0, 2, ''] },
          { code: 401, indent: 1, parameters: ['已經是最底層（第 1 層），無法再往上。'] },
          { code: 0, indent: 1, parameters: [] },
          { code: 411, indent: 0, parameters: [] },
          { code: 122, indent: 1, parameters: [1, 1, 2, 0, 1] },
          { code: 101, indent: 1, parameters: ['', 0, 0, 2, ''] },
          { code: 401, indent: 1, parameters: ['已切換至「上一層」目標：第 \\V[1] 層。'] },
          { code: 0, indent: 1, parameters: [] },
        ],
      }),
    ],
    x: 16,
    y: 12,
  };

  const shopNpc = (id, name, x, y, list) => ({
    id,
    name,
    note: '<Tower:shop>',
    pages: [defaultPage({ list })],
    x,
    y,
  });

  /** 資料庫 price 由低至高各 24 筆（302+605×23） */
  const TOWER_WEAPON_IDS = [
    1, 51, 101, 151, 201, 241, 2, 52, 102, 152, 202, 242, 3, 53, 103, 153, 203, 243, 4, 54, 104, 154, 204, 244,
  ];
  const TOWER_ARMOR_IDS = [
    2, 22, 36, 1, 21, 35, 51, 81, 231, 251, 536, 548, 3, 23, 37, 212, 232, 252, 272, 552, 607, 273, 318, 537,
  ];
  const TOWER_ITEM_IDS = [
    92, 7, 13, 19, 93, 25, 26, 27, 8, 14, 20, 73, 9, 15, 21, 33, 10, 16, 22, 11, 23, 47, 17, 42,
  ];

  function buildMzShopMerchandise(typeCode, ids) {
    return ids.map((itemId, i) => ({
      code: i === 0 ? 302 : 605,
      indent: 0,
      parameters: [typeCode, itemId, 0, 0, 0],
    }));
  }

  m.events[27] = shopNpc(27, '武器商', 14, 17, [
    { code: 101, indent: 0, parameters: ['People2', 0, 0, 2, '武器商'] },
    {
      code: 401,
      indent: 0,
      parameters: ['全職業武器共24種，依售價由低到高排列，買賣皆可。'],
    },
    ...buildMzShopMerchandise(1, TOWER_WEAPON_IDS),
    { code: 0, indent: 0, parameters: [] },
  ]);

  m.events[28] = shopNpc(28, '防具商', 15, 17, [
    { code: 101, indent: 0, parameters: ['People2', 3, 0, 2, '防具商'] },
    {
      code: 401,
      indent: 0,
      parameters: ['防具與配件24種，價格由低至高，買賣皆可。'],
    },
    ...buildMzShopMerchandise(2, TOWER_ARMOR_IDS),
    { code: 0, indent: 0, parameters: [] },
  ]);

  m.events[29] = shopNpc(29, '道具商', 16, 17, [
    { code: 101, indent: 0, parameters: ['People3', 0, 0, 2, '道具商'] },
    {
      code: 401,
      indent: 0,
      parameters: ['藥水與輔助道具24種，價格由低至高，買賣皆可。'],
    },
    ...buildMzShopMerchandise(0, TOWER_ITEM_IDS),
    { code: 0, indent: 0, parameters: [] },
  ]);

  m.events[30] = {
    id: 42,
    name: '休息所',
    note: '<Tower:rest>',
    pages: [
      defaultPage({
        image: { characterIndex: 4, characterName: 'People1', direction: 2, pattern: 0, tileId: 0 },
        list: [
          { code: 101, indent: 0, parameters: ['People1', 4, 0, 2, '侍者'] },
          { code: 401, indent: 0, parameters: ['辛苦了，為你恢復全員的體力。'] },
          { code: 314, indent: 0, parameters: [0, 0] },
          { code: 101, indent: 0, parameters: ['People1', 4, 0, 2, '侍者'] },
          { code: 401, indent: 0, parameters: ['已恢復。祝武運昌隆。'] },
          { code: 0, indent: 0, parameters: [] },
        ],
      }),
    ],
    x: 17,
    y: 17,
  };

  fs.writeFileSync(p, JSON.stringify(m, null, 0) + '\n', 'utf8');
  console.log('Patched', p);
}

function patchCommon99() {
  const p = path.join(ROOT, 'data', 'CommonEvents.json');
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ce = arr.find((e) => e && e.id === 99);
  if (!ce) throw new Error('Common event 99 missing');
  ce.list = [
    { code: 111, indent: 0, parameters: [1, 1, 0, 100, 3] },
    { code: 101, indent: 1, parameters: ['', 0, 0, 2, '無限之塔'] },
    { code: 401, indent: 1, parameters: ['變數1 已超過 100，請處理通關或離塔劇情。'] },
    { code: 115, indent: 1, parameters: [] },
    { code: 411, indent: 0, parameters: [] },
    { code: 111, indent: 1, parameters: [1, 1, 0, 1, 4] },
    { code: 122, indent: 2, parameters: [1, 1, 0, 0, 1] },
    { code: 0, indent: 2, parameters: [] },
    { code: 122, indent: 1, parameters: [210, 210, 0, 1, 1] },
    { code: 122, indent: 1, parameters: [210, 210, 1, 0, 400] },
    { code: 301, indent: 1, parameters: [1, 210, true, true] },
    { code: 601, indent: 1, parameters: [] },
    { code: 122, indent: 2, parameters: [1, 1, 1, 0, 1] },
    {
      code: 355,
      indent: 2,
      parameters: [
        'if ($gameMap.mapId() === 65) { const v = $gameVariables.value(1); if (v > 1 && (v - 1) % 5 === 0 && (v - 1) <= 100) { $gamePlayer.reserveTransfer(20, 19, 12, 6, 0); } }',
      ],
    },
    { code: 0, indent: 2, parameters: [] },
    { code: 602, indent: 1, parameters: [] },
    { code: 0, indent: 1, parameters: [] },
    { code: 603, indent: 1, parameters: [] },
    { code: 0, indent: 1, parameters: [] },
    { code: 604, indent: 1, parameters: [] },
    { code: 0, indent: 1, parameters: [] },
  ];
  fs.writeFileSync(p, JSON.stringify(arr, null, 0) + '\n', 'utf8');
  console.log('Patched CommonEvents 99');
}

function patchMap20Reward() {
  const p = path.join(ROOT, 'data', 'Map020.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  while (m.events.length <= 39) m.events.push(null);
  m.events[39] = {
    id: 39,
    name: '塔層獎勵官',
    note: '<Tower:reward>',
    pages: [
      defaultPage({
        image: { characterIndex: 7, characterName: 'People3', direction: 2, pattern: 0, tileId: 0 },
        list: [
          { code: 101, indent: 0, parameters: ['People3', 7, 0, 2, '獎勵官'] },
          {
            code: 401,
            indent: 0,
            parameters: ['恭喜通過這五層！收下這份獎勵吧。（可再自行改為道具／變數）'],
          },
          { code: 125, indent: 0, parameters: [0, 0, 2500] },
          { code: 101, indent: 0, parameters: ['People3', 7, 0, 2, '獎勵官'] },
          { code: 401, indent: 0, parameters: ['回到塔內繼續吧。'] },
          { code: 201, indent: 0, parameters: [0, 65, 11, 10, 2, 0] },
          { code: 0, indent: 0, parameters: [] },
        ],
      }),
    ],
    x: 20,
    y: 12,
  };
  fs.writeFileSync(p, JSON.stringify(m, null, 0) + '\n', 'utf8');
  console.log('Patched Map020 reward NPC');
}

patchMap65();
patchCommon99();
patchMap20Reward();
