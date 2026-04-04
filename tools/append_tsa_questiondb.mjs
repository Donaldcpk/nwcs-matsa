/**
 * 將 TSA 2024/2025 以八個分卷附加至 questionDatabase.js。
 * 專案實際使用「TSA_ALL」合併池：改完答案後請再執行 node tools/merge_tsa_all.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(__dirname, '..', 'js', 'plugins', 'questionDatabase.js');

const ans2025 = [
  'D', 'C', 'C', 'A', 'A', 'B', 'A', 'D', 'D', 'B', 'B', 'B', 'C', 'D', 'D', 'B', 'A', 'B', 'C', 'C',
  'D', 'B', 'C', 'A', 'A', 'A', 'D', 'B', 'C', 'D', 'B', 'C', 'C', 'D', 'B', 'D', 'A', 'B', 'C', 'C',
  'D', 'B', 'A', 'D', 'C', 'D', 'C', 'B', 'C', 'A', 'B', 'D', 'D', 'C', 'A', 'B', 'D', 'A', 'C', 'C',
  'D', 'C', 'D', 'A', 'B', 'D', 'A', 'B', 'D', 'A', 'B', 'B', 'D', 'C', 'B', 'A', 'A', 'A', 'C', 'C',
];

const ans2024 = [
  'D', 'D', 'B', 'A', 'C', 'A', 'A', 'C', 'C', 'B', 'C', 'C', 'B', 'B', 'A', 'D', 'D', 'B', 'A', 'D',
  'A', 'D', 'C', 'D', 'A', 'D', 'C', 'A', 'A', 'C', 'B', 'C', 'B', 'B', 'C', 'A', 'D', 'B', 'B', 'D',
  'B', 'D', 'D', 'A', 'A', 'B', 'C', 'A', 'A', 'D', 'B', 'A', 'C', 'C', 'C', 'C', 'D', 'B', 'B', 'D',
  'D', 'D', 'A', 'C', 'A', 'D', 'A', 'C', 'C', 'D', 'B', 'C', 'A', 'C', 'B', 'B', 'B', 'B', 'A', 'D',
];

if (ans2024.length !== 80) throw new Error('ans2024 len ' + ans2024.length);
if (ans2025.length !== 80) throw new Error('ans2025 len ' + ans2025.length);

function others(ca) {
  return ['A', 'B', 'C', 'D'].filter((x) => x !== ca);
}

function row(year, globalQ, ca) {
  const folder = year === 2025 ? '2025TSA' : '2024TSA';
  const prefix = year === 2025 ? 'TSA2025' : 'TSA2024';
  const mc = Math.ceil(globalQ / 20);
  const local = ((globalQ - 1) % 20) + 1;
  const [o0, o1, o2] = others(ca);
  const note = `TSA${year}_9MC${mc}_Q${local}`;
  const guid = `${folder}/${prefix}Q${globalQ}`;
  return `    {"Note":"${note}","GUID":"${guid}","E":0,"Q_T":4,"Q":"請看題目圖片，選出正確答案。","T":0,"I":1,"A":0,"C_A":"${ca}","A2":"${o0}","A3":"${o1}","A4":"${o2}","A5":"","A5_Why":"","S":"","R_T":"None","R_I":0,"R_A":0,"P_T":"None","P_I":0,"P_A":0,"O_L":0}`;
}

function block(year, paper, answers80) {
  const start = (paper - 1) * 20;
  const slice = answers80.slice(start, start + 20);
  const lines = slice.map((ca, i) => row(year, start + i + 1, ca));
  return lines.join(',\n');
}

const keys = [];
for (const y of [2024, 2025]) {
  const ans = y === 2024 ? ans2024 : ans2025;
  for (let p = 1; p <= 4; p++) {
    const key = `TSA${y}_9MC${p}`;
    const body = block(y, p, ans);
    keys.push(`    "${key}": [\n${body}\n    ]`);
  }
}

const tsaBlock = ',\n\n    // --- TSA 全港性系統評估（圖檔：初中題庫/TSA/2024TSA、2025TSA）---\n' + keys.join(',\n\n');

let text = fs.readFileSync(DB, 'utf8');
const needle = `    {"Note":"3B11EN","GUID":"3B11EN/JSMATH3B11MCEngQ.100.png","E":0,"Q_T":4,"Q":"MCQ","T":0,"I":1,"A":0,"C_A":"?","A2":"?","A3":"?","A4":"?","A5":"","A5_Why":"","S":"","R_T":"None","R_I":0,"R_A":0,"P_T":"None","P_I":0,"P_A":0,"O_L":0},
    ],

};`;
if (!text.includes(needle)) throw new Error('anchor not found in questionDatabase.js');

text = text.replace(
  needle,
  `    {"Note":"3B11EN","GUID":"3B11EN/JSMATH3B11MCEngQ.100.png","E":0,"Q_T":4,"Q":"MCQ","T":0,"I":1,"A":0,"C_A":"?","A2":"?","A3":"?","A4":"?","A5":"","A5_Why":"","S":"","R_T":"None","R_I":0,"R_A":0,"P_T":"None","P_I":0,"P_A":0,"O_L":0},
    ]${tsaBlock}

};`
);

fs.writeFileSync(DB, text, 'utf8');
console.log('Appended TSA keys to questionDatabase.js');
