import { describe, expect, it, vi } from "vitest";
import { assistantConfig, type ProviderConfig } from "./config";
import { createLlmClient, LlmUnavailableError, type Attempt } from "./llm";

const p = (name: "groq" | "gemini" | "openrouter"): ProviderConfig => ({ name, baseUrl: `https://${name}.test/v1`, apiKey: "k", model: `${name}-model` });
const req = { messages: [{ role: "user" as const, content: "hola" }], tools: [] };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("createLlmClient", () => {
  it("falls back to the next provider and reports every attempt", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(ok({ choices: [{ message: { content: "¡Hola!" } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }));
    const attempts: Attempt[] = [];
    const llm = createLlmClient([p("groq"), p("gemini")], { timeoutMs: 1000, fetchImpl });
    const r = await llm(req, (a) => void attempts.push(a));
    expect(r.message.content).toBe("¡Hola!");
    expect(attempts.map((a) => [a.provider, a.ok, a.errorCode])).toEqual([
      ["groq", false, "HTTP_429"],
      ["gemini", true, undefined],
    ]);
    expect(attempts[1]).toMatchObject({ promptTokens: 10, completionTokens: 3 });
    expect(fetchImpl.mock.calls[1][0]).toBe("https://gemini.test/v1/chat/completions");
    const body = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(body.model).toBe("gemini-model");
  });

  it("parses tool calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      ok({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "buscar_horarios", arguments: '{"especialidad":"E1"}' } }] } }] }),
    );
    const r = await createLlmClient([p("groq")], { timeoutMs: 1000, fetchImpl })(req, () => {});
    expect(r.message.tool_calls?.[0].function).toEqual({ name: "buscar_horarios", arguments: '{"especialidad":"E1"}' });
  });

  it("times out a slow provider", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const attempts: Attempt[] = [];
    await expect(createLlmClient([p("groq")], { timeoutMs: 20, fetchImpl })(req, (a) => void attempts.push(a))).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(attempts[0].errorCode).toBe("TIMEOUT");
  });

  it("treats an empty answer as a failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ok({ choices: [{ message: { content: "" } }] }));
    await expect(createLlmClient([p("groq"), p("openrouter")], { timeoutMs: 100, fetchImpl })(req, () => {})).rejects.toMatchObject({
      codes: ["groq:EMPTY_RESPONSE", "openrouter:EMPTY_RESPONSE"],
    });
  });
});

describe("assistantConfig", () => {
  it("is off without keys", () => {
    expect(assistantConfig({}).enabled).toBe(false);
  });

  it("keeps the configured order and skips providers without a key", () => {
    const c = assistantConfig({ LLM_PROVIDERS: "openrouter, groq, gemini", GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "x/y:free" });
    expect(c.enabled).toBe(true);
    expect(c.providers.map((p) => [p.name, p.model])).toEqual([
      ["openrouter", "x/y:free"],
      ["groq", "llama-3.3-70b-versatile"],
    ]);
  });

  it("AI_ENABLED=false wins over keys; invalid numbers fall back to defaults", () => {
    const c = assistantConfig({ AI_ENABLED: "false", GROQ_API_KEY: "g", LLM_DAILY_TOKEN_LIMIT: "mucho" });
    expect(c.enabled).toBe(false);
    expect(c.dailyTokenLimit).toBe(300_000);
  });

  it("LLM_MOCK uses only the local scripted model", () => {
    const c = assistantConfig({ LLM_MOCK: "1", GROQ_API_KEY: "g" });
    expect(c.providers.map((p) => p.name)).toEqual(["mock"]);
  });
});
