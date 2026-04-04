/**
 * 將八個 TSA 分卷合併為單一 TSA_ALL（2024 共 80 題 + 2025 共 80 題 = 160 題）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(__dirname, '..', 'js', 'plugins', 'questionDatabase.js');

const keys = [
  'TSA2024_9MC1',
  'TSA2024_9MC2',
  'TSA2024_9MC3',
  'TSA2024_9MC4',
  'TSA2025_9MC1',
  'TSA2025_9MC2',
  'TSA2025_9MC3',
  'TSA2025_9MC4',
];

let text = fs.readFileSync(DB, 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(text, ctx);
const db = ctx.questionDatabase;
if (!db) throw new Error('questionDatabase failed to load');
const merged = [];
for (const k of keys) {
  const arr = db[k];
  if (!arr || arr.length !== 20) throw new Error(`Missing or bad ${k}`);
  let i = merged.length;
  for (const row of arr) {
    const copy = { ...row, Note: `TSA_ALL_${i + 1}` };
    merged.push(copy);
    i++;
  }
}
if (merged.length !== 160) throw new Error('Expected 160 TSA entries, got ' + merged.length);

const lines = merged.map((row, idx) => {
  const j = JSON.stringify(row);
  return '    ' + j + (idx < merged.length - 1 ? ',' : '');
});

const tsaBlock = `    // --- TSA：2024+2025 合併池（變數990=4 時隨機抽題，無限操練）---
    "TSA_ALL": [
${lines.join('\n')}
    ]
`;

const startIdx = text.indexOf('    // --- TSA');
if (startIdx < 0) throw new Error('TSA section marker not found');
const endIdx = text.lastIndexOf('\n};');
if (endIdx < 0) throw new Error('file end }; not found');
const head = text.slice(0, startIdx);
const out = head + tsaBlock + '\n};';
fs.writeFileSync(DB, out, 'utf8');
console.log('Wrote TSA_ALL with', merged.length, 'questions');
