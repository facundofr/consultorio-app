/**
 * Deterministic emergency check, before any model call: if a message looks
 * like an emergency the chat answers with the clinic's emergency message
 * (911 / SAME 107) without waiting for — or depending on — the LLM.
 * It errs on the side of showing the message.
 */

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");

const PATTERNS: RegExp[] = [
  /dolor (fuerte |muy fuerte |intenso )?(de|en el) pecho/,
  /(opresion|presion) (en el|de) pecho/,
  /no (puedo|puede|podemos) respirar/,
  /(me|le|nos) falta (el )?aire/,
  /(se|me) (esta )?ahoga/,
  /infarto/,
  /\bacv\b|derrame cerebral/,
  /(perdio|perdi|pierde) (el )?conocimiento/,
  /desmay/,
  /convulsi/,
  /(no reacciona|inconsciente)/,
  /hemorragia|sangra(do)? (mucho|abundante|sin parar)|sangra mucho/,
  /sobredosis|intoxica/,
  /(me quiero|quiero|voy a|ganas de) (matar(me)?|morir(me)?|suicidar(me)?)/,
  /suicid/,
  /quitarme la vida|terminar con (mi vida|todo)/,
  /\b(me|lo|la|le) (pico|mordio) una? (vibora|serpiente|alacran|escorpion)/,
  /\bes una emergencia\b|\bemergencia\b/,
];
// "Necesito un turno urgente" is a booking request, not an emergency: the words
// "urgente"/"urgencia" alone do not trigger. The model can still flag it.

export function looksLikeEmergency(text: string): boolean {
  const t = fold(text);
  return PATTERNS.some((p) => p.test(t));
}
