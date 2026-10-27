import type { Prisma } from "@payvoke/db";
import { availabilityLabel } from "./schema";

type Revision = {
  id: string;
  options: Prisma.JsonValue;
  inputSchema: Prisma.JsonValue;
  outputSchema: Prisma.JsonValue | null;
  positionalParameter: string | null;
  maxGrossAmount: Prisma.Decimal | null;
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

const amount = (value: Prisma.Decimal | null) => value?.toFixed(0) ?? null;

// Decimal prices leave the API as base-unit integer strings.
export function serializeRevision(revision: Revision | null) {
  return revision
    ? {
        ...revision,
        maxGrossAmount: amount(revision.maxGrossAmount),
      }
    : null;
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

type Capped = { activeRevision: Pick<Revision, "maxGrossAmount"> | null };

// The most any offer of this app may cost: the highest command cap, or null
// when a command has no cap (or there is no command).
export function priceCap(commands: Capped[]) {
  const caps = commands.map((command) => command.activeRevision?.maxGrossAmount ?? null);
  if (!caps.length || caps.some((cap) => cap === null)) return null;
  return caps
    .map((cap) => BigInt(cap!.toFixed(0)))
    .reduce((a, b) => (b > a ? b : a))
    .toString();
}
