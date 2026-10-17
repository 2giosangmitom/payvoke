import { Migration } from "@mikro-orm/migrations";

export class Migration20261017100000 extends Migration {
  override name = "Migration20261017100000";

  override up(): void {
    this.addSql(
      `create table "workspaces" ("id" uuid not null, "owner_id" uuid not null, "title" varchar(100) not null, "brief" text not null default '', "revision" int not null default 0, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(`create index "workspaces_owner_id_index" on "workspaces" ("owner_id");`);
    this.addSql(
      `create table "conversations" ("id" uuid not null, "workspace_id" uuid not null, "title" varchar(100) not null, "revision" int not null default 0, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "conversations_workspace_id_index" on "conversations" ("workspace_id");`,
    );
    this.addSql(
      `create table "conversation_turns" ("id" uuid not null, "conversation_id" uuid not null, "run_id" varchar(100) not null, "message_id" varchar(100) not null, "input" text not null, "revision" int not null, "messages" jsonb not null, "events" jsonb not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "conversation_turns_conversation_id_index" on "conversation_turns" ("conversation_id");`,
    );
    this.addSql(
      `alter table "conversation_turns" add constraint "conversation_turns_conversation_id_run_id_unique" unique ("conversation_id", "run_id");`,
    );
    this.addSql(
      `alter table "conversation_turns" add constraint "conversation_turns_conversation_id_message_id_unique" unique ("conversation_id", "message_id");`,
    );
    this.addSql(
      `alter table "conversation_turns" add constraint "conversation_turns_conversation_id_revision_unique" unique ("conversation_id", "revision");`,
    );
    this.addSql(
      `alter table "workspaces" add constraint "workspaces_owner_id_foreign" foreign key ("owner_id") references "app_users" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "conversations" add constraint "conversations_workspace_id_foreign" foreign key ("workspace_id") references "workspaces" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "conversation_turns" add constraint "conversation_turns_conversation_id_foreign" foreign key ("conversation_id") references "conversations" ("id") on delete cascade;`,
    );
    for (const table of ["workspaces", "conversations", "conversation_turns"]) {
      this.addSql(`alter table "${table}" enable row level security;`);
      this.addSql(`revoke all on table public."${table}" from public;`);
      this.addSql(`do $$ declare r text; begin
        foreach r in array array['anon', 'authenticated'] loop
          if exists (select from pg_roles where rolname = r) then
            execute format('revoke all on table public.%I from %I', '${table}', r);
          end if;
        end loop;
      end $$;`);
    }
  }

  override down(): void {
    this.addSql(`drop table "conversation_turns";`);
    this.addSql(`drop table "conversations";`);
    this.addSql(`drop table "workspaces";`);
  }
}
