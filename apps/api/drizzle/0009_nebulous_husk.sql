CREATE TYPE "public"."scene_preset_slot" AS ENUM('surface', 'background', 'accessoires');--> statement-breakpoint
CREATE TABLE "scene_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"slot" "scene_preset_slot" NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_presets_shop_slot_text_unique" UNIQUE("shop_id","slot","text")
);
--> statement-breakpoint
ALTER TABLE "scene_presets" ADD CONSTRAINT "scene_presets_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;