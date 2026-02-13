CREATE TABLE "append_list_person" (
	"id" text PRIMARY KEY NOT NULL,
	"append_list_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "append_list_table" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"list_owner" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "append_list_person" ADD CONSTRAINT "append_list_person_append_list_id_append_list_table_id_fk" FOREIGN KEY ("append_list_id") REFERENCES "public"."append_list_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "append_list_table" ADD CONSTRAINT "append_list_table_list_owner_user_id_fk" FOREIGN KEY ("list_owner") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
