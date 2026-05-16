ALTER TABLE "skill" ADD COLUMN "agent_config_id" uuid;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_agent_config_id_agent_config_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_skill_agent_config" ON "skill" USING btree ("agent_config_id");