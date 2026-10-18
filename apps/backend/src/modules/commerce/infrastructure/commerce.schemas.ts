import { EntitySchema } from "@mikro-orm/core";
import { Order, Quote } from "../domain/commerce.js";

export const QuoteSchema = new EntitySchema({
  class: Quote,
  tableName: "commerce_quotes",
  rowLevelSecurity: true,
  properties: {
    id: { type: "uuid", primary: true },
    buyerId: {
      kind: "m:1",
      type: "AppUser",
      fieldName: "buyer_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    requestDigest: { type: "string", length: 64 },
    terms: { type: "json" },
    digest: { type: "string", length: 64 },
    expiresAt: { type: "datetime" },
    createdAt: { type: "datetime" },
  },
});

export const OrderSchema = new EntitySchema({
  class: Order,
  tableName: "commerce_orders",
  rowLevelSecurity: true,
  uniques: [{ properties: ["buyerId", "operationId"] }, { properties: ["quoteId"] }],
  properties: {
    id: { type: "uuid", primary: true },
    buyerId: {
      kind: "m:1",
      type: "AppUser",
      fieldName: "buyer_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    operationId: { type: "uuid" },
    quoteId: {
      kind: "m:1",
      type: "Quote",
      fieldName: "quote_id",
      mapToPk: true,
      deleteRule: "restrict",
    },
    quoteDigest: { type: "string", length: 64 },
    status: { type: "string", length: 32 },
    createdAt: { type: "datetime" },
  },
});

export const commerceSchemas = [QuoteSchema, OrderSchema];
