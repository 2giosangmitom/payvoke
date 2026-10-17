import { createParser } from "eventsource-parser";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function requireSuccess(response: Response) {
  if (response.ok) return;
  if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
  const body = await response.json().catch(() => null);
  throw new Error(body?.message ?? `Chat request failed (${response.status}).`);
}

/** HttpAgent fetch adapter: one idempotent command, then read-only resumable SSE. */
export function createAgUiFetch(
  request: Fetch,
  onSnapshotReset?: () => void,
): (url: string, init: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const input: { runId: string; messages?: unknown[] } = JSON.parse(String(init.body));
    // PostgreSQL owns history. Do not upload the entire transcript on every turn.
    const commandInit = {
      ...init,
      body: JSON.stringify({
        ...input,
        ...(input.messages?.length ? { messages: input.messages.slice(-1) } : {}),
      }),
    };
    const abort = new AbortController();
    const signal = AbortSignal.any([
      abort.signal,
      init.signal ?? new AbortController().signal,
      AbortSignal.timeout(30_000),
    ]);
    let command: Response;
    try {
      command = await request(url, { ...commandInit, signal });
    } catch (error) {
      if (signal.aborted) throw error;
      // A lost POST response has an unknown outcome. Recover with the identical operation key.
      command = await request(url, { ...commandInit, signal });
    }
    await requireSuccess(command);
    const encoder = new TextEncoder();
    let cursor = 0;
    let finished = false;
    let started = false;
    const openMessages = new Set<string>();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let attempt = 0; attempt < 3 && !finished; attempt++) {
            let response: Response;
            try {
              response = await request(
                `${url}/${encodeURIComponent(input.runId)}/events?after=${cursor}`,
                { signal, headers: { Accept: "text/event-stream" } },
              );
            } catch (error) {
              if (signal.aborted || attempt === 2) throw error;
              continue;
            }
            // Do not retry authorization failures as though they were network interruptions.
            await requireSuccess(response);
            if (
              !response.body ||
              !response.headers.get("content-type")?.includes("text/event-stream")
            ) {
              throw new Error("The server did not return an AG-UI event stream.");
            }
            if (response.headers.get("x-stream-reset") === "true") {
              cursor = 0;
              // The official client verifies open text blocks even across snapshots.
              // Close display-only partial blocks before replacing them with canonical history.
              for (const messageId of openMessages) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "TEXT_MESSAGE_END", messageId })}\n\n`,
                  ),
                );
              }
              openMessages.clear();
            }
            const parser = createParser({
              // A reset can contain the bounded 100-turn canonical transcript.
              maxBufferSize: 4 * 1024 * 1024,
              onEvent(event) {
                const sequence = Number(event.id);
                if (!Number.isSafeInteger(sequence) || sequence <= 0)
                  throw new Error("Invalid stream cursor.");
                if (sequence <= cursor) return;
                if (sequence !== cursor + 1) throw new Error("Gap in conversation stream.");
                const data: { type: string; messageId?: string } = JSON.parse(event.data);
                cursor = sequence;
                if (data.type === "RUN_STARTED") {
                  if (started) return; // A reset is the same run, not a nested run.
                  started = true;
                }
                if (data.type === "TEXT_MESSAGE_START" && data.messageId)
                  openMessages.add(data.messageId);
                if (data.type === "TEXT_MESSAGE_END" && data.messageId)
                  openMessages.delete(data.messageId);
                if (data.type === "MESSAGES_SNAPSHOT") onSnapshotReset?.();
                controller.enqueue(encoder.encode(`data: ${event.data}\n\n`));
                finished = data.type === "RUN_FINISHED" || data.type === "RUN_ERROR";
              },
            });
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            try {
              while (!finished) {
                const chunk = await reader.read();
                if (chunk.done) break;
                parser.feed(decoder.decode(chunk.value, { stream: true }));
              }
            } catch (error) {
              if (signal.aborted || attempt === 2 || error instanceof SyntaxError) throw error;
              // Incomplete UTF-8/JSON is discarded. Only fully parsed events advance the cursor.
            } finally {
              await reader.cancel().catch(() => undefined);
              reader.releaseLock();
            }
          }
          if (!finished)
            throw new Error("The response was interrupted. Reload saved messages to recover it.");
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  };
}
