CREATE TYPE "public"."garment_slot" AS ENUM('haut', 'bas', 'chaussures');--> statement-breakpoint
CREATE TYPE "public"."garment_type" AS ENUM('haut', 'bas', 'robe');--> statement-breakpoint
CREATE TABLE "garment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"slot" "garment_slot" NOT NULL,
	"image_url" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "garment_type" "garment_type";--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "outfit" jsonb;--> statement-breakpoint
ALTER TABLE "garment_items" ADD CONSTRAINT "garment_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;