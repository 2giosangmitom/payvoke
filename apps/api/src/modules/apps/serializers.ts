import type { Prisma } from "#core/db";
import { availabilityLabel, type CommandOption, type CommandTerms } from "./schema";

type Revision = {
  id: string;
  options: Prisma.JsonValue;
  inputSchema: Prisma.JsonValue;
  outputSchema: Prisma.JsonValue | null;
  positionalParameter: string | null;
  maxGrossAmount: Prisma.Decimal | null;
  instantGrossAmount: Prisma.Decimal | null;
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

// Decimal prices leave the API as base-unit integer strings. Options and terms
// are stored only after validation, so their JSON has these shapes.
export function serializeRevision(revision: Revision | null) {
  return revision
    ? {
        ...revision,
        options: revision.options as CommandOption[],
        terms: revision.terms as CommandTerms,
        maxGrossAmount: amount(revision.maxGrossAmount),
        instantGrossAmount: amount(revision.instantGrossAmount),
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

// The agent's picture as an API path, versioned by its storage key so a new
// upload is a new URL. Null when the agent has none.
export function imageUrl(app: { id: string; imageKey: string | null }) {
  return app.imageKey ? `/v1/apps/${app.id}/image?v=${app.imageKey.slice(-12)}` : null;
}

export function serializeOwnedApp<
  T extends {
    id: string;
    status: string;
    lastHeartbeatAt: Date | null;
    defaultCommandId: string | null;
    imageKey: string | null;
    imageType: string | null;
  },
>({ imageKey, imageType: _type, ...app }: T) {
  return {
    ...app,
    imageUrl: imageUrl({ id: app.id, imageKey }),
    availability: availabilityLabel(app),
  };
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
