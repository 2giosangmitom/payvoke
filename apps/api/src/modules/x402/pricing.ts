import { fileFields } from "../apps/schema";

// Instant prices may rise with the size of the input, so a builder does not
// have to price a 10-row CSV like a 10 000-row one. The price is still fixed
// before the 402: the server measures the input and picks one tier, and the
// quote freezes that amount. Nothing the agent reports can change it.

export type InstantTier = { minInputBytes: number; amount: string };

export const MAX_INSTANT_TIERS = 5;

const atomic = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) && value.length <= 78;

// Registration shape: up to five tiers above the base price, ordered by size
// and by price, each within the command's cap. Null when there are none.
export function parseInstantTiers(
  value: unknown,
  base: string | null,
  max: string,
): InstantTier[] | null {
  if (value === undefined || value === null) return null;
  if (base === null || !Array.isArray(value) || !value.length || value.length > MAX_INSTANT_TIERS)
    return invalid();
  const tiers: InstantTier[] = [];
  let lastBytes = 0;
  let lastAmount = BigInt(base);
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      Object.keys(item).some((key) => key !== "minInputBytes" && key !== "amount")
    )
      return invalid();
    const { minInputBytes, amount } = item as Record<string, unknown>;
    if (
      !Number.isSafeInteger(minInputBytes) ||
      (minInputBytes as number) <= lastBytes ||
      !atomic(amount) ||
      BigInt(amount) <= lastAmount ||
      BigInt(amount) > BigInt(max)
    )
      return invalid();
    lastBytes = minInputBytes as number;
    lastAmount = BigInt(amount);
    tiers.push({ minInputBytes: lastBytes, amount });
  }
  return tiers;
}

class InvalidTiers extends Error {}
const invalid = (): never => {
  throw new InvalidTiers();
};
export const isInvalidTiers = (error: unknown) => error instanceof InvalidTiers;

// Stored tiers, re-read defensively: anything malformed prices nothing above base.
export function storedTiers(value: unknown): InstantTier[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is InstantTier =>
      typeof item === "object" &&
      item !== null &&
      Number.isSafeInteger((item as InstantTier).minInputBytes) &&
      atomic((item as InstantTier).amount),
  );
}

const encoder = new TextEncoder();

// What the input weighs: UTF-8 bytes of every string argument (also inside
// arrays) plus the size of every file a file field names. Numbers, booleans
// and enum choices are free. Deterministic from the frozen quote input.
export function inputBytes(schema: unknown, args: Record<string, unknown>, fileSizes: number[]) {
  const files = new Set(fileFields(schema).map((field) => field.name));
  let total = fileSizes.reduce((sum, size) => sum + size, 0);
  const add = (value: unknown) => {
    if (typeof value === "string") total += encoder.encode(value).length;
    else if (Array.isArray(value)) value.forEach(add);
  };
  for (const [name, value] of Object.entries(args)) if (!files.has(name)) add(value);
  return total;
}

// The highest tier the input reaches, else the base instant price.
export function instantPrice(base: string, tiers: InstantTier[], bytes: number): bigint {
  let price = BigInt(base);
  for (const tier of tiers) if (bytes >= tier.minInputBytes) price = BigInt(tier.amount);
  return price;
}
