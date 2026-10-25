CREATE TYPE "public"."email_kind" AS ENUM('confirmation', 'cancellation', 'rescheduled', 'reminder');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sending', 'sent', 'preview', 'failed');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid,
	"kind" "email_kind" NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"payload_enc" text,
	"subject_preview" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("next_attempt_at") WHERE status in ('pending', 'sending');--> statement-breakpoint
CREATE INDEX "email_outbox_clinic_created_idx" ON "email_outbox" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_appointment_idx" ON "email_outbox" USING btree ("appointment_id");