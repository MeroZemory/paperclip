CREATE TABLE "agent_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"state" text DEFAULT 'joined' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"state" text DEFAULT 'joined' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memberships" ADD CONSTRAINT "agent_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memberships" ADD CONSTRAINT "agent_memberships_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memberships_company_user_idx" ON "agent_memberships" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_memberships_agent_idx" ON "agent_memberships" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memberships_company_user_agent_uq" ON "agent_memberships" USING btree ("company_id","user_id","agent_id");--> statement-breakpoint
CREATE INDEX "project_memberships_company_user_idx" ON "project_memberships" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "project_memberships_project_idx" ON "project_memberships" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_memberships_company_user_project_uq" ON "project_memberships" USING btree ("company_id","user_id","project_id");
