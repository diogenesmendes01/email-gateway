-- TASK-016: Add domain warm-up fields
-- Enables gradual email volume increase to build sender reputation with ESPs

-- Add warmupEnabled field (default false)
ALTER TABLE "domains" ADD COLUMN "warmup_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Add warmupStartDate field (nullable, set when warm-up begins)
ALTER TABLE "domains" ADD COLUMN "warmup_start_date" TIMESTAMP(3);

-- Add comment to fields for documentation
COMMENT ON COLUMN "domains"."warmup_enabled" IS
'Whether domain is in warm-up mode with gradual volume limits';

COMMENT ON COLUMN "domains"."warmup_start_date" IS
'Date when warm-up period started. Used to calculate current warm-up day.';

COMMENT ON COLUMN "domains"."warmup_config" IS
'Optional JSON configuration for custom warm-up schedules';
