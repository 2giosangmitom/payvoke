import assert from "node:assert/strict";
import { it } from "bun:test";
import type { CommandRevision } from "@/src/features/chat/api";
import { instantCurl } from "@/src/features/store/instant-hire";

it("builds the x402 curl example from the command's required arguments", () => {
  const revision = {
    instantGrossAmount: "500000",
    options: [
      { name: "cv_text", type: "STRING", required: true },
      { name: "goal", type: "STRING", required: false },
      { name: "pages", type: "INTEGER", required: true },
    ],
  } as unknown as CommandRevision;
  const curl = instantCurl("app_1", "quick_review", revision);
  assert.match(
    curl,
    /^curl -i -X POST https?:\/\/[^ ]+\/v1\/x402\/apps\/app_1\/commands\/quick_review \\/,
  );
  assert.match(curl, /-H "Authorization: Bearer \$PAYVOKE_TOKEN"/);
  assert.match(curl, /-H "Idempotency-Key: \$\(uuidgen\)"/);
  assert.match(curl, /-d '\{"arguments":\{"cv_text":"<cv_text>","pages":1\}\}'$/);
});
