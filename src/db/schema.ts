import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** Soft delete marker. Rows with deleted_at set are hidden from the UI. */
const deletedAt = () => timestamp("deleted_at", { withTimezone: true });

/** Postgres tstzrange, only used for the generated `during` column. */
const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tstzrange";
  },
});

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const appointmentStatus = pgEnum("appointment_status", [
  "confirmed",
  "cancelled_by_patient",
  "cancelled_by_admin",
  "completed",
  "no_show",
]);
export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number];

/** Statuses that occupy the professional's time (used by the exclusion constraint). */
export const ACTIVE_APPOINTMENT_STATUSES = [
  "confirmed",
  "completed",
  "no_show",
] as const satisfies readonly AppointmentStatus[];

export const appointmentSource = pgEnum("appointment_source", ["ai", "form", "admin"]);
export type AppointmentSource = (typeof appointmentSource.enumValues)[number];

export const exceptionScope = pgEnum("exception_scope", [
  "clinic",
  "location",
  "professional",
]);
export const exceptionKind = pgEnum("exception_kind", ["block", "extra"]);

export const userRole = pgEnum("user_role", ["superadmin", "clinic_admin", "staff"]);
export type UserRole = (typeof userRole.enumValues)[number];

export const eventActor = pgEnum("event_actor", ["patient", "admin", "system", "ai"]);

export const messageRole = pgEnum("message_role", ["user", "assistant", "tool", "system"]);

export const conversationStatus = pgEnum("conversation_status", [
  "active",
  "booked",
  "urgent",
  "limited",
  "abandoned",
]);

/* ------------------------------------------------------------------ */
/* Clinics & catalog                                                   */
/* ------------------------------------------------------------------ */

export const clinics = pgTable("clinics", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

/** Per-clinic editable settings. One row per clinic. */
export const settings = pgTable(
  "settings",
  {
    clinicId: uuid("clinic_id")
      .primaryKey()
      .references(() => clinics.id, { onDelete: "cascade" }),
    cancelMinHours: integer("cancel_min_hours").notNull().default(24),
    slotStepMinutes: integer("slot_step_minutes").notNull().default(15),
    bookingHorizonDays: integer("booking_horizon_days").notNull().default(60),
    minLeadMinutes: integer("min_lead_minutes").notNull().default(60),
    reminderHours: integer("reminder_hours").notNull().default(48),
    welcomeText: text("welcome_text")
      .notNull()
      .default("¡Hola! Soy el asistente de turnos. ¿En qué te puedo ayudar?"),
    assistantTone: text("assistant_tone")
      .notNull()
      .default("Cálido, claro y breve. Usá voseo rioplatense."),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    contactHours: text("contact_hours"),
    outOfWindowMessage: text("out_of_window_message")
      .notNull()
      .default(
        "Ya no se puede cancelar online porque faltan menos horas de las permitidas. Comunicate con la clínica por teléfono.",
      ),
    emergencyMessage: text("emergency_message")
      .notNull()
      .default(
        "Si es una emergencia, llamá ya al 911. En CABA también podés llamar al SAME (107). Este asistente no puede ayudarte con urgencias.",
      ),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("settings_cancel_min_hours_chk", sql`${t.cancelMinHours} between 0 and 720`),
    check("settings_slot_step_chk", sql`${t.slotStepMinutes} between 5 and 240`),
    check("settings_horizon_chk", sql`${t.bookingHorizonDays} between 1 and 365`),
    check("settings_min_lead_chk", sql`${t.minLeadMinutes} between 0 and 10080`),
    check("settings_reminder_chk", sql`${t.reminderHours} between 1 and 336`),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city"),
    phone: text("phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("locations_clinic_idx").on(t.clinicId)],
);

export const specialties = pgTable(
  "specialties",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("specialties_clinic_slug_uq").on(t.clinicId, t.slug)],
);

export const professionals = pgTable(
  "professionals",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    title: text("title"), // "Dra.", "Dr.", "Lic."
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    licenseNumber: text("license_number"), // matrícula
    bio: text("bio"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("professionals_clinic_idx").on(t.clinicId)],
);

export const professionalSpecialties = pgTable(
  "professional_specialties",
  {
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    specialtyId: uuid("specialty_id")
      .notNull()
      .references(() => specialties.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.professionalId, t.specialtyId] })],
);

export const professionalLocations = pgTable(
  "professional_locations",
  {
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.professionalId, t.locationId] })],
);

/**
 * Consultation type. Tied to a specialty (or null = valid for any specialty
 * of the clinic). A professional offers every active service of the
 * specialties they practice.
 */
