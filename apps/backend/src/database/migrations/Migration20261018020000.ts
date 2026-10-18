import { Migration } from "@mikro-orm/migrations";

export class Migration20261018020000 extends Migration {
  override name = "Migration20261018020000";
  override up(): void {
    this.addSql(
      `create table provider_applications (id uuid primary key, provider_id uuid not null references provider_profiles(id) on delete cascade, name varchar(100) not null, current_revision_id uuid null, session_id uuid null, session_expires_at timestamptz null, created_at timestamptz not null);`,
    );
    this.addSql(
      `create index provider_applications_provider_id_index on provider_applications(provider_id);`,
    );
    this.addSql(
      `create table provider_api_keys (id uuid primary key, application_id uuid not null references provider_applications(id) on delete cascade, label varchar(100) not null, hash varchar(64) not null, prefix varchar(12) not null, scopes jsonb not null, expires_at timestamptz not null, revoked_at timestamptz null, created_at timestamptz not null, constraint provider_api_keys_hash_unique unique(hash));`,
    );
    this.addSql(
      `create index provider_api_keys_application_id_index on provider_api_keys(application_id);`,
    );
    this.addSql(
      `create table provider_command_revisions (id uuid primary key, application_id uuid not null references provider_applications(id) on delete cascade, digest varchar(64) not null, commands jsonb not null, created_at timestamptz not null, constraint provider_command_revisions_application_id_digest_unique unique(application_id, digest));`,
    );
    this.addSql(
      `create index provider_command_revisions_application_id_index on provider_command_revisions(application_id);`,
    );
    this.addSql(
      `create table provider_command_invocations (id uuid primary key, application_id uuid not null references provider_applications(id) on delete cascade, revision_id uuid not null references provider_command_revisions(id) on delete cascade, command varchar(32) not null, input jsonb not null, executor_id uuid null, state varchar(16) not null default 'queued', progress text null, result text null, terminal_digest varchar(64) null, deadline_at timestamptz not null, created_at timestamptz not null, constraint provider_command_invocations_check check (state in ('queued', 'running', 'completed', 'failed', 'uncertain')));`,
    );
    for (const [table, column] of [
      ["provider_applications", "provider_id"],
      ["provider_api_keys", "application_id"],
      ["provider_command_revisions", "application_id"],
      ["provider_command_invocations", "application_id"],
      ["provider_command_invocations", "revision_id"],
    ])
      this.addSql(
        `alter table ${table} rename constraint ${table}_${column}_fkey to ${table}_${column}_foreign;`,
      );
    this.addSql(
      `create index provider_command_invocations_application_id_index on provider_command_invocations(application_id);`,
    );
    for (const table of [
      "provider_applications",
      "provider_api_keys",
      "provider_command_revisions",
      "provider_command_invocations",
    ]) {
      this.addSql(
        `alter table "${table}" enable row level security; revoke all on table public."${table}" from public;`,
      );
      this.addSql(
        `do $$ declare r text; begin foreach r in array array['anon', 'authenticated'] loop if exists (select from pg_roles where rolname = r) then execute format('revoke all on table public.%I from %I', '${table}', r); end if; end loop; end $$;`,
      );
    }
  }
  override down(): void {
    for (const table of [
      "provider_command_invocations",
      "provider_command_revisions",
      "provider_api_keys",
      "provider_applications",
    ])
      this.addSql(`drop table "${table}";`);
  }
}
