import { Migration } from "@mikro-orm/migrations";

export class Migration20261018050000 extends Migration {
  override name = "Migration20261018050000";
  override up(): void {
    this.addSql(
      `create table "verification_text_results" ("id" uuid not null, "owner_id" uuid not null, "application_id" uuid not null, "revision_id" uuid not null, "listing_version_id" uuid null, "terminal_digest" varchar(64) not null, "text" text not null, "digest" varchar(64) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "verification_text_results_owner_id_index" on "verification_text_results" ("owner_id");`,
    );
    this.addSql(
      `alter table "verification_text_results" add constraint "verification_text_results_id_foreign" foreign key ("id") references "provider_command_invocations" ("id") on update cascade on delete cascade;`,
    );
    this.addSql(
      `alter table "verification_text_results" add constraint "verification_text_results_owner_id_foreign" foreign key ("owner_id") references "app_users" ("id") on delete cascade;`,
    );
    this.addSql(`alter table "verification_text_results" enable row level security;`);
    this.addSql(`revoke all on table public."verification_text_results" from public;`);
    this.addSql(
      `do $$ declare r text; begin foreach r in array array['anon', 'authenticated'] loop if exists (select from pg_roles where rolname = r) then execute format('revoke all on table public.%I from %I', 'verification_text_results', r); end if; end loop; end $$;`,
    );
  }
  override down(): void {
    this.addSql(`drop table "verification_text_results";`);
  }
}
