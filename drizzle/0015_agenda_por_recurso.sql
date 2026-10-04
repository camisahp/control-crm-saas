-- 200 Agenda por recurso: barberos/cabinas, catálogo de servicios y qué
-- recurso ofrece qué servicio. La cita y la oferta aprenden con quién y qué.
--
-- Editada a mano sobre la generada para ser RE-EJECUTABLE (Constitución IV):
-- IF NOT EXISTS en tablas, columnas e índices, y DO-block en cada clave
-- foránea.
--
-- ADITIVA: tablas nuevas y columnas NULL. Lo único que se reemplaza es el
-- candado anti doble-booking, que pasa a ser POR RECURSO. Con todas las citas
-- existentes sin recurso (`coalesce` a ''), el índice nuevo exige exactamente
-- lo mismo que el viejo — por eso se crea ANTES de soltar el anterior y no hay
-- un instante sin candado ni datos que puedan violarlo.

CREATE TABLE IF NOT EXISTS "agenda_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"weekly_hours" jsonb,
	"color" text,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agenda_service" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer,
	"description" text,
	"instructions" text,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agenda_resource_service" (
	"resource_id" text NOT NULL,
	"service_id" text NOT NULL,
	"organization_id" text NOT NULL,
	CONSTRAINT "agenda_resource_service_resource_id_service_id_pk" PRIMARY KEY("resource_id","service_id")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "resource_id" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "service_id" text;--> statement-breakpoint
ALTER TABLE "offered_slot" ADD COLUMN IF NOT EXISTS "resource_id" text;--> statement-breakpoint
ALTER TABLE "offered_slot" ADD COLUMN IF NOT EXISTS "service_id" text;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "agenda_resource" ADD CONSTRAINT "agenda_resource_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "agenda_service" ADD CONSTRAINT "agenda_service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "agenda_resource_service" ADD CONSTRAINT "agenda_resource_service_resource_id_agenda_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."agenda_resource"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "agenda_resource_service" ADD CONSTRAINT "agenda_resource_service_service_id_agenda_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."agenda_service"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "agenda_resource_service" ADD CONSTRAINT "agenda_resource_service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "booking" ADD CONSTRAINT "booking_resource_id_agenda_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."agenda_resource"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "booking" ADD CONSTRAINT "booking_service_id_agenda_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."agenda_service"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "offered_slot" ADD CONSTRAINT "offered_slot_resource_id_agenda_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."agenda_resource"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "offered_slot" ADD CONSTRAINT "offered_slot_service_id_agenda_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."agenda_service"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agenda_resource_org_pos_idx" ON "agenda_resource" USING btree ("organization_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_service_org_pos_idx" ON "agenda_service" USING btree ("organization_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_resource_service_org_idx" ON "agenda_resource_service" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_org_resource_when_idx" ON "booking" USING btree ("organization_id","resource_id","scheduled_at");--> statement-breakpoint

-- El candado nuevo, por recurso; el viejo se suelta DESPUÉS.
CREATE UNIQUE INDEX IF NOT EXISTS "booking_org_resource_active_slot_uq" ON "booking" USING btree ("organization_id",coalesce("resource_id", ''),"scheduled_at") WHERE "booking"."status" in ('agendada','realizada') and "booking"."is_test" = false;--> statement-breakpoint
DROP INDEX IF EXISTS "booking_org_active_slot_uq";


