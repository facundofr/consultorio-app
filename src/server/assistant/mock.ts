/**
 * Scripted stand-in for a real model (LLM_MOCK=1): deterministic, offline,
 * used by E2E tests and local demos without API keys. It reads the catalog
 * from the system prompt and calls the same tools a real model would.
 */
import type { CompletionRequest, CompletionResult } from "./llm";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

let seq = 0;
const call = (name: string, args: Record<string, unknown>): CompletionResult => ({
  message: { content: null, tool_calls: [{ id: `mock_${++seq}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
  usage: { promptTokens: 120, completionTokens: 20 },
});
const say = (content: string): CompletionResult => ({ message: { content }, usage: { promptTokens: 120, completionTokens: 30 } });

export async function mockComplete(req: CompletionRequest): Promise<CompletionResult> {
  const system = req.messages.find((m) => m.role === "system")?.content ?? "";
  const last = req.messages[req.messages.length - 1];

  if (last?.role === "tool") {
    let r: Record<string, unknown> = {};
    try {
      r = JSON.parse(last.content);
    } catch {}
    if (r.error) return say(`No pude hacerlo: ${String(r.error)}`);
    if (Array.isArray(r.horarios)) {
      return r.horarios.length
        ? say(`Encontré horarios de ${String(r.especialidad ?? "esa especialidad")}. Tocá el que prefieras.`)
        : say("No encontré horarios con esos filtros. ¿Probamos otras fechas?");
    }
    return say("Listo, completalo acá abajo.");
  }

  const text = last?.role === "user" ? fold(last.content) : "";
  const pick = text.match(/\bh(\d{1,3})\b/);
  if (pick) return call("ofrecer_reserva", { horario: `H${pick[1]}` });
  if (/cancel|mi turno|ver (el|mi) turno/.test(text)) {
    return call("gestionar_turno_existente", { accion: text.includes("cancel") ? "cancelar" : "ver" });
  }

  const specs = [...system.matchAll(/^- (E\d+): (.+)$/gm)].map((m) => ({ ref: m[1], name: fold(m[2]) }));
  const spec = specs.find((s) => text.includes(s.name) || s.name.split(" ").some((w) => w.length > 5 && text.includes(w.slice(0, -1))));
  if (spec) {
    const franja = /manana/.test(text) ? "manana" : /tarde/.test(text) ? "tarde" : undefined;
    return call("buscar_horarios", { especialidad: spec.ref, ...(franja ? { franja } : {}) });
  }
  return say("¿Para qué especialidad querés el turno?");
}
