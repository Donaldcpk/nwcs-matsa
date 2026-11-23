/**
 * 小精靈與排行榜共用的純函式。
 * 遊戲憑證不放在這裡。瀏覽器以一般 script 載入，測試用 require。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    root.NwcsAiHelp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const DEFAULT_PROXY_URL =
        "https://oqsvxizemgyfointylpe.supabase.co/functions/v1/game-proxy";

    function proxyUrl() {
        if (typeof globalThis.NWCS_PROXY_URL === "string" && globalThis.NWCS_PROXY_URL.trim()) {
            return globalThis.NWCS_PROXY_URL.trim();
        }
        try {
            if (typeof PluginManager !== "undefined") {
                const names = ["MZ_AIFairyCompanion", "OmniscientEncyclopedia", "Kurimanju_TimeLimit"];
                for (let i = 0; i < names.length; i++) {
                    const params = PluginManager.parameters(names[i]) || {};
                    const value = String(params.proxyUrl || params.proxyurl || "").trim();
                    if (value) return value;
                }
            }
        } catch (e) {
            /* 插件還沒載入時用預設網址 */
        }
        return DEFAULT_PROXY_URL;
    }

    function pictureBase(name) {
        return String(name || "")
            .replace(/^.*[\\/]/, "")
            .replace(/\.(png|jpg|jpeg)$/i, "");
    }

    function questionPictureName(question) {
        if (!question) return "";
        const explicit = question.P_I;
        if (explicit && explicit !== 0 && explicit !== "0") return String(explicit);
        return question.GUID ? String(question.GUID) : "";
    }

    function questionImagePath(question) {
        const name = questionPictureName(question).replace(/\.(png|jpg|jpeg)$/i, "");
        if (!name) return "";
        return "img/pictures/" + name + ".png";
    }

    function findQuestion(list, pictureName, index) {
        if (!list || !list.length) return null;
        const wanted = pictureBase(pictureName);
        if (wanted) {
            for (let i = 0; i < list.length; i++) {
                if (pictureBase(questionPictureName(list[i])) === wanted) return list[i];
            }
        }
        const n = Number(index) || 0;
        if (n >= 0 && n < list.length) return list[n];
        return list[0];
    }

    function decodeField(question, value) {
        const text = value === undefined || value === null ? "" : String(value);
        if (!question || question.E !== 1 || !text || text === "undefined") return text;
        try {
            return atob(text);
        } catch (e) {
            return text;
        }
    }

    function isImagePrompt(qText) {
        const text = String(qText || "").trim();
        return (
            text === "" ||
            text === "MCQ" ||
            text === "請選答案" ||
            text.indexOf("請看題目圖片") >= 0
        );
    }

    function buildTutorContext(question, playerText) {
        const lines = [];
        if (question) {
            lines.push("【當前戰鬥題目資料】");
            const qText = decodeField(question, question.Q);
            if (isImagePrompt(qText)) {
                lines.push("題目在附上的題目圖片裡。請閱讀圖片中的算式與 A 到 D 選項。");
            } else {
                lines.push("題目內容：" + qText);
            }
            const answer = decodeField(question, question.C_A).trim();
            const letter = /^[A-E]$/i.test(answer);
            if (!letter) {
                const options = ["C_A", "A2", "A3", "A4", "A5"]
                    .map(function (key) {
                        return decodeField(question, question[key]);
                    })
                    .filter(function (item) {
                        return item && item !== "undefined";
                    });
                if (options.length) lines.push("選項：" + options.join(" | "));
                lines.push("系統正確答案數值：" + answer);
            } else {
                lines.push("系統正確答案選項：" + answer.toUpperCase());
            }
            lines.push(
                "請用繁體中文。先說這題在考什麼，再逐步計算。公式用 LaTeX，行內用 $...$，獨立一行用 $$...$$。最後單獨一行寫「正確答案：」加上選項或數值。過程要和系統正確答案一致。不要提到圖片檔名。"
            );
        } else {
            lines.push("現在沒有戰鬥題目。只回答和這款數學遊戲有關的問題。");
        }
        lines.push("玩家說：" + String(playerText || ""));
        return lines.join("\n");
    }

    async function postProxy(body) {
        const url = proxyUrl();
        if (!url) return { ok: false, error: "還沒設定通訊網址。" };
        let response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } catch (e) {
            return { ok: false, error: "連不到精靈伺服器，請檢查網路。" };
        }
        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            data = {};
        }
        if (!response.ok || data.ok === false) {
            return { ok: false, error: data.error || "精靈暫時沒有回應。" };
        }
        return data;
    }

    function verifyTimeUnlock(password) {
        return postProxy({ action: "time-unlock", password: String(password || "") });
    }

    return {
        DEFAULT_PROXY_URL: DEFAULT_PROXY_URL,
        proxyUrl: proxyUrl,
        pictureBase: pictureBase,
        questionPictureName: questionPictureName,
        questionImagePath: questionImagePath,
        findQuestion: findQuestion,
        isImagePrompt: isImagePrompt,
        buildTutorContext: buildTutorContext,
        postProxy: postProxy,
        verifyTimeUnlock: verifyTimeUnlock
    };
});
