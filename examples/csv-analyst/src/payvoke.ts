// A small client for the Payvoke provider API. Plain fetch + SSE, no SDK, so a
// builder can port it to any stack. Shapes follow /openapi.json.

export type FileEntry = {
  fileId: string;
  name: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type ToolCall =
  | {
      name: "ask_form";
      args: { title: string; description?: string; schema: object; submitLabel?: string };
    }
  | {
      name: "ask_choice";
      args: {
        prompt: string;
        options: { id: string; label: string; description?: string }[];
        multiple?: boolean;
      };
    }
  | {
      name: "confirm";
      args: { title: string; description?: string; details?: { label: string; value: string }[] };
    };

export type ThreadMessageEvent = {
  type: "thread.message";
  threadId: string;
  messageId: string;
  content: string;
  commandId: string | null;
  arguments: Record<string, unknown> | null;
  toolResult: { toolCallId: string; result: unknown } | null;
  files: FileEntry[];
  conversation: { role: "BUYER" | "PROVIDER"; content: string; files: FileEntry[] }[];
};
export type InvocationReadyEvent = {
  type: "invocation.ready";
  invocationId: string;
  runId: string;
  threadId: string;
  input: {
    commandId: string;
    arguments: Record<string, unknown>;
    context: { files: FileEntry[] };
  };
};
export type ToolResultEvent = {
  type: "invocation.tool_result";
  invocationId: string;
  runId: string;
  threadId: string;
  toolCallId: string;
  name: string;
  result: unknown;
};
export type RevisionEvent = {
  type: "invocation.revision_requested";
  invocationId: string;
  runId: string;
  threadId: string;
  reason: string;
};
export type FeedEvent = (
  | ThreadMessageEvent
  | InvocationReadyEvent
  | ToolResultEvent
  | RevisionEvent
) & {
  id: string;
};

export type AguiEvent =
  | { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "CUSTOM"; name: "payvoke.openui"; value: { surfaceId: string; source: string } };

export type Report =
  | { type: "started"; data?: Record<string, unknown> }
  | {
      type: "progress";
      data: {
        stepId: string;
        label: string;
        status?: "running" | "done" | "failed";
        detail?: string;
      };
    }
  | { type: "tool_call"; data: { toolCallId: string } & ToolCall }
  | {
      type: "result";
      data: { artifactVersion: number; output?: unknown; files: { fileId: string }[] };
    }
  | { type: "failed"; data?: Record<string, unknown> };

export class PayvokeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Payvoke {
  private readonly root: string;

  constructor(
    base: string,
    appId: string,
    private readonly key: string,
  ) {
    this.root = `${base.replace(/\/$/, "")}/v1/provider/apps/${appId}`;
  }

  // Every write is idempotent (clientRequestId, reportId, streamSequence), so
  // retrying rate limits and server errors is always safe.
  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    contentType = "application/json",
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(this.root + path, {
        method,
        headers: {
          authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { "content-type": contentType }),
        },
        body:
          body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      const code =
        ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText;
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new PayvokeError(res.status, code);
    }
  }

  overwriteCommands = (definitions: unknown[]) =>
    this.call<{ id: string; name: string }[]>("PUT", "/commands", definitions);

  sendMessage = (
    threadId: string,
    body: { clientRequestId: string; content?: string; tool?: ToolCall; streaming?: boolean },
  ) => this.call<{ id: string; streaming: boolean }>("POST", `/threads/${threadId}/messages`, body);

  appendDelta = (
    threadId: string,
    messageId: string,
    body: { sequence: number; delta: string; done?: boolean },
  ) => this.call<{ id: string }>("POST", `/threads/${threadId}/messages/${messageId}/deltas`, body);

  ackMessage = (threadId: string, messageId: string) =>
    this.call("POST", `/threads/${threadId}/messages/${messageId}/acks`);

  createOffer = (
    threadId: string,
    body: {
      clientRequestId: string;
      commandId: string;
      arguments: Record<string, unknown>;
      grossAmount: string;
      summary: string;
      deliverySeconds?: number;
      validForSeconds?: number;
    },
  ) => this.call<{ id: string }>("POST", `/threads/${threadId}/offers`, body);

  ackRun = (invocationId: string, eventId: string) =>
    this.call<{ runId: string; status: string }>("POST", `/invocations/${invocationId}/acks`, {
      eventId,
    });

  report = (invocationId: string, body: Report & { reportId: string; sequence: number }) =>
    this.call<{ lastCommittedSequence: number; executionStatus?: string }>(
      "POST",
      `/invocations/${invocationId}/reports`,
      body,
    );

  stream = (
    invocationId: string,
    runId: string,
    lines: { streamSequence: number; event: AguiEvent }[],
  ) =>
    this.call<{ lastCommittedSequence: number }>(
      "POST",
      `/invocations/${invocationId}/ag-ui/streams/${runId}`,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "application/x-ndjson",
    );

  async download(invocationId: string, fileId: string): Promise<Uint8Array> {
    const target = await this.call<{ url: string }>(
      "GET",
      `/invocations/${invocationId}/files/${fileId}/download`,
    );
    const res = await fetch(target.url);
    if (!res.ok) throw new PayvokeError(res.status, "DOWNLOAD_FAILED");
    return new Uint8Array(await res.arrayBuffer());
  }

  // Presigned upload: reserve, PUT the exact bytes, then complete. Returns the
  // file id once Payvoke has checked size and SHA-256 and marked it READY.
  async upload(
    invocationId: string,
    name: string,
    contentType: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const ticket = await this.call<{
      file: { id: string };
      upload: { url: string; method: "PUT"; headers: Record<string, string> } | null;
    }>("POST", `/invocations/${invocationId}/files`, {
      name,
      contentType,
      size: bytes.byteLength,
      sha256,
      clientRequestId: `${invocationId}-${name}-${sha256.slice(0, 16)}`,
    });
    if (ticket.upload) {
      const put = await fetch(ticket.upload.url, {
        method: "PUT",
        headers: ticket.upload.headers,
        body: bytes,
      });
      if (!put.ok) throw new PayvokeError(put.status, "UPLOAD_FAILED");
    }
    const file = await this.call<{ id: string; status: string; rejectionCode?: string | null }>(
      "POST",
      `/invocations/${invocationId}/files/${ticket.file.id}/completions`,
    );
    if (file.status !== "READY") throw new PayvokeError(422, file.rejectionCode ?? file.status);
    return file.id;
  }

  // The SSE feed. Unacknowledged events are sent again on every batch, so the
  // caller must dedupe. Reconnects forever with backoff.
  async *events(signal: AbortSignal): AsyncGenerator<FeedEvent> {
    let backoff = 1000;
    while (!signal.aborted) {
      try {
        const res = await fetch(`${this.root}/events`, {
          headers: { authorization: `Bearer ${this.key}`, accept: "text/event-stream" },
          signal,
        });
        if (!res.ok || !res.body) throw new PayvokeError(res.status, "FEED_UNAVAILABLE");
        backoff = 1000;
        const decoder = new TextDecoder();
        let buffer = "";
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            let id = "";
            let data = "";
            for (const line of frame.split("\n")) {
              if (line.startsWith("id:")) id = line.slice(3).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (id && data)
              yield { ...(JSON.parse(data) as Omit<FeedEvent, "id">), id } as FeedEvent;
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        console.error(`feed: ${error instanceof Error ? error.message : error}; reconnecting`);
      }
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

// A chat reply that streams in while the model writes it. Tokens are batched
// into one delta per ~250 ms; deltas are numbered, so a retry is applied once.
export class Reply {
  // A reply holds at most 4000 characters; stop a little short of that.
  static readonly MAX = 3900;
  private sequence = 0;
  private pending = "";
  private written = "";
  private flushedAt = Date.now();

  private constructor(
    readonly api: Payvoke,
    readonly threadId: string,
    readonly messageId: string,
    private closed: boolean,
  ) {}

  // A redelivered event reopens the same message; if it was already closed,
  // writing to it does nothing.
  static async open(
    api: Payvoke,
    threadId: string,
    body: { clientRequestId: string; tool?: ToolCall },
  ) {
    const message = await api.sendMessage(threadId, { ...body, streaming: true });
    return new Reply(api, threadId, message.id, !message.streaming);
  }

  get text() {
    return this.written + this.pending;
  }

  async write(delta: string) {
    if (this.closed) return;
    this.pending += delta.slice(0, Math.max(0, Reply.MAX - this.text.length));
    if (this.pending.length >= 200 || Date.now() - this.flushedAt >= 250) await this.flush(false);
  }

  private async flush(done: boolean) {
    if (!this.pending && !done) return;
    const delta = this.pending;
    this.pending = "";
    this.flushedAt = Date.now();
    await this.api.appendDelta(this.threadId, this.messageId, {
      sequence: ++this.sequence,
      delta,
      ...(done ? { done: true } : {}),
    });
    this.written += delta;
  }

  // Closes the reply; `fallback` is its text when nothing was written.
  async close(fallback: string) {
    if (this.closed) return;
    if (!this.text.trim()) this.pending = fallback;
    await this.flush(true);
    this.closed = true;
  }
}

// One run of paid work: reports and stream lines each carry their own
// per-run sequence starting at 1.
export class Run {
  private sequence = 0;
  private streamSequence = 0;
  private openText: string | null = null;

  constructor(
    readonly api: Payvoke,
    readonly invocationId: string,
    readonly runId: string,
  ) {}

  report(report: Report) {
    this.sequence += 1;
    return this.api.report(this.invocationId, {
      ...report,
      reportId: `${this.runId}-${this.sequence}`,
      sequence: this.sequence,
    } as Report & { reportId: string; sequence: number });
  }

  progress(
    stepId: string,
    label: string,
    status: "running" | "done" | "failed" = "running",
    detail?: string,
  ) {
    return this.report({
      type: "progress",
      data: { stepId, label, status, ...(detail ? { detail } : {}) },
    });
  }

  emit(...events: AguiEvent[]) {
    const lines = events.map((event) => ({ streamSequence: ++this.streamSequence, event }));
    return this.api.stream(this.invocationId, this.runId, lines);
  }

  surface(surfaceId: string, source: string) {
    return this.emit({ type: "CUSTOM", name: "payvoke.openui", value: { surfaceId, source } });
  }

  async startText(messageId: string) {
    await this.endText();
    this.openText = messageId;
    await this.emit({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
  }

  async text(delta: string) {
    if (!this.openText || !delta) return;
    const events: AguiEvent[] = [];
    for (let i = 0; i < delta.length; i += 4000)
      events.push({
        type: "TEXT_MESSAGE_CONTENT",
        messageId: this.openText,
        delta: delta.slice(i, i + 4000),
      });
    await this.emit(...events);
  }

  async endText() {
    if (!this.openText) return;
    const messageId = this.openText;
    this.openText = null;
    await this.emit({ type: "TEXT_MESSAGE_END", messageId });
  }

  // tool_call, result and failed end the run; open text must be closed first.
  async finish(report: Extract<Report, { type: "tool_call" | "result" | "failed" }>) {
    await this.endText();
    return this.report(report);
  }
}
