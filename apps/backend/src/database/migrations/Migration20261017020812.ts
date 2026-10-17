import { Migration } from "@mikro-orm/migrations";

export class Migration20261017020812 extends Migration {
  override name = "Migration20261017020812";

  override up(): void | Promise<void> {
    this.addSql(`create schema if not exists "identity";`);
    this.addSql(`revoke all on schema "identity" from public;`);
    this.addSql(
      `create table "identity"."app_users" ("id" uuid not null, "display_name" varchar(100) null, "avatar_url" varchar(2048) null, "status" varchar(16) not null default 'active', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "identity"."application_sessions" ("id" uuid not null, "user_id" uuid not null, "subject_id" uuid not null, "created_at" timestamptz not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "application_sessions_user_id_index" on "identity"."application_sessions" ("user_id");`,
    );

    this.addSql(
      `create table "identity"."auth_challenges" ("id" uuid not null, "purpose" varchar(24) not null, "identifier" varchar(254) not null, "message" text null, "user_id" uuid null, "session_id" uuid null, "expires_at" timestamptz not null, "consumed_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "identity"."auth_identities" ("id" uuid not null, "subject_id" uuid not null, "user_id" uuid not null, "method" varchar(16) not null, "identifier" varchar(254) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "identity"."auth_identities" add constraint "auth_identities_subject_id_unique" unique ("subject_id");`,
    );
    this.addSql(
      `create index "auth_identities_user_id_index" on "identity"."auth_identities" ("user_id");`,
    );
    this.addSql(
      `alter table "identity"."auth_identities" add constraint "auth_identities_method_identifier_unique" unique ("method", "identifier");`,
    );

    this.addSql(
      `create table "identity"."auth_rate_limits" ("key" varchar(64) not null, "count" int not null default 1, "expires_at" timestamptz not null, primary key ("key"));`,
    );

    this.addSql(
      `create table "identity"."audit_events" ("id" uuid not null, "actor_id" uuid not null, "action" varchar(64) not null, "target" varchar(254) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "audit_events_actor_id_index" on "identity"."audit_events" ("actor_id");`,
    );

    this.addSql(
      `create table "identity"."project_memberships" ("id" uuid not null, "project_id" uuid not null, "user_id" uuid not null, "role" varchar(16) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "project_memberships_user_id_index" on "identity"."project_memberships" ("user_id");`,
    );
    this.addSql(
      `alter table "identity"."project_memberships" add constraint "project_memberships_project_id_user_id_unique" unique ("project_id", "user_id");`,
    );

    this.addSql(
      `alter table "identity"."app_users" add constraint "app_users_check" check (status in ('active', 'suspended'));`,
    );
    this.addSql(`alter table "identity"."app_users" enable row level security;`);

    this.addSql(
      `alter table "identity"."application_sessions" add constraint "application_sessions_user_id_foreign" foreign key ("user_id") references "identity"."app_users" ("id") on delete restrict;`,
    );
    this.addSql(`alter table "identity"."application_sessions" enable row level security;`);

    this.addSql(
      `alter table "identity"."auth_challenges" add constraint "auth_challenges_user_id_foreign" foreign key ("user_id") references "identity"."app_users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "identity"."auth_challenges" add constraint "auth_challenges_check" check (purpose in ('email-login', 'wallet-login', 'email-link', 'wallet-link'));`,
    );
    this.addSql(`alter table "identity"."auth_challenges" enable row level security;`);

    this.addSql(
      `alter table "identity"."auth_identities" add constraint "auth_identities_user_id_foreign" foreign key ("user_id") references "identity"."app_users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "identity"."auth_identities" add constraint "auth_identities_check" check (method in ('email', 'wallet') and identifier = lower(identifier));`,
    );
    this.addSql(`alter table "identity"."auth_identities" enable row level security;`);

    this.addSql(`alter table "identity"."auth_rate_limits" enable row level security;`);

    this.addSql(
      `alter table "identity"."audit_events" add constraint "audit_events_actor_id_foreign" foreign key ("actor_id") references "identity"."app_users" ("id") on delete restrict;`,
    );
    this.addSql(`alter table "identity"."audit_events" enable row level security;`);

    this.addSql(
      `alter table "identity"."project_memberships" add constraint "project_memberships_user_id_foreign" foreign key ("user_id") references "identity"."app_users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "identity"."project_memberships" add constraint "project_memberships_check" check (role in ('owner', 'editor', 'viewer'));`,
    );
    this.addSql(`alter table "identity"."project_memberships" enable row level security;`);
    // Supabase may have default grants configured. Do not expose any M01 table to browser roles.
    this.addSql(`do $$ declare r text; begin
      foreach r in array array['anon', 'authenticated'] loop
        if exists (select from pg_roles where rolname = r) then
          execute format('revoke all on schema identity from %I', r);
          execute format('revoke all on all tables in schema identity from %I', r);
        end if;
      end loop;
    end $$;`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "identity"."application_sessions" drop constraint "application_sessions_user_id_foreign";`,
    );
    this.addSql(
      `alter table "identity"."auth_challenges" drop constraint "auth_challenges_user_id_foreign";`,
    );
    this.addSql(
      `alter table "identity"."auth_identities" drop constraint "auth_identities_user_id_foreign";`,
    );
    this.addSql(
      `alter table "identity"."audit_events" drop constraint "audit_events_actor_id_foreign";`,
    );
    this.addSql(
      `alter table "identity"."project_memberships" drop constraint "project_memberships_user_id_foreign";`,
    );

    this.addSql(`drop table if exists "identity"."app_users" cascade;`);
    this.addSql(`drop table if exists "identity"."application_sessions" cascade;`);
    this.addSql(`drop table if exists "identity"."auth_challenges" cascade;`);
    this.addSql(`drop table if exists "identity"."auth_identities" cascade;`);
    this.addSql(`drop table if exists "identity"."auth_rate_limits" cascade;`);
    this.addSql(`drop table if exists "identity"."audit_events" cascade;`);
    this.addSql(`drop table if exists "identity"."project_memberships" cascade;`);

    this.addSql(`drop schema if exists "identity";`);
  }
}