export const services = pgTable(
  "services",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    specialtyId: uuid("specialty_id").references(() => specialties.id),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    priceCents: integer("price_cents"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("services_clinic_idx").on(t.clinicId),
    check("services_duration_chk", sql`${t.durationMinutes} between 5 and 480`),
    check("services_price_chk", sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Schedules                                                           */
/* ------------------------------------------------------------------ */

/**
 * Weekly grid. Times are wall-clock in the clinic's timezone.
 * weekday: ISO 1 (Monday) … 7 (Sunday). If end_time <= start_time the
 * block crosses midnight into the next day.
 */
export const scheduleRules = pgTable(
  "schedule_rules",
  {
    id: id(),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("schedule_rules_prof_idx").on(t.professionalId),
    check("schedule_rules_weekday_chk", sql`${t.weekday} between 1 and 7`),
    check("schedule_rules_start_end_chk", sql`${t.startTime} <> ${t.endTime}`),
    check(
      "schedule_rules_valid_range_chk",
      sql`${t.validFrom} is null or ${t.validTo} is null or ${t.validFrom} <= ${t.validTo}`,
    ),
  ],
);

/**
 * Blocks (vacations, holidays, closures) and extra hours.
 * scope=clinic       → applies to everyone in the clinic (e.g. holiday).
 * scope=location     → applies to everyone at that location.
 * scope=professional → applies to one professional (location optional:
 *                      null = all their locations). Extra hours need a
 *                      location.
 */
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    scope: exceptionScope("scope").notNull(),
    kind: exceptionKind("kind").notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").references(() => professionals.id, {
      onDelete: "cascade",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("schedule_exceptions_clinic_time_idx").on(t.clinicId, t.startsAt),
    check("schedule_exceptions_range_chk", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "schedule_exceptions_scope_chk",
      sql`(${t.scope} = 'clinic' and ${t.locationId} is null and ${t.professionalId} is null)
        or (${t.scope} = 'location' and ${t.locationId} is not null and ${t.professionalId} is null)
        or (${t.scope} = 'professional' and ${t.professionalId} is not null)`,
    ),
    check(
      "schedule_exceptions_extra_chk",
      sql`${t.kind} = 'block' or (${t.scope} = 'professional' and ${t.locationId} is not null)`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Patients & appointments                                             */
/* ------------------------------------------------------------------ */

/**
 * Patients have no account. Phone and email are stored encrypted
 * (AES-256-GCM) plus a keyed hash (HMAC-SHA256) for exact-match lookup.
 */
export const patients = pgTable(
  "patients",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    fullName: text("full_name").notNull(),
    nameKey: text("name_key").notNull(), // normalized name, for dedupe
    phoneEnc: text("phone_enc").notNull(),
    phoneHash: text("phone_hash").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    emailEnc: text("email_enc"),
    emailHash: text("email_hash"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentVersion: text("consent_version"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("patients_identity_uq").on(t.clinicId, t.phoneHash, t.nameKey),
    index("patients_phone_hash_idx").on(t.clinicId, t.phoneHash),
    index("patients_email_hash_idx").on(t.clinicId, t.emailHash),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id),
    specialtyId: uuid("specialty_id").references(() => specialties.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    code: text("code").notNull().unique(),
    cancelTokenHash: text("cancel_token_hash").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    during: tstzrange("during")
      .notNull()
      .generatedAlwaysAs(sql`tstzrange(starts_at, ends_at, '[)')`),
    status: appointmentStatus("status").notNull().default("confirmed"),
    source: appointmentSource("source").notNull(),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id"),
    conversationId: uuid("conversation_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("appointments_clinic_start_idx").on(t.clinicId, t.startsAt),
    index("appointments_prof_start_idx").on(t.professionalId, t.startsAt),
    index("appointments_patient_idx").on(t.patientId),
    index("appointments_reminder_idx")
      .on(t.startsAt)
      .where(sql`status = 'confirmed' and reminder_sent_at is null`),
    check("appointments_range_chk", sql`${t.endsAt} > ${t.startsAt}`),
    // The exclusion constraint (no overlaps per professional among active
    // statuses) is created in a hand-written migration: drizzle-kit cannot
    // express EXCLUDE constraints.
  ],
);

export const appointmentEvents = pgTable(
  "appointment_events",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // created | cancelled | rescheduled | status_changed | reminder_sent | email_sent
    actor: eventActor("actor").notNull(),
    actorUserId: text("actor_user_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("appointment_events_appt_idx").on(t.appointmentId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Knowledge base & assistant                                          */
/* ------------------------------------------------------------------ */

export const kbDocs = pgTable(
  "kb_docs",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("kb_docs_clinic_idx").on(t.clinicId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    clinicId: uuid("clinic_id").references(() => clinics.id),
    ipHash: text("ip_hash"),
    status: conversationStatus("status").notNull().default("active"),
    /** Server-side booking state (selected clinic, offered slots, …). */
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    messageCount: integer("message_count").notNull().default(0),
    tokenCount: integer("token_count").notNull().default(0),
    appointmentId: uuid("appointment_id"),
    createdAt: createdAt(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_created_idx").on(t.createdAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull().default(""),
    toolName: text("tool_name"),
    toolCallId: text("tool_call_id"),
    payload: jsonb("payload").$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: id(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    ok: boolean("ok").notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("llm_usage_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Admin users (Better Auth tables) & audit                            */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("staff"),
  /** Null only for superadmin. */
  clinicId: uuid("clinic_id").references(() => clinics.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    clinicId: uuid("clinic_id").references(() => clinics.id),
    action: text("action").notNull(), // create | update | delete | cancel | move | login …
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_clinic_idx").on(t.clinicId)],
);

/** Simple key/value store for job bookkeeping (last run, etc.). */
export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  lastResult: jsonb("last_result").$type<Record<string, unknown>>(),
});
