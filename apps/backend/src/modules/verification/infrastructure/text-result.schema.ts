import { EntitySchema } from "@mikro-orm/core";
import { TextResult } from "../domain/text-result.js";

export const TextResultSchema = new EntitySchema({
  class: TextResult,
  tableName: "verification_text_results",
  rowLevelSecurity: true,
  properties: {
    id: {
      kind: "m:1",
      type: "CommandInvocation",
      fieldName: "id",
      mapToPk: true,
      primary: true,
      deleteRule: "cascade",
    },
    ownerId: {
      kind: "m:1",
      type: "AppUser",
      fieldName: "owner_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    applicationId: { type: "uuid" },
    revisionId: { type: "uuid" },
    listingVersionId: { type: "uuid", nullable: true },
    terminalDigest: { type: "string", length: 64 },
    text: { type: "text" },
    digest: { type: "string", length: 64 },
    createdAt: { type: "datetime" },
  },
});
