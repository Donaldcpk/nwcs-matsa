import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { handleRequest, resetForTests } from "../supabase/functions/game-proxy/handler.mjs";

const require = createRequire(import.meta.url);
const help = require("../js/nwcs-ai-help.js");

const ORIGIN = "https://donaldcpk.github.io";
const FAKE_KEY = "test-gemini-key";

function post(body, origin = ORIGIN) {
    return new Request("https://example.test/game-proxy", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body)
    });
}

test("question image uses the picture path from the question bank", () => {
    const question = {
        GUID: "AIQ/JS-MATH-1A01-CHIT-MCQ/JS-MATH-1A01-CHIT-MCQ001.png",
        P_I: 0,
        Q: "請看題目圖片，選出正確答案。",
        C_A: "C"
    };
    const path = help.questionImagePath(question);
    assert.equal(path, "img/pictures/AIQ/JS-MATH-1A01-CHIT-MCQ/JS-MATH-1A01-CHIT-MCQ001.png");
    assert.equal(path.includes("S1MCQ"), false);
    const found = help.findQuestion([question], "AIQ/JS-MATH-1A01-CHIT-MCQ/JS-MATH-1A01-CHIT-MCQ001", 9);
    assert.equal(found, question);
    const text = help.buildTutorContext(question, "這題怎麼做？");
    assert.match(text, /系統正確答案選項：C/);
    assert.match(text, /題目在附上的題目圖片裡/);
    assert.match(text, /玩家說：這題怎麼做？/);
});

test("public game files do not contain published credentials", () => {
    const files = [
        "js/plugins.js",
        "js/main.js",
        "js/nwcs-ai-help.js",
        "js/school-auth-config.defaults.js",
        "js/plugins/MZ_AIFairyCompanion.js",
        "js/plugins/Kurimanju_TimeLimit.js",
        "js/plugins/OmniscientEncyclopedia.js",
        "index.html"
    ];
    const patterns = [
        /AIza[0-9A-Za-z_\-]{8,}/,
        /sb_publishable_[A-Za-z0-9_\-]{8,}/,
        /sb_secret_[A-Za-z0-9_\-]{8,}/,
        /eyJ[A-Za-z0-9_\-]{20,}/,
        /"UnlockPassword":"\d+"/,
        /\|\|\s*"\d{6,}"/
    ];
    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        for (const pattern of patterns) {
            assert.equal(pattern.test(text), false, file + " matched " + pattern);
        }
    }
});

test("proxy refuses to answer until a server key exists, and hides that key", async () => {
    resetForTests();
    const response = await handleRequest(
        post({ action: "ai", context: "1+1", images: [] }),
        { env: { GEMINI_API_KEY: "" }, fetch: async () => { throw new Error(FAKE_KEY); } }
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.equal(JSON.stringify(body).includes(FAKE_KEY), false);
    assert.match(body.error, /設定新的金鑰/);
});

test("proxy asks Gemini with the question image and returns the reply", async () => {
    resetForTests();
    let seen = null;
    const response = await handleRequest(
        post({
            action: "ai",
            context: "系統正確答案選項：B\n玩家說：這題怎麼做？",
            images: [{
                mimeType: "image/png",
                data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
            }]
        }),
        {
            env: { GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "gemini-2.5-flash" },
            fetch: async (url, options) => {
                seen = { url, options };
                const sentBody = JSON.parse(options.body);
                if (sentBody.generationConfig && sentBody.generationConfig.thinkingConfig) {
                    return new Response("thinkingConfig unsupported", { status: 400 });
                }
                return new Response(JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "先看加法。\n正確答案：B" }] } }]
                }), { status: 200 });
            }
        }
    );
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.match(body.reply, /正確答案：B/);
    assert.equal(JSON.stringify(body).includes(FAKE_KEY), false);
    assert.match(seen.url, /models\/gemini-2\.5-flash:generateContent$/);
    assert.equal(seen.options.headers["x-goog-api-key"], FAKE_KEY);
    const sent = JSON.parse(seen.options.body);
    assert.equal(sent.contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.match(sent.systemInstruction.parts[0].text, /繁體中文/);
});

test("Gemini errors that echo a key are not returned to the browser", async () => {
    resetForTests();
    const response = await handleRequest(
        post({ action: "ai", context: "你好" }),
        {
            env: { GEMINI_API_KEY: FAKE_KEY },
            fetch: async () => new Response("bad key " + FAKE_KEY, { status: 403 })
        }
    );
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(JSON.stringify(body).includes(FAKE_KEY), false);
});

test("time unlock stays on the server", async () => {
    resetForTests();
    const missing = await handleRequest(post({ action: "time-unlock", password: "anything" }), {
        env: {},
        fetch: async () => { throw new Error("should not call"); }
    });
    assert.equal((await missing.json()).ok, false);

    const wrong = await handleRequest(post({ action: "time-unlock", password: "nope" }), {
        env: { TIME_UNLOCK_PASSWORD: "correct-horse" },
        fetch: async () => { throw new Error("should not call"); }
    });
    const wrongBody = await wrong.json();
    assert.equal(wrongBody.ok, false);
    assert.equal(JSON.stringify(wrongBody).includes("correct-horse"), false);

    const right = await handleRequest(post({ action: "time-unlock", password: "correct-horse" }), {
        env: { TIME_UNLOCK_PASSWORD: "correct-horse" },
        fetch: async () => { throw new Error("should not call"); }
    });
    assert.equal((await right.json()).ok, true);
});

test("leaderboard read uses the server key and does not return it", async () => {
    resetForTests();
    let seen = null;
    const response = await handleRequest(
        post({ action: "leaderboard-read", orderBy: "score", since: "2026-10-12T08:00:00.000Z" }),
        {
            env: {
                SUPABASE_URL: "https://example.supabase.co",
                SUPABASE_ANON_KEY: "server-only-anon-key"
            },
            fetch: async (url, options) => {
                seen = { url, options };
                return new Response(JSON.stringify([{ nickname: "小明", score: 10 }]), { status: 200 });
            }
        }
    );
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.rows[0].nickname, "小明");
    assert.match(seen.url, /global_leaderboard/);
    assert.match(seen.url, /order=score\.desc/);
    assert.equal(seen.options.headers.apikey, "server-only-anon-key");
    assert.equal(JSON.stringify(body).includes("server-only-anon-key"), false);
});

test("other websites cannot call the proxy", async () => {
    resetForTests();
    const response = await handleRequest(post({ action: "ai", context: "hi" }, "https://evil.example"), {
        env: { GEMINI_API_KEY: FAKE_KEY },
        fetch: async () => { throw new Error("should not call"); }
    });
    assert.equal(response.status, 403);
});
