import { afterEach, expect, spyOn, test } from "bun:test";
import { Payvoke } from "../src/payvoke";

const api = new Payvoke("https://payvoke.example", "test-app", "pvk_test");
const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});
function mockFetch(
  handler: (
    url: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
) {
  spies.push(
    spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(handler, { preconnect: fetch.preconnect }),
    ),
  );
}

test("uploads exact PDF bytes with SHA-256 and only returns a READY file", async () => {
  const bytes = new TextEncoder().encode("%PDF-test");
  const calls: { url: string; init?: RequestInit }[] = [];
  mockFetch(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1)
      return Response.json({
        file: { id: "file-1" },
        upload: {
          url: "https://storage.example/upload",
          method: "PUT",
          headers: { "content-type": "application/pdf" },
        },
      });
    if (calls.length === 2) return new Response(null, { status: 200 });
    return Response.json({ id: "file-1", status: "READY" });
  });
  expect(await api.upload("job-1", "cv-improved-v1.pdf", "application/pdf", bytes)).toBe("file-1");
  expect(calls).toHaveLength(3);
  const reservation = JSON.parse(calls[0]!.init!.body as string);
  expect(reservation).toMatchObject({
    name: "cv-improved-v1.pdf",
    contentType: "application/pdf",
    size: bytes.length,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  });
  expect(calls[1]!.url).toBe("https://storage.example/upload");
  expect(calls[1]!.init!.body).toBe(bytes);
  expect(calls[1]!.init!.headers).toEqual({ "content-type": "application/pdf" });
  expect(calls[2]!.url).toEndWith("/invocations/job-1/files/file-1/completions");
});

test("rejected artifact completion is a failed upload", async () => {
  let call = 0;
  mockFetch(async () => {
    call++;
    return Response.json(
      call === 1
        ? { file: { id: "file-1" }, upload: null }
        : { id: "file-1", status: "REJECTED", rejectionCode: "CHECKSUM_MISMATCH" },
    );
  });
  await expect(
    api.upload("job-1", "cv-improved-v1.pdf", "application/pdf", new Uint8Array([1])),
  ).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
});

test("download bounds are enforced while streaming, even without a content-length", async () => {
  let call = 0;
  let canceled = false;
  mockFetch(async () => {
    call++;
    if (call === 1) return Response.json({ url: "https://storage.example/input" });
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(3 * 1024 * 1024));
          controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        },
        cancel() {
          canceled = true;
        },
      }),
    );
  });
  await expect(api.download("job-1", "cv-file")).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  expect(canceled).toBe(true);
});
