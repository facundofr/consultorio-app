/**
 * Shapes shared by the chat engine and the browser. Everything here is safe
 * to send to the client: no internal ids, no personal data.
 */

export type SlotOfferView = {
  ref: string;
  date: string; // YYYY-MM-DD local
  time: string; // HH:mm local
  dayLabel: string; // "martes 10 de noviembre"
  professional: string;
  location: string;
};

export type ChatCard =
  | { kind: "slots"; specialty: string; service: string; offers: SlotOfferView[]; formHref: string }
  | { kind: "no_slots"; formHref: string }
  | {
      kind: "booking";
      ref: string;
      when: string;
      professional: string;
      specialty: string;
      service: string;
      location: string;
      address: string;
      cancelMinHours: number;
    }
  | { kind: "lookup"; action: "ver" | "cancelar" }
  | { kind: "emergency"; message: string }
  | { kind: "fallback"; reason: "limit" | "unavailable" | "disabled"; formHref: string; phone: string | null }
  /** `href` carries the cancel token: returned once to the browser, never stored. */
  | { kind: "booked"; code: string; when: string; professional: string; location: string; href?: string };

export type ChatItem = { id: string; role: "user" | "assistant"; text?: string; card?: ChatCard };

/** Server-side state kept in conversations.state (never sent as is). */
export type ConversationState = {
  /** SHA-256 of the per-conversation secret held by the browser. */
  secretHash?: string;
  nextOffer?: number;
  offers?: StoredOffer[];
};

export type StoredOffer = {
  ref: string;
  professionalId: string;
  locationId: string;
  serviceId: string;
  specialtyId: string;
  startsAt: string;
};
