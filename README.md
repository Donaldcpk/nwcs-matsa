# TSA Training（數學選擇題練習）

給中一至中三學生在瀏覽器裡練習數學選擇題。答對的選項以試算表答案表為準。

## 特色功能

- 中一、中二、中三的中文與英文選擇題。
- 正確答案記在題庫的 `C_A`（A、B、C 或 D）。
- 另有 TSA 練習題，答案不在這次的 S1–S6 答案表裡。
- 學校登入與排行榜（需自行設定，見 `tools/`）。

## 安裝與執行

1. 需要現代瀏覽器（Chrome、Safari、Edge）。
2. 用本機網頁伺服器打開專案，不要直接雙擊 `index.html`（遊戲會用相對路徑載入圖片）。
3. 在專案資料夾執行：

```bash
python3 -m http.server 8080
```

4. 瀏覽器打開 `http://localhost:8080`。

## 使用說明

- 進入遊戲後選年級與中文或英文，依畫面作答。
- 題目圖片在 `img` 對應資料夾；題號來自檔名，例如 `JSMATH1A01MCQ2.png` 是中一 1A01 第 2 題。
- 正確答案欄位：
  - `C_A`：正確選項（A–D）
  - `A2`、`A3`、`A4`：其餘三個選項，依字母順序排列
- 答案來源： [Answer Key S1-6](https://docs.google.com/spreadsheets/d/16E2x8Ios7qEwhMm-rgaGOAJyD9u3DuNdTB3XO8vHlKE/edit)

## 架構總覽

- `index.html`：遊戲入口。
- `js/plugins/questionDatabase.js`：題庫（S1／S2／S3 中英文，以及 TSA）。
- `js/plugins/MZQuizzer.js`：顯示題目、核對 `C_A`。
- `data/`：RPG Maker MZ 地圖與系統資料。

## 測試方法

題庫是資料，不是網頁按鈕流程。改完答案後，用 Node 檢查語法：

```bash
node --check js/plugins/questionDatabase.js
```

再對照答案表：每一題的 `C_A` 應等於該章、該語言、該題號的儲存格。答案表空白或寫 `N` 的題目會保持 `?`，不會猜答案。

## 版本與變更

- 版本規則：Semantic Versioning（`主版.次版.修訂`）。目前公開修正為 `0.1.1`。
- 變更紀錄：[CHANGELOG.md](CHANGELOG.md)
- 提交訊息：Conventional Commits，例如 `fix(quiz): 修正選擇題正確答案`。

## 授權與維護者

- 維護者：專案擁有者（GitHub `Donaldcpk/nwcs-matsa`）。
- 題目答案有誤時，先改答案表，再更新 `questionDatabase.js` 的 `C_A`。
- 回報問題：在 GitHub 開 Issue，請寫明年級、章節、題號，以及你看到的答案和答案表上的答案。
