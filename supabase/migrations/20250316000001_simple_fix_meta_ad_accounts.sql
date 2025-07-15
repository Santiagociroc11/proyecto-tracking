-- Simple fix for meta_ad_accounts table to support multiple users accessing same ad accounts
-- Migration timestamp: 20250316000001

-- Step 1: Add the new meta_id column
ALTER TABLE "public"."meta_ad_accounts" 
ADD COLUMN IF NOT EXISTS "meta_id" text;

-- Step 2: Populate meta_id with current id values (for existing data)
UPDATE "public"."meta_ad_accounts" 
SET meta_id = id 
WHERE meta_id IS NULL;

-- Step 3: Make meta_id not null
ALTER TABLE "public"."meta_ad_accounts" 
ALTER COLUMN "meta_id" SET NOT NULL;

-- Step 4: Change the primary key to use a UUID instead of the Meta ID
-- First, add a new UUID column
ALTER TABLE "public"."meta_ad_accounts" 
ADD COLUMN IF NOT EXISTS "uuid_id" uuid DEFAULT gen_random_uuid();

-- Step 5: Update foreign key references in product_ad_accounts
-- Add new column to reference the UUID
ALTER TABLE "public"."product_ad_accounts" 
ADD COLUMN IF NOT EXISTS "new_ad_account_id" uuid;

-- Update the references using the current id mapping
UPDATE "public"."product_ad_accounts" 
SET new_ad_account_id = meta_ad_accounts.uuid_id
FROM "public"."meta_ad_accounts"
WHERE "public"."product_ad_accounts".ad_account_id = meta_ad_accounts.id;

-- Step 6: Drop old constraints and references
ALTER TABLE "public"."product_ad_accounts" 
DROP CONSTRAINT IF EXISTS "product_ad_accounts_ad_account_id_fkey";

-- Drop old unique constraint from previous migration if it exists
DROP INDEX IF EXISTS "product_ad_accounts_unique";

-- Step 7: Replace the old columns
ALTER TABLE "public"."product_ad_accounts" 
DROP COLUMN IF EXISTS "ad_account_id";

ALTER TABLE "public"."product_ad_accounts" 
RENAME COLUMN "new_ad_account_id" TO "ad_account_id";

-- Make the new ad_account_id not null
UPDATE "public"."product_ad_accounts" 
SET ad_account_id = gen_random_uuid() 
WHERE ad_account_id IS NULL;

ALTER TABLE "public"."product_ad_accounts" 
ALTER COLUMN "ad_account_id" SET NOT NULL;

-- Step 8: Restructure meta_ad_accounts table
-- Drop the old primary key constraint
ALTER TABLE "public"."meta_ad_accounts" DROP CONSTRAINT "meta_ad_accounts_pkey";

-- Drop the old id column and rename uuid_id to id
ALTER TABLE "public"."meta_ad_accounts" DROP COLUMN "id";
ALTER TABLE "public"."meta_ad_accounts" RENAME COLUMN "uuid_id" TO "id";

-- Add new primary key
ALTER TABLE "public"."meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_pkey" PRIMARY KEY ("id");

-- Step 9: Create the new unique constraint for meta_id + user_integration_id
CREATE UNIQUE INDEX "meta_ad_accounts_user_meta_unique" ON "public"."meta_ad_accounts" ("meta_id", "user_integration_id");

-- Step 10: Recreate foreign key constraints
ALTER TABLE "public"."product_ad_accounts" 
ADD CONSTRAINT "product_ad_accounts_ad_account_id_fkey" 
FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE CASCADE;

-- Recreate the unique constraint for product_ad_accounts
CREATE UNIQUE INDEX "product_ad_accounts_unique" ON "public"."product_ad_accounts" ("product_id", "ad_account_id");

-- Step 11: Create performance indexes
CREATE INDEX IF NOT EXISTS "idx_meta_ad_accounts_meta_id" ON "public"."meta_ad_accounts" ("meta_id");
CREATE INDEX IF NOT EXISTS "idx_meta_ad_accounts_user_integration_id" ON "public"."meta_ad_accounts" ("user_integration_id");
CREATE INDEX IF NOT EXISTS "idx_product_ad_accounts_ad_account_id" ON "public"."product_ad_accounts" ("ad_account_id");
CREATE INDEX IF NOT EXISTS "idx_product_ad_accounts_product_id" ON "public"."product_ad_accounts" ("product_id");

