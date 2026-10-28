// Signs the debit that prepare_payment (Payvoke MCP) returns, on your machine:
//   PAYVOKE_GRANT_KEY=0x… bun apps/api/scripts/sign-payment.ts < typed-data.json
// The key is the delegated signer of your vault grant. It never leaves this
// process; only the signature is printed.
import { isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const key = process.env.PAYVOKE_GRANT_KEY;
if (!key || !isHex(key) || key.length !== 66) {
  console.error("Set PAYVOKE_GRANT_KEY to the grant signer's 32-byte private key.");
  process.exit(1);
}
const typed = JSON.parse(await Bun.stdin.text());
// Accepts the tool's whole result or just its typedData.
const { domain, types, primaryType, message } = typed.typedData ?? typed;
if (primaryType !== "DebitAuthorization" || domain?.name !== "PayvokeVault") {
  console.error("This is not a Payvoke debit authorization.");
  process.exit(1);
}
const { EIP712Domain: _domain, ...signed } = types;
console.log(
  await privateKeyToAccount(key).signTypedData({ domain, types: signed, primaryType, message }),
);
