ALTER TABLE "agent_session" ALTER COLUMN "environment_id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "scheduled_task" ALTER COLUMN "environment_id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "skill" ALTER COLUMN "environment_id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "environment" ADD COLUMN "agent_config_id" uuid;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_agent_config_id_agent_config_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_config"("id") ON DELETE set null ON UPDATE no action;