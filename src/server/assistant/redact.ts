/**
 * Personal data never goes to the model or to the chat log: the booking and
 * lookup forms inside the chat collect it. If the patient types it anyway,
 * it is replaced before saving and before calling the LLM.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
/** 8+ digits with spaces, dots, dashes, parentheses or a leading +: phones, DNI, CUIT, cards. */
const LONG_NUMBER = /[+(]?\d[\d\s.()-]{6,}\d/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function redactPersonalData(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  let out = text.replace(EMAIL, () => {
    redacted = true;
    return "[email]";
  });
  out = out.replace(LONG_NUMBER, (m) => {
    if (m.replace(/\D/g, "").length < 8 || ISO_DATE.test(m.trim())) return m;
    redacted = true;
    return "[número]";
  });
  return { text: out, redacted };
}
