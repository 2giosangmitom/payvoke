import type { Prisma } from "@payvoke/db";
import { availabilityLabel } from "./schema";

type Revision = {
  id: string;
  options: Prisma.JsonValue;
  inputSchema: Prisma.JsonValue;
  outputSchema: Prisma.JsonValue | null;
  positionalParameter: string | null;
  grossAmount: Prisma.Decimal;
  terms: Prisma.JsonValue;
  deliverySeconds: number;
  reviewSeconds: number;
  createdAt: Date;
};
type Command = {
  id: string;
  name: string;
  description: string;
  activeRevision: Revision | null;
};

// Decimal prices leave the API as base-unit integer strings.
export function serializeRevision(revision: Revision | null) {
  return revision ? { ...revision, grossAmount: revision.grossAmount.toFixed(0) } : null;
}

// Buyer-facing command: no lifecycle timestamps.
export function serializeCommand(command: Command) {
  return {
    id: command.id,
    name: command.name,
    description: command.description,
    revision: serializeRevision(command.activeRevision),
  };
}

// Owner-facing command, including archive and edit timestamps.
export function serializeOwnedCommand(
  command: Command & { archivedAt: Date | null; createdAt: Date; updatedAt: Date },
) {
  return {
    id: command.id,
    name: command.name,
    description: command.description,
    archivedAt: command.archivedAt,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    revision: serializeRevision(command.activeRevision),
  };
}

export function serializeOwnedApp<
  T extends { status: string; lastHeartbeatAt: Date | null; defaultCommandId: string | null },
>(app: T) {
  return { ...app, availability: availabilityLabel(app) };
}

// Lowest active command price as a base-unit integer string.
export function fromPrice(commands: { activeRevision: { grossAmount: Prisma.Decimal } | null }[]) {
  const prices = commands
    .map((command) => command.activeRevision?.grossAmount)
    .filter((price): price is Prisma.Decimal => Boolean(price))
    .map((price) => BigInt(price.toFixed(0)));
  return prices.length
    ? prices.reduce((min, price) => (price < min ? price : min)).toString()
    : null;
}
