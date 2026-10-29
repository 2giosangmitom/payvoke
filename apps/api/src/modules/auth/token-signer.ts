import { hkdfSync } from "node:crypto";
import { bytesToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const SALT = "payvoke/grant-signer/v1";
// secp256k1 group order: a private key must be in [1, n).
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// An API key's vault grant signer, derived from its secret. Payvoke stores
// only the address: the key exists in memory while a request that presents
// the secret is paying, so a copy of the database cannot spend.
export function tokenSignerKey(secret: string): Hex {
  for (let counter = 0; ; counter++) {
    const bytes = new Uint8Array(hkdfSync("sha256", secret, SALT, `signer:${counter}`, 32));
    const value = BigInt(bytesToHex(bytes));
    if (value > 0n && value < N) return bytesToHex(bytes);
  }
}

export const tokenSigner = (secret: string) => privateKeyToAccount(tokenSignerKey(secret));
