import type { Prisma } from "@payvoke/db";
import { availabilityLabel } from "./schema";

type Revision = {
  id: string;
  options: Prisma.JsonValue;
  inputSchema: Prisma.JsonValue;
  outputSchema: Prisma.JsonValue | null;
  positionalParameter: string | null;
  grossAmount: Prisma.Decimal | null;
  minGrossAmount: Prisma.Decimal | null;
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
        grossAmount: amount(revision.grossAmount),
        minGrossAmount: amount(revision.minGrossAmount),
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

type Priced = {
  activeRevision: Pick<Revision, "grossAmount" | "minGrossAmount" | "maxGrossAmount"> | null;
};
const atomic = (values: (Prisma.Decimal | null | undefined)[]) =>
  values
    .filter((value): value is Prisma.Decimal => Boolean(value))
    .map((v) => BigInt(v.toFixed(0)));
const min = (values: bigint[]) =>
  values.length ? values.reduce((a, b) => (b < a ? b : a)).toString() : null;
const max = (values: bigint[]) =>
  values.length ? values.reduce((a, b) => (b > a ? b : a)).toString() : null;

// Lowest fixed (TOOL) command price as a base-unit integer string.
export function fromPrice(commands: Priced[]) {
  return min(atomic(commands.map((command) => command.activeRevision?.grossAmount)));
}

// Range across an AGENT app's commands; null when nothing is published.
export function priceRange(commands: Priced[]) {
  const low = min(atomic(commands.map((command) => command.activeRevision?.minGrossAmount)));
  const high = max(atomic(commands.map((command) => command.activeRevision?.maxGrossAmount)));
  return low && high ? { min: low, max: high } : null;
}
