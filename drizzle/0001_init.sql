CREATE TYPE "public"."appointment_source" AS ENUM('ai', 'form', 'admin');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('confirmed', 'cancelled_by_patient', 'cancelled_by_admin', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'booked', 'urgent', 'limited', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."event_actor" AS ENUM('patient', 'admin', 'system', 'ai');--> statement-breakpoint
CREATE TYPE "public"."exception_kind" AS ENUM('block', 'extra');--> statement-breakpoint
CREATE TYPE "public"."exception_scope" AS ENUM('clinic', 'location', 'professional');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'clinic_admin', 'staff');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor" "event_actor" NOT NULL,
	"actor_user_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"specialty_id" uuid,
	"service_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"code" text NOT NULL,
	"cancel_token_hash" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"during" "tstzrange" GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED NOT NULL,
	"status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
	"source" "appointment_source" NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"reminder_sent_at" timestamp with time zone,
	"created_by_user_id" text,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_code_unique" UNIQUE("code"),
	CONSTRAINT "appointments_range_chk" CHECK ("appointments"."ends_at" > "appointments"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"clinic_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "clinics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"ip_hash" text,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "kb_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text,
	"phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tool_name" text,
	"tool_call_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"name_key" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_last4" text NOT NULL,
	"email_enc" text,
	"email_hash" text,
	"consent_at" timestamp with time zone,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "professional_locations" (
	"professional_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "professional_locations_professional_id_location_id_pk" PRIMARY KEY("professional_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "professional_specialties" (
	"professional_id" uuid NOT NULL,
	"specialty_id" uuid NOT NULL,
	CONSTRAINT "professional_specialties_professional_id_specialty_id_pk" PRIMARY KEY("professional_id","specialty_id")
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"title" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"license_number" text,
	"bio" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"scope" "exception_scope" NOT NULL,
	"kind" "exception_kind" NOT NULL,
	"location_id" uuid,
	"professional_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_exceptions_range_chk" CHECK ("schedule_exceptions"."ends_at" > "schedule_exceptions"."starts_at"),
	CONSTRAINT "schedule_exceptions_scope_chk" CHECK (("schedule_exceptions"."scope" = 'clinic' and "schedule_exceptions"."location_id" is null and "schedule_exceptions"."professional_id" is null)
        or ("schedule_exceptions"."scope" = 'location' and "schedule_exceptions"."location_id" is not null and "schedule_exceptions"."professional_id" is null)
        or ("schedule_exceptions"."scope" = 'professional' and "schedule_exceptions"."professional_id" is not null)),
	CONSTRAINT "schedule_exceptions_extra_chk" CHECK ("schedule_exceptions"."kind" = 'block' or ("schedule_exceptions"."scope" = 'professional' and "schedule_exceptions"."location_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "schedule_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professional_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_rules_weekday_chk" CHECK ("schedule_rules"."weekday" between 1 and 7),
	CONSTRAINT "schedule_rules_start_end_chk" CHECK ("schedule_rules"."start_time" <> "schedule_rules"."end_time"),
	CONSTRAINT "schedule_rules_valid_range_chk" CHECK ("schedule_rules"."valid_from" is null or "schedule_rules"."valid_to" is null or "schedule_rules"."valid_from" <= "schedule_rules"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"specialty_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "services_duration_chk" CHECK ("services"."duration_minutes" between 5 and 480),
	CONSTRAINT "services_price_chk" CHECK ("services"."price_cents" is null or "services"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"clinic_id" uuid PRIMARY KEY NOT NULL,
	"cancel_min_hours" integer DEFAULT 24 NOT NULL,
	"slot_step_minutes" integer DEFAULT 15 NOT NULL,
	"booking_horizon_days" integer DEFAULT 60 NOT NULL,
	"min_lead_minutes" integer DEFAULT 60 NOT NULL,
	"reminder_hours" integer DEFAULT 48 NOT NULL,
	"welcome_text" text DEFAULT '¡Hola! Soy el asistente de turnos. ¿En qué te puedo ayudar?' NOT NULL,
	"assistant_tone" text DEFAULT 'Cálido, claro y breve. Usá voseo rioplatense.' NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"contact_hours" text,
	"out_of_window_message" text DEFAULT 'Ya no se puede cancelar online porque faltan menos horas de las permitidas. Comunicate con la clínica por teléfono.' NOT NULL,
	"emergency_message" text DEFAULT 'Si es una emergencia, llamá ya al 911. En CABA también podés llamar al SAME (107). Este asistente no puede ayudarte con urgencias.' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_cancel_min_hours_chk" CHECK ("settings"."cancel_min_hours" between 0 and 720),
	CONSTRAINT "settings_slot_step_chk" CHECK ("settings"."slot_step_minutes" between 5 and 240),
	CONSTRAINT "settings_horizon_chk" CHECK ("settings"."booking_horizon_days" between 1 and 365),
	CONSTRAINT "settings_min_lead_chk" CHECK ("settings"."min_lead_minutes" between 0 and 10080),
	CONSTRAINT "settings_reminder_chk" CHECK ("settings"."reminder_hours" between 1 and 336)
);
--> statement-breakpoint
CREATE TABLE "specialties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"clinic_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_docs" ADD CONSTRAINT "kb_docs_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_locations" ADD CONSTRAINT "professional_locations_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_locations" ADD CONSTRAINT "professional_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "appointment_events_appt_idx" ON "appointment_events" USING btree ("appointment_id","created_at");--> statement-breakpoint
CREATE INDEX "appointments_clinic_start_idx" ON "appointments" USING btree ("clinic_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_prof_start_idx" ON "appointments" USING btree ("professional_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointments_reminder_idx" ON "appointments" USING btree ("starts_at") WHERE status = 'confirmed' and reminder_sent_at is null;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_clinic_idx" ON "audit_log" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "conversations_created_idx" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "kb_docs_clinic_idx" ON "kb_docs" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "llm_usage_created_idx" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "locations_clinic_idx" ON "locations" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_identity_uq" ON "patients" USING btree ("clinic_id","phone_hash","name_key");--> statement-breakpoint
CREATE INDEX "patients_phone_hash_idx" ON "patients" USING btree ("clinic_id","phone_hash");--> statement-breakpoint
CREATE INDEX "patients_email_hash_idx" ON "patients" USING btree ("clinic_id","email_hash");--> statement-breakpoint
CREATE INDEX "professionals_clinic_idx" ON "professionals" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_clinic_time_idx" ON "schedule_exceptions" USING btree ("clinic_id","starts_at");--> statement-breakpoint
CREATE INDEX "schedule_rules_prof_idx" ON "schedule_rules" USING btree ("professional_id");--> statement-breakpoint
CREATE INDEX "services_clinic_idx" ON "services" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specialties_clinic_slug_uq" ON "specialties" USING btree ("clinic_id","slug");