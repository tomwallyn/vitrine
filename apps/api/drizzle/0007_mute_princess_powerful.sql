CREATE TYPE "public"."scene_lighting" AS ENUM('douce', 'doree', 'contrastee');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('vetement', 'objet');--> statement-breakpoint
ALTER TYPE "public"."render_type" ADD VALUE 'studio_uni';--> statement-breakpoint
ALTER TYPE "public"."render_type" ADD VALUE 'texture';--> statement-breakpoint
ALTER TYPE "public"."render_type" ADD VALUE 'mise_en_situation';--> statement-breakpoint
ALTER TYPE "public"."render_type" ADD VALUE 'ambiance';--> statement-breakpoint
ALTER TYPE "public"."render_type" ADD VALUE 'macro';--> statement-breakpoint
ALTER TYPE "public"."render_type" ADD VALUE 'exterieur';--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "subject_type" "subject_type" DEFAULT 'vetement' NOT NULL;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "lighting" "scene_lighting";--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "scene" jsonb;