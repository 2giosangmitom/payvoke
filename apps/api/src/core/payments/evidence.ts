const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Evidence classes from M05 (RAILS): SELF < SIGN < {REC, WIT} < ATT. REC proves the
// data arrived and WIT proves the recipient agreed; neither implies the other.
export const evidenceLevels = ["SIGN", "REC", "WIT"] as const;
export type EvidenceLevel = (typeof evidenceLevels)[number];
export const minEvidenceLevels = ["SIGN", "REC"] as const;
export type MinEvidence = (typeof minEvidenceLevels)[number];

export function evidenceSatisfies(level: string, minimum: string): boolean {
  if (minimum === "SIGN") return evidenceLevels.includes(level as EvidenceLevel);
  return level === minimum;
}

export function termsMinEvidence(definition: unknown): MinEvidence | null {
  if (!record(definition) || !record(definition.verification)) return null;
  const level = definition.verification.minEvidence;
  return minEvidenceLevels.includes(level as MinEvidence) ? (level as MinEvidence) : null;
}
