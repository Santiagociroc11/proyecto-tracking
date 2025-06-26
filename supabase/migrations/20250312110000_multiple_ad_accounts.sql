-- Allow multiple ad accounts per product
-- Migration timestamp: 20250312110000

-- Step 1: Remove the direct reference from products table
ALTER TABLE "public"."products" DROP COLUMN IF EXISTS "meta_ad_account_id";

-- Step 2: Create a junction table for many-to-many relationship
CREATE TABLE "public"."product_ad_accounts" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "product_id" uuid NOT NULL REFERENCES "public"."products"("id") ON DELETE CASCADE,
    "ad_account_id" text NOT NULL REFERENCES "public"."meta_ad_accounts"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Step 3: Create unique constraint to prevent duplicates
CREATE UNIQUE INDEX "product_ad_accounts_unique" ON "public"."product_ad_accounts" ("product_id", "ad_account_id");

-- Step 4: Create indexes for better performance
CREATE INDEX "idx_product_ad_accounts_product_id" ON "public"."product_ad_accounts" ("product_id");
CREATE INDEX "idx_product_ad_accounts_ad_account_id" ON "public"."product_ad_accounts" ("ad_account_id");

-- Step 5: Update ad_spend table to reference the junction table
ALTER TABLE "public"."ad_spend" 
DROP CONSTRAINT IF EXISTS "ad_spend_product_id_fkey",
ADD COLUMN "product_ad_account_id" uuid REFERENCES "public"."product_ad_accounts"("id") ON DELETE CASCADE;

-- Step 6: Create index for the new foreign key
CREATE INDEX "idx_ad_spend_product_ad_account_id" ON "public"."ad_spend" ("product_ad_account_id");

-- Step 7: Add RLS policies
ALTER TABLE "public"."product_ad_accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their product ad accounts" ON "public"."product_ad_accounts"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."products" 
            WHERE "products"."id" = "product_ad_accounts"."product_id" 
            AND "products"."user_id" = auth.uid()
        )
    );

CREATE POLICY "Users can insert their product ad accounts" ON "public"."product_ad_accounts"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."products" 
            WHERE "products"."id" = "product_ad_accounts"."product_id" 
            AND "products"."user_id" = auth.uid()
        )
    );

CREATE POLICY "Users can update their product ad accounts" ON "public"."product_ad_accounts"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "public"."products" 
            WHERE "products"."id" = "product_ad_accounts"."product_id" 
            AND "products"."user_id" = auth.uid()
        )
    );

CREATE POLICY "Users can delete their product ad accounts" ON "public"."product_ad_accounts"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM "public"."products" 
            WHERE "products"."id" = "product_ad_accounts"."product_id" 
            AND "products"."user_id" = auth.uid()
        )
    ); 