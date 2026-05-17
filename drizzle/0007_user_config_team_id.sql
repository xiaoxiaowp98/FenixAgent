-- Add team_id column to user_config table (was missing from previous migration)
ALTER TABLE "user_config" ADD COLUMN "team_id" uuid REFERENCES "team"("id") ON DELETE CASCADE;
-- Backfill from user's first owned team
UPDATE "user_config" uc SET "team_id" = (
  SELECT t.id FROM "team" t
  INNER JOIN "team_member" tm ON tm."team_id" = t.id
  WHERE tm."user_id" = uc."user_id" AND tm."role" = 'owner'
  LIMIT 1
) WHERE "team_id" IS NULL;
-- Make NOT NULL and set as primary key
ALTER TABLE "user_config" ALTER COLUMN "team_id" SET NOT NULL;
ALTER TABLE "user_config" DROP CONSTRAINT IF EXISTS "user_config_pkey";
ALTER TABLE "user_config" ADD PRIMARY KEY ("team_id");

-- Fix unique indexes (were created as regular INDEX instead of UNIQUE INDEX)
-- Also drop old user-based unique indexes that conflict with new team-based ones
DROP INDEX IF EXISTS "idx_provider_user_name";
DROP INDEX IF EXISTS "idx_agent_config_user_name";
DROP INDEX IF EXISTS "idx_mcp_server_user_name";
DROP INDEX IF EXISTS "idx_knowledge_base_user_slug";

DROP INDEX IF EXISTS "idx_provider_team_name";
CREATE UNIQUE INDEX "idx_provider_team_name" ON "provider" ("team_id", "name");
DROP INDEX IF EXISTS "idx_agent_config_team_name";
CREATE UNIQUE INDEX "idx_agent_config_team_name" ON "agent_config" ("team_id", "name");
DROP INDEX IF EXISTS "idx_mcp_server_team_name";
CREATE UNIQUE INDEX "idx_mcp_server_team_name" ON "mcp_server" ("team_id", "name");
