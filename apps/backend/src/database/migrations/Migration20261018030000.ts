import { Migration } from "@mikro-orm/migrations";

/** Additive: legacy HTTP manifests and existing sandbox invocations remain valid. */
export class Migration20261018030000 extends Migration {
  override name = "Migration20261018030000";
  override up(): void {
    this.addSql(
      `alter table provider_command_invocations add conversation_id uuid null, add listing_version_id uuid null;`,
    );
    this.addSql(
      `alter table provider_command_invocations add constraint provider_command_invocations_conversation_id_foreign foreign key (conversation_id) references conversations(id) on delete cascade;`,
    );
    this.addSql(
      `alter table provider_command_invocations add constraint provider_command_invocations_listing_version_id_foreign foreign key (listing_version_id) references manifest_versions(id) on delete cascade;`,
    );
    this.addSql(
      `create index provider_command_invocations_conversation_id_index on provider_command_invocations(conversation_id);`,
    );
  }
  override down(): void {
    this.addSql(
      `alter table provider_command_invocations drop column conversation_id, drop column listing_version_id;`,
    );
  }
}
