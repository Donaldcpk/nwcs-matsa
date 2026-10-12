# 伍華數學練習

給伍華中學學生在瀏覽器裡練習數學選擇題。答對的選項以試算表答案表為準。畫面上不會把練習叫做 TSA 操練。

## 特色功能

- 中一、中二、中三的中文與英文選擇題。
- 正確答案記在題庫的 `C_A`（A、B、C 或 D）。
- 另有綜合練習題，答案不在這次的 S1–S6 答案表裡。題目圖片仍放在原有資料夾，避免路徑失效。
- 學生用互聯網登入（s 加 7 位數字）和出生日期 8 位進入；老師用學校電郵或 nwcs 編號，以及校方已發的密碼。

## 安裝與執行

1. 需要現代瀏覽器（Chrome、Safari、Edge）。
2. 用本機網頁伺服器打開專案，不要直接雙擊 `index.html`（遊戲會用相對路徑載入圖片）。
3. 在專案資料夾執行：

```bash
python3 -m http.server 8080
```

4. 瀏覽器打開 `http://localhost:8080`。

## 使用說明

- 學生登入名稱填互聯網登入（s 後面 7 個數字），密碼填出生日期 8 位，年份在前。
- 老師登入名稱填學校電郵或 nwcs 編號，密碼填校方已發的密碼。老師密碼不會改成出生日期。
- 備用帳號只填 `mathai01` 到 `mathai40`（不用打 @）。少打一個 0 也可以，例如 `mathai1` 會當成 `mathai01`。密碼用老師派發的備用密碼，不寫在這個網頁或程式庫裡。密碼打錯不會開新帳。
- 進入遊戲後選年級與中文或英文，依畫面作答。
- 開新遊戲時，悠真、莉娜、米勒、塞拉都是 4 級。
- 登入畫面說明最後有例子：登入名稱 `s1234567`，密碼 `20261012`。
- 世界排名由 2026-10-12 16:00（香港時間）起重新計算，之前的分數不顯示。
- 題目圖會縮放成完整放進畫面；還有空位時會放大，最多 2 倍。答案按鈕在畫面下方排成一列，並佔滿寬度。
- 答案表還沒有 A–D 的題會自動跳過。
- 題目圖片在 `img` 對應資料夾；題號來自檔名，例如 `JSMATH1A01MCQ2.png` 是中一 1A01 第 2 題。
- 正確答案欄位：
  - `C_A`：正確選項（A–D）
  - `A2`、`A3`、`A4`：其餘三個選項，依字母順序排列
- 答案來源： [Answer Key S1-6](https://docs.google.com/spreadsheets/d/16E2x8Ios7qEwhMm-rgaGOAJyD9u3DuNdTB3XO8vHlKE/edit)

## 架構總覽

- `index.html`：遊戲入口。
- `js/plugins/questionDatabase.js`：題庫（S1／S2／S3 中英文，以及綜合練習）。
- `js/school-auth-gate.js`：進入遊戲前的登入畫面。
- `js/plugins/MZQuizzer.js`：顯示題目、核對 `C_A`。
- `data/`：RPG Maker MZ 地圖與系統資料。

## 測試方法

題庫是資料，不是網頁按鈕流程。改完答案後，用 Node 檢查語法：

```bash
node --check js/plugins/questionDatabase.js
node --check js/plugins/quizPictureFit.js
node --check js/plugins/MZQuizzer.js
node --check js/school-auth-gate.js
node tools/test_quiz_picture_fit.mjs
node tools/test_school_login_normalize.mjs
```

備用帳建帳（只在自己的電腦，金鑰與密碼不要提交）：

```bash
cp tools/.env.supabase.local.example tools/.env.supabase.local
# 編輯 .env.supabase.local：填 service_role，以及校方文件裡的備用密碼
node tools/sync_student_whitelist_from_csv.mjs --backup-mathai
node tools/provision_supabase_auth_users.mjs --backup-mathai
```

再對照答案表：每一題的 `C_A` 應等於該章、該語言、該題號的儲存格。答案表空白或寫 `N` 的題目會保持 `?`，不會猜答案。

## 版本與變更

- 版本規則：Semantic Versioning（`主版.次版.修訂`）。目前為 `0.3.5`。
- 變更紀錄：[CHANGELOG.md](CHANGELOG.md)
- 提交訊息：Conventional Commits，例如 `fix(quiz): 修正選擇題正確答案`。

## 授權與維護者

- 維護者：專案擁有者（GitHub `Donaldcpk/nwcs-matsa`）。
- 題目答案有誤時，先改答案表，再更新 `questionDatabase.js` 的 `C_A`。
- 回報問題：在 GitHub 開 Issue，請寫明年級、章節、題號，以及你看到的答案和答案表上的答案。
