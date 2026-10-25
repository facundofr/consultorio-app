CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limits_window_ends_idx" ON "rate_limits" USING btree ("window_ends_at");