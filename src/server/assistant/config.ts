/**
 * Assistant configuration from environment variables (all optional).
 * Without any provider key the assistant is off and the app offers the form.
 */
import { z } from "zod";

export type ProviderName = "groq" | "gemini" | "openrouter" | "mock";

export type ProviderConfig = {
  name: ProviderName;
  /** OpenAI-compatible base URL (…/chat/completions is appended). */
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AssistantConfig = {
  enabled: boolean;
  /** In fallback order. */
  providers: ProviderConfig[];
  /** Tokens per day for all conversations together (local day). 0 = no limit. */
  dailyTokenLimit: number;
  /** Tokens per conversation. Past it, the chat suggests the form. */
  conversationTokenLimit: number;
  /** Patient messages per conversation. */
  conversationMessageLimit: number;
  timeoutMs: number;
  /** Model calls per patient message (each tool round is one call). */
  maxToolRounds: number;
  retentionDays: number;
};

const DEFAULTS: Record<Exclude<ProviderName, "mock">, { baseUrl: string; model: string; keyVar: string; modelVar: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", keyVar: "GEMINI_API_KEY", modelVar: "GEMINI_MODEL" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free", keyVar: "OPENROUTER_API_KEY", modelVar: "OPENROUTER_MODEL" },
};

const int = (def: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).catch(def).default(def);

const Schema = z.object({
  AI_ENABLED: z.string().optional(),
  LLM_MOCK: z.string().optional(),
  LLM_PROVIDERS: z.string().default("groq,gemini,openrouter"),
  LLM_DAILY_TOKEN_LIMIT: int(300_000, 0, 1_000_000_000),
  LLM_CONVERSATION_TOKEN_LIMIT: int(40_000, 1_000, 10_000_000),
  LLM_CONVERSATION_MESSAGE_LIMIT: int(40, 2, 500),
  LLM_TIMEOUT_MS: int(20_000, 1_000, 120_000),
  LLM_MAX_TOOL_ROUNDS: int(4, 1, 10),
  CHAT_RETENTION_DAYS: int(30, 1, 3650),
});

const isOn = (v: string | undefined) => v === "1" || v === "true";
const isOff = (v: string | undefined) => v === "0" || v === "false";

export function assistantConfig(source: Record<string, string | undefined> = process.env): AssistantConfig {
  const e = Schema.parse(source);
  const providers: ProviderConfig[] = [];
  if (isOn(e.LLM_MOCK)) {
    // Scripted local model for tests and demos without keys. Never in real production.
    providers.push({ name: "mock", baseUrl: "mock://", apiKey: "", model: "mock" });
  } else {
    for (const raw of e.LLM_PROVIDERS.split(",")) {
      const name = raw.trim().toLowerCase() as keyof typeof DEFAULTS;
      const d = DEFAULTS[name];
      if (!d) continue;
      const apiKey = source[d.keyVar]?.trim();
      if (!apiKey) continue;
      providers.push({ name, baseUrl: d.baseUrl, apiKey, model: source[d.modelVar]?.trim() || d.model });
    }
  }
  return {
    enabled: !isOff(e.AI_ENABLED) && providers.length > 0,
    providers,
    dailyTokenLimit: e.LLM_DAILY_TOKEN_LIMIT,
    conversationTokenLimit: e.LLM_CONVERSATION_TOKEN_LIMIT,
    conversationMessageLimit: e.LLM_CONVERSATION_MESSAGE_LIMIT,
    timeoutMs: e.LLM_TIMEOUT_MS,
    maxToolRounds: e.LLM_MAX_TOOL_ROUNDS,
    retentionDays: e.CHAT_RETENTION_DAYS,
  };
}
