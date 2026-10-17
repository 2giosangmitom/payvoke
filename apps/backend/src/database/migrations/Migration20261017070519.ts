import { Migration } from "@mikro-orm/migrations";

export class Migration20261017070519 extends Migration {
  override name = "Migration20261017070519";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "app_users" ("id" uuid not null, "display_name" varchar(100) null, "avatar_url" varchar(2048) null, "status" varchar(16) not null default 'active', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(
      `alter table "app_users" add constraint "app_users_check" check (status in ('active', 'suspended'));`,
    );
    this.addSql(`alter table "app_users" enable row level security;`);
    this.addSql(`revoke all on table public.app_users from public;`);
    this.addSql(`do $$ declare r text; begin
      foreach r in array array['anon', 'authenticated'] loop
        if exists (select from pg_roles where rolname = r) then
          execute format('revoke all on table public.app_users from %I', r);
        end if;
      end loop;
    end $$;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "app_users" cascade;`);
  }
}
