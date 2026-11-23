import { handleRequest } from "./handler.mjs";

const env = {
    GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") ?? "",
    GEMINI_MODEL: Deno.env.get("GEMINI_MODEL") ?? "",
    TIME_UNLOCK_PASSWORD: Deno.env.get("TIME_UNLOCK_PASSWORD") ?? "",
    SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") ?? ""
};

Deno.serve((request) => handleRequest(request, { env, fetch: globalThis.fetch.bind(globalThis) }));
