import { describe, expect, it } from "vitest";
import { looksLikeEmergency } from "./safety";

describe("looksLikeEmergency", () => {
  it.each([
    "Tengo un dolor fuerte en el pecho",
    "mi papá no puede respirar",
    "Me falta el aire desde hace una hora",
    "creo que es un infarto",
    "mi hijo se desmayó",
    "está convulsionando",
    "QUIERO MATARME",
    "pienso en suicidarme",
    "mi abuela perdió el conocimiento",
    "es una emergencia",
  ])("detects: %s", (t) => expect(looksLikeEmergency(t)).toBe(true));

  it.each([
    "Quiero un turno con cardiología",
    "necesito un turno urgente con el pediatra",
    "¿atienden por urgencias los sábados?",
    "quiero cancelar mi turno del pecho... digo, de cardiología",
    "control de presión arterial",
  ])("does not flag: %s", (t) => expect(looksLikeEmergency(t)).toBe(false));
});
