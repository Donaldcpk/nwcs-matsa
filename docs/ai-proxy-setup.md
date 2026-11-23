# 小精靈伺服器設定

遊戲網頁是公開的。AI 金鑰、資料庫金鑰、每日限時密碼都不能再寫進 `js/plugins.js`。

小精靈現在把問題送到 Supabase Edge Function `game-proxy`。這支函式在伺服器上轉問 Google Gemini，金鑰只放在 Supabase 的秘密設定。

在老師把新金鑰放上伺服器之前，小精靈會回答：「AI 還沒設定完成。」這是正常的，不代表程式沒接上。

## 1. 做一把新的 Google 金鑰

舊金鑰已經公開過，而且 Google 已把它停用。不要再用那一把。

1. 打開 [Google AI Studio](https://aistudio.google.com/apikey)，建立一把新的 API 金鑰。
2. 若這把金鑰屬於 Google Cloud，到 [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) 按啟用。
3. 在金鑰限制裡，只允許 **Generative Language API**。
4. 不要用「網站網址」限制。呼叫是從伺服器發出，不是從學生的瀏覽器發出。
5. 在 AI Studio 設定用量上限，避免這條公開通道把配額用完。

## 2. 把秘密放進 Supabase

專案是現有的 RMMZ-MATH。到 Supabase 控制台：

**Project Settings → Edge Functions → Secrets**（或 Edge Functions 的 Secrets 頁）

新增這三個名稱，值只留在該頁，不要貼回 Git：

| 名稱 | 值 |
| --- | --- |
| `GEMINI_API_KEY` | 第 1 步建立的新金鑰 |
| `GEMINI_MODEL` | `gemini-2.5-flash`。若 AI Studio 顯示這個名稱已不能用，改成清單裡支援看圖的 Flash 模型。 |
| `TIME_UNLOCK_PASSWORD` | 老師新設的解鎖密碼。不要沿用已經公開過的舊密碼。 |

用指令也可以（把等號右邊換成真實值，不要把這行提交進 Git）：

```bash
supabase secrets set --project-ref oqsvxizemgyfointylpe \
  GEMINI_API_KEY=新的金鑰 \
  GEMINI_MODEL=gemini-2.5-flash \
  TIME_UNLOCK_PASSWORD=新的解鎖密碼
```

`SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 會由 Supabase 自動提供給函式，不用寫進遊戲。

## 3. 函式已經放上 Supabase

函式名稱是 `game-proxy`，而且 **verify_jwt 必須關閉**。遊戲沒有登入，若要求 JWT，瀏覽器就得再帶一把公開金鑰。

這支函式已經部署在 RMMZ-MATH。你只要完成第 2 步的三個秘密，不用先重新部署。

來源碼在 `supabase/functions/game-proxy/`。若之後改了這支函式，再執行：

```bash
supabase functions deploy game-proxy --project-ref oqsvxizemgyfointylpe --no-verify-jwt
```

## 4. 作廢已經公開的 Supabase 前端金鑰

遊戲改走 `game-proxy` 之後，學生頁面不再需要原本的 publishable key。

1. 先等這個版本已經在 GitHub Pages 更新。
2. 到 Supabase → Settings → API Keys，輪替或撤銷舊的 publishable key。
3. 輪替後再部署一次 `game-proxy`，讓函式拿到新的伺服器金鑰。

## 5. 怎樣算成功

1. 打開遊戲，進入一場會出題的戰鬥。
2. 點左下角小精靈，輸入「這題怎麼做？」後送出。
3. 回覆要用繁體中文，先說明怎麼算，最後一行是「正確答案：」。

若回覆是「AI 還沒設定完成」，代表第 2 步的 `GEMINI_API_KEY` 還沒存好。存好之後不用改遊戲程式，再問一次即可。

每日時間用完時，提示框的密碼會送到同一支函式核對。遊戲檔案裡沒有這組密碼。
