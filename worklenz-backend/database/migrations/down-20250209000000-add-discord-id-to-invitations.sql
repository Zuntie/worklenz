-- Rollback: Remove discord_id from email_invitations table
-- Date: 2025-02-09

BEGIN;

-- Drop unique index
DROP INDEX IF EXISTS email_invitations_discord_id_unique_idx;

-- Drop constraint
ALTER TABLE email_invitations
DROP CONSTRAINT IF EXISTS email_invitations_discord_id_format_check;

-- Drop column
ALTER TABLE email_invitations
DROP COLUMN IF EXISTS discord_id;

COMMIT;

-- Verification
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'email_invitations'
        AND column_name = 'discord_id'
    ) THEN
        RAISE NOTICE 'Rollback successful: discord_id column removed';
    ELSE
        RAISE EXCEPTION 'Rollback failed: discord_id column still exists';
    END IF;
END $$;
