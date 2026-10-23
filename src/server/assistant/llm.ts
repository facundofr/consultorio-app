/**
 * Minimal OpenAI-compatible chat client (Groq, Gemini and OpenRouter all speak
 * it) with tool calling, timeout and fallback to the next provider.
 * Plain fetch: no SDK, nothing else leaves the server.
 */
import type { ProviderConfig } from "./config";
import { mockComplete } from "./mock";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type CompletionRequest = { messages: ChatMessage[]; tools: ToolDefinition[] };

export type CompletionResult = {
  message: { content: string | null; tool_calls?: ToolCall[] };
  usage: { promptTokens: number; completionTokens: number };
};

/** One provider call, reported for the usage table (also failures). */
export type Attempt = {
  provider: string;
  model: string;
  ok: boolean;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  errorCode?: string;
};

/** What the conversation engine needs. Tests inject a scripted one. */
export type LlmClient = (req: CompletionRequest, onAttempt: (a: Attempt) => Promise<void> | void) => Promise<CompletionResult>;

export class LlmUnavailableError extends Error {
  constructor(public readonly codes: string[]) {
    super(`All LLM providers failed: ${codes.join(", ")}`);
    this.name = "LlmUnavailableError";
  }
}

class ProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type FetchLike = typeof fetch;

async function callProvider(p: ProviderConfig, req: CompletionRequest, timeoutMs: number, fetchImpl: FetchLike): Promise<CompletionResult> {
  if (p.name === "mock") return mockComplete(req);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${p.apiKey}`,
        ...(p.name === "openrouter" ? { "x-title": "Turnos IA" } : {}),
      },
      body: JSON.stringify({
        model: p.model,
        messages: req.messages,
        tools: req.tools,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 700,
      }),
    });
    if (!res.ok) throw new ProviderError(`HTTP_${res.status}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new ProviderError("EMPTY_RESPONSE");
    const toolCalls = (msg.tool_calls ?? [])
      .filter((t) => t?.function?.name)
      .map((t, i) => ({
        id: t.id || `call_${Date.now()}_${i}`,
        type: "function" as const,
        function: { name: t.function.name, arguments: t.function.arguments || "{}" },
      }));
    if (!msg.content && toolCalls.length === 0) throw new ProviderError("EMPTY_RESPONSE");
    return {
      message: { content: msg.content ?? null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      usage: { promptTokens: json.usage?.prompt_tokens ?? 0, completionTokens: json.usage?.completion_tokens ?? 0 },
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new ProviderError("TIMEOUT");
    if (e instanceof SyntaxError) throw new ProviderError("BAD_JSON");
    throw new ProviderError("NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

/** Try each provider in order; the first good answer wins. */
export function createLlmClient(providers: ProviderConfig[], opts: { timeoutMs: number; fetchImpl?: FetchLike }): LlmClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (req, onAttempt) => {
    const codes: string[] = [];
    for (const p of providers) {
      const t0 = Date.now();
      try {
        const r = await callProvider(p, req, opts.timeoutMs, fetchImpl);
        await onAttempt({ provider: p.name, model: p.model, ok: true, ...r.usage, latencyMs: Date.now() - t0 });
        return r;
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : "UNKNOWN";
        codes.push(`${p.name}:${code}`);
        await onAttempt({ provider: p.name, model: p.model, ok: false, promptTokens: 0, completionTokens: 0, latencyMs: Date.now() - t0, errorCode: code });
      }
    }
    throw new LlmUnavailableError(codes);
  };
}
