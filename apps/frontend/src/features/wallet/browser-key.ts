import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// The one-click key: a vault grant signer that lives in this browser only.
// Payvoke never receives it. WebCrypto cannot hold a secp256k1 key, so the
// key is stored encrypted under a non-extractable AES-GCM key: storage read
// off the disk or from a backup is useless, though script running on this
// origin can still use it. The grant's on-chain limits and short expiry
// bound what that could cost.

const DB = "payvoke-keys";
const STORE = "keys";
const WRAP = "wrap";

type Stored = {
  grantId: Hex;
  signer: Address;
  expiresAt: number;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
};

const slot = (vault: string, buyer: string) => `${vault}:${buyer}`.toLowerCase();

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const call = run(db.transaction(STORE, mode).objectStore(STORE));
      call.onsuccess = () => resolve(call.result);
      call.onerror = () => reject(call.error);
      call.transaction!.oncomplete = () => db.close();
    };
  });
}

async function wrapKey() {
  const existing = await request<CryptoKey | undefined>("readonly", (store) => store.get(WRAP));
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await request("readwrite", (store) => store.put(created, WRAP));
  return created;
}

export async function saveBrowserKey(
  vault: Address,
  buyer: Address,
  grant: { grantId: Hex; key: Hex; expiresAt: number },
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await wrapKey(),
    new TextEncoder().encode(grant.key),
  );
  const stored: Stored = {
    grantId: grant.grantId,
    signer: privateKeyToAccount(grant.key).address,
    expiresAt: grant.expiresAt,
    iv,
    data,
  };
  await request("readwrite", (store) => store.put(stored, slot(vault, buyer)));
}

// The grant and a signer for it, or null when this browser has none or it
// has expired.
export async function loadBrowserKey(vault: Address, buyer: Address) {
  const stored = await request<Stored | undefined>("readonly", (store) =>
    store.get(slot(vault, buyer)),
  );
  if (!stored) return null;
  if (stored.expiresAt <= Math.floor(Date.now() / 1000)) {
    await forgetBrowserKey(vault, buyer);
    return null;
  }
  const key = new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv }, await wrapKey(), stored.data),
  ) as Hex;
  return {
    grantId: stored.grantId,
    signer: stored.signer,
    expiresAt: stored.expiresAt,
    account: privateKeyToAccount(key),
  };
}

export const forgetBrowserKey = (vault: Address, buyer: Address) =>
  request("readwrite", (store) => store.delete(slot(vault, buyer)));

// On sign-out every key goes; their grants lapse on their own expiry.
export function clearBrowserKeys() {
  return new Promise<void>((resolve) => {
    const deleting = indexedDB.deleteDatabase(DB);
    deleting.onsuccess = deleting.onerror = deleting.onblocked = () => resolve();
  });
}

export type BrowserKey = NonNullable<Awaited<ReturnType<typeof loadBrowserKey>>>;

export const browserKeyQuery = (vault: Address | null, buyer: Address | undefined) =>
  ["browser-key", vault?.toLowerCase(), buyer?.toLowerCase()] as const;

export function useBrowserKey(vault: Address | null, buyer: Address | undefined) {
  return useQuery({
    queryKey: browserKeyQuery(vault, buyer),
    queryFn: () => loadBrowserKey(vault!, buyer!).catch(() => null),
    enabled: Boolean(vault && buyer && typeof indexedDB !== "undefined"),
    staleTime: Infinity,
  });
}
