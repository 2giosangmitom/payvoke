import { Migration } from "@mikro-orm/migrations";

export class Migration20261018040000 extends Migration {
  override name = "Migration20261018040000";

  override up(): void {
    this.addSql(
      `create table "commerce_quotes" ("id" uuid not null, "buyer_id" uuid not null, "request_digest" varchar(64) not null, "terms" jsonb not null, "digest" varchar(64) not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(`create index "commerce_quotes_buyer_id_index" on "commerce_quotes" ("buyer_id");`);
    this.addSql(
      `create table "commerce_orders" ("id" uuid not null, "buyer_id" uuid not null, "operation_id" uuid not null, "quote_id" uuid not null, "quote_digest" varchar(64) not null, "status" varchar(32) not null default 'pending_admission', "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(`create index "commerce_orders_buyer_id_index" on "commerce_orders" ("buyer_id");`);
    this.addSql(
      `alter table "commerce_orders" add constraint "commerce_orders_buyer_id_operation_id_unique" unique ("buyer_id", "operation_id");`,
    );
    this.addSql(
      `alter table "commerce_orders" add constraint "commerce_orders_quote_id_unique" unique ("quote_id");`,
    );
    this.addSql(
      `alter table "commerce_quotes" add constraint "commerce_quotes_buyer_id_foreign" foreign key ("buyer_id") references "app_users" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "commerce_orders" add constraint "commerce_orders_buyer_id_foreign" foreign key ("buyer_id") references "app_users" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "commerce_orders" add constraint "commerce_orders_quote_id_foreign" foreign key ("quote_id") references "commerce_quotes" ("id") on delete restrict;`,
    );
    for (const table of ["commerce_quotes", "commerce_orders"]) {
      this.addSql(`alter table "${table}" enable row level security;`);
      this.addSql(`revoke all on table public."${table}" from public;`);
      this.addSql(
        `do $$ declare r text; begin foreach r in array array['anon', 'authenticated'] loop if exists (select from pg_roles where rolname = r) then execute format('revoke all on table public.%I from %I', '${table}', r); end if; end loop; end $$;`,
      );
    }
  }

  override down(): void {
    this.addSql(`drop table "commerce_orders";`);
    this.addSql(`drop table "commerce_quotes";`);
  }
}
