-- TASK-036: Add email and password_hash to Company table
-- This allows company self-registration

-- Step 1: Add columns (nullable first for existing data)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "email" VARCHAR(254);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(128);

-- Step 2: For existing companies without email, generate a placeholder
-- (In production, you might want to handle this differently)
UPDATE "Company"
SET "email" = 'placeholder_' || id || '@example.com'
WHERE "email" IS NULL;

UPDATE "Company"
SET "password_hash" = '$2b$10$placeholder'
WHERE "password_hash" IS NULL;

-- Step 3: Make columns NOT NULL and add unique constraint on email
ALTER TABLE "Company" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "password_hash" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Company_email_key" ON "Company"("email");

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_company_email" ON "Company"("email");
CREATE INDEX IF NOT EXISTS "idx_company_is_approved" ON "Company"("is_approved");
