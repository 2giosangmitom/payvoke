import { Migration } from "@mikro-orm/migrations";

export class Migration20261018010000 extends Migration {
  override name = "Migration20261018010000";
  override up(): void {
    this.addSql(
      `create table "provider_profiles" ("id" uuid not null, "display_name" varchar(100) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "provider_profiles" add constraint "provider_profiles_id_foreign" foreign key ("id") references "app_users" ("id") on delete cascade;`,
    );
    this.addSql(
      `create table "agent_listings" ("id" uuid not null, "provider_id" uuid not null, "published_version_id" uuid null, "paused" boolean not null default true, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "agent_listings_provider_id_index" on "agent_listings" ("provider_id");`,
    );
    this.addSql(
      `alter table "agent_listings" add constraint "agent_listings_provider_id_foreign" foreign key ("provider_id") references "provider_profiles" ("id") on delete cascade;`,
    );
    this.addSql(
      `create table "manifest_versions" ("id" uuid not null, "listing_id" uuid not null, "manifest" jsonb not null, "digest" varchar(64) not null, "state" varchar(16) not null default 'draft', "reviewed_by" varchar(100) null, "review_note" text null, "reviewed_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "manifest_versions_listing_id_index" on "manifest_versions" ("listing_id");`,
    );
    this.addSql(
      `alter table "manifest_versions" add constraint "manifest_versions_listing_id_foreign" foreign key ("listing_id") references "agent_listings" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "manifest_versions" add constraint "manifest_versions_check" check (state in ('draft', 'submitted', 'approved', 'rejected'));`,
    );
    for (const table of ["provider_profiles", "agent_listings", "manifest_versions"]) {
      this.addSql(`alter table "${table}" enable row level security;`);
      this.addSql(`revoke all on table public."${table}" from public;`);
      this
        .addSql(`do $$ declare r text; begin foreach r in array array['anon', 'authenticated'] loop
        if exists (select from pg_roles where rolname = r) then execute format('revoke all on table public.%I from %I', '${table}', r); end if;
        end loop; end $$;`);
    }
  }
  override down(): void {
    this.addSql(`drop table "manifest_versions";`);
    this.addSql(`drop table "agent_listings";`);
    this.addSql(`drop table "provider_profiles";`);
  }
}
