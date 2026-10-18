import { digest } from "../../provider-gateway/domain/provider.js";
import type { CommandInvocation } from "../../provider-gateway/domain/provider.js";

export class TextResult {
  id!: string;
  ownerId!: string;
  applicationId!: string;
  revisionId!: string;
  listingVersionId: string | null = null;
  terminalDigest!: string;
  text!: string;
  digest!: string;
  createdAt = new Date();
}

export function inspectTextResult(invocation: CommandInvocation, ownerId: string): TextResult {
  if (invocation.state !== "completed" || invocation.result === null || !invocation.terminalDigest)
    throw new Error("Only completed invocations can produce a checked text result.");
  if (
    !invocation.result.trim() ||
    Buffer.byteLength(invocation.result, "utf8") > 16384 ||
    invocation.result.includes("\0")
  )
    throw new Error("Result does not satisfy the bounded text-v1 profile.");
  const result = Object.assign(new TextResult(), {
    id: invocation.id,
    ownerId,
    applicationId: invocation.applicationId,
    revisionId: invocation.revisionId,
    listingVersionId: invocation.listingVersionId,
    terminalDigest: invocation.terminalDigest,
    text: invocation.result,
  });
  result.digest = digest({
    profile: "text-v1",
    id: result.id,
    applicationId: result.applicationId,
    revisionId: result.revisionId,
    listingVersionId: result.listingVersionId,
    terminalDigest: result.terminalDigest,
    text: result.text,
  });
  return result;
}
