import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import WebSocket from "ws";

export interface SlashCommand {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; maxLength: number; enum?: string[] }>;
    required: string[];
    additionalProperties: false;
  };
}
export interface Invocation {
  id: string;
  revisionId: string;
  command: string;
  input: Record<string, string>;
  deadlineAt: string;
  developmentOnly: true;
}
export type CommandHandler = (
  invocation: Invocation & { signal: AbortSignal; progress: (text: string) => Promise<void> },
) => Promise<string>;
type Terminal = { type: "completed" | "failed" | "uncertain"; text: string };
type Pending = {
  frame: { type: string; requestId: string; invocationId: string; text?: string };
  sentAt: number;
  resolve: () => void;
  reject: (error: Error) => void;
};
interface Row {
  input: string;
  terminal: string | null;
}

/** One SDK process per journal; keep the journal across deploys and restarts. */
export class ProviderClient {
  private readonly db: DatabaseSync;
  private readonly executorId: string;
  private readonly origin: URL;
  private socket?: WebSocket;
  private stopped = true;
  private disposed = false;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setInterval>;
  private handlers = new Map<string, { revisionId: string; handler: CommandHandler }>();
  private pending = new Map<string, Pending>();
  private running = new Map<string, Promise<void>>();
  private controllers = new Set<AbortController>();
  private ready = false;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private connectionAttempt = 0;
  constructor(
    private readonly options: {
      apiKey: string;
      applicationId: string;
      baseUrl: string;
      journalPath: string;
      onError: (error: Error) => void;
    },
  ) {
    this.origin = new URL(options.baseUrl);
    if (
      this.origin.username ||
      this.origin.password ||
      this.origin.search ||
      this.origin.hash ||
      this.origin.pathname !== "/" ||
      !["http:", "https:"].includes(this.origin.protocol)
    )
      throw new Error("baseUrl must be an HTTP(S) origin without credentials.");
    if (
      this.origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(this.origin.hostname)
    )
      throw new Error("Use HTTPS outside localhost.");
    if (!/^ane_[A-Za-z0-9_-]{43}$/.test(options.apiKey))
      throw new Error("Invalid provider API key format.");
    this.db = new DatabaseSync(options.journalPath);
    try {
      this.db.exec(
        "PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE;",
      );
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invocations (id TEXT PRIMARY KEY, input TEXT NOT NULL, terminal TEXT);",
      );
      this.db.exec("BEGIN EXCLUSIVE");
      const binding = `${this.origin.origin}/${options.applicationId}`;
      const existing = this.db
        .prepare("SELECT value FROM metadata WHERE key='application'")
        .get() as { value: string } | undefined;
      if (existing && existing.value !== binding)
        throw new Error("This journal belongs to a different application or platform.");
      this.db.prepare("INSERT OR IGNORE INTO metadata VALUES ('application', ?)").run(binding);
      this.db.prepare("INSERT OR IGNORE INTO metadata VALUES ('executor', ?)").run(randomUUID());
      this.executorId = (
        this.db.prepare("SELECT value FROM metadata WHERE key='executor'").get() as {
          value: string;
        }
      ).value;
      this.db.prepare("UPDATE invocations SET terminal=? WHERE terminal IS NULL").run(
        JSON.stringify({
          type: "uncertain",
          text: "Provider process interrupted. Work was not automatically rerun.",
        }),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  async registerCommands(
    commands: SlashCommand[],
  ): Promise<{ id: string; digest: string; commands: SlashCommand[] }> {
    const response = await fetch(
      new URL(
        `/v1/provider/applications/${encodeURIComponent(this.options.applicationId)}/commands`,
        this.origin,
      ),
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ commands }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`Command registration failed (${response.status}).`);
    return (await response.json()) as { id: string; digest: string; commands: SlashCommand[] };
  }
  /** Explicit revision binding prevents a changed deployment silently handling old input. */
  onCommand(name: string, revisionId: string, handler: CommandHandler) {
    if (!this.stopped) throw new Error("Register handlers before connecting.");
    this.handlers.set(`${revisionId}:${name}`, { revisionId, handler });
    return this;
  }
  connect(): Promise<void> {
    if (this.disposed) throw new Error("Provider client has been closed.");
    if (!this.stopped) throw new Error("Already connecting or connected.");
    this.stopped = false;
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.open();
    });
  }
  private open() {
    if (this.stopped) return;
    const url = new URL("/v1/provider/gateway", this.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      maxPayload: 65536,
      handshakeTimeout: 10_000,
      followRedirects: false,
    });
    this.socket = socket;
    let lastMessage = Date.now();
    socket.on("ping", () => {
      lastMessage = Date.now();
    }); // ws automatically sends pong.
    this.watchdog = setInterval(() => {
      if (
        Date.now() - lastMessage > 35_000 ||
        [...this.pending.values()].some(
          (pending) => pending.sentAt > 0 && Date.now() - pending.sentAt > 15_000,
        )
      )
        socket.terminate();
    }, 5000);
    socket.on("message", (raw) => {
      lastMessage = Date.now();
      try {
        const frame = JSON.parse(raw.toString());
        if (frame.type === "hello") {
          if (frame.protocol !== "provider-gateway-v1")
            throw new Error("Unsupported Gateway protocol.");
          socket.send(
            JSON.stringify({
              type: "identify",
              protocol: "provider-gateway-v1",
              executorId: this.executorId,
            }),
          );
        } else if (frame.type === "ready") {
          this.ready = true;
          this.connectionAttempt = 0;
          this.readyResolve?.();
          this.readyResolve = undefined;
          this.readyReject = undefined;
          for (const pending of this.pending.values()) {
            pending.sentAt = Date.now();
            socket.send(JSON.stringify(pending.frame));
          }
        } else if (frame.type === "ack") {
          const pending = this.pending.get(frame.requestId);
          if (pending && pending.frame.invocationId === frame.invocationId) {
            this.pending.delete(frame.requestId);
            pending.resolve();
          }
        } else if (frame.type === "command.invoked") {
          const invocation = frame.invocation as Invocation;
          if (
            !this.ready ||
            !invocation ||
            typeof invocation.id !== "string" ||
            typeof invocation.revisionId !== "string" ||
            !invocation.input ||
            invocation.developmentOnly !== true ||
            !Number.isFinite(Date.parse(invocation.deadlineAt))
          )
            throw new Error("Invalid invocation frame.");
          if (!this.running.has(invocation.id)) {
            const task = this.execute(invocation)
              .catch((error) => {
                if (!this.stopped)
                  this.options.onError(
                    error instanceof Error ? error : new Error("Invocation failed."),
                  );
              })
              .finally(() => {
                this.running.delete(invocation.id);
              });
            this.running.set(invocation.id, task);
          }
        } else if (frame.type === "error") {
          if (
            frame.code === "GATEWAY_BUSY" ||
            frame.code === "SESSION_EXPIRED" ||
            frame.code === "INTERNAL_ERROR"
          )
            return; // reconnect without restarting work
          // Never expose raw server payloads or request headers in errors.
          this.fatal(new Error(`Gateway rejected the operation (${String(frame.code)}).`));
        }
      } catch {
        this.fatal(new Error("Invalid Gateway message."));
      }
    });
    socket.on("unexpected-response", (_request, response) => {
      response.resume();
      socket.terminate();
      this.fatal(new Error(`Gateway handshake rejected (${response.statusCode}).`));
    });
    socket.on("error", () => {}); // close drives retry; never log credential-bearing request objects.
    socket.on("close", (code) => {
      this.ready = false;
      clearInterval(this.watchdog);
      if (this.stopped) return;
      if (code >= 4400 && code !== 4408 && code !== 4429) {
        this.fatal(new Error(`Gateway connection rejected (${code}).`));
        return;
      }
      const backoff = Math.min(30_000, 500 * 2 ** Math.min(this.connectionAttempt++, 6));
      this.retry = setTimeout(() => this.open(), backoff + Math.random() * 250);
    });
  }
  private fatal(error: Error, notify = true) {
    this.stopped = true;
    this.ready = false;
    clearTimeout(this.retry);
    clearInterval(this.watchdog);
    this.socket?.terminate();
    this.readyReject?.(error);
    this.readyReject = undefined;
    this.readyResolve = undefined;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const controller of this.controllers) controller.abort();
    if (notify) this.options.onError(error);
  }
  private send(type: string, invocationId: string, text?: string): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("Provider client is stopped."));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const frame = { type, requestId, invocationId, ...(text === undefined ? {} : { text }) };
      this.pending.set(requestId, { frame, sentAt: this.ready ? Date.now() : 0, resolve, reject });
      if (this.ready && this.socket?.readyState === WebSocket.OPEN)
        this.socket.send(JSON.stringify(frame));
    });
  }
  private async execute(invocation: Invocation) {
    // Canonical input identity is the platform-pinned revision plus original string fields.
    const identity = createHash("sha256")
      .update(
        JSON.stringify([
          invocation.revisionId,
          invocation.command,
          Object.entries(invocation.input).sort(([a], [b]) => a.localeCompare(b)),
        ]),
      )
      .digest("hex");
    const row = this.db
      .prepare("SELECT input, terminal FROM invocations WHERE id=?")
      .get(invocation.id) as unknown as Row | undefined;
    if (row && row.input !== identity) throw new Error("Invocation identity conflict.");
    if (!row)
      this.db.prepare("INSERT INTO invocations VALUES (?, ?, NULL)").run(invocation.id, identity);
    await this.send("accepted", invocation.id);
    let terminal: Terminal | undefined = row?.terminal ? JSON.parse(row.terminal) : undefined;
    if (!terminal) {
      const binding = this.handlers.get(`${invocation.revisionId}:${invocation.command}`);
      if (Date.now() >= Date.parse(invocation.deadlineAt) - 1000)
        terminal = {
          type: "uncertain",
          text: "Invocation deadline reached before handler start. Not automatically rerun.",
        };
      else if (!binding || binding.revisionId !== invocation.revisionId)
        terminal = {
          type: "failed",
          text: "No handler is installed for the pinned command revision.",
        };
      else {
        const controller = new AbortController();
        this.controllers.add(controller);
        const timeout = setTimeout(
          () => controller.abort(),
          Math.max(0, Date.parse(invocation.deadlineAt) - Date.now() - 1000),
        );
        try {
          const aborted = new Promise<never>((_resolve, reject) =>
            controller.signal.addEventListener(
              "abort",
              () => reject(new Error("Invocation interrupted.")),
              { once: true },
            ),
          );
          const text = await Promise.race([
            binding.handler({
              ...invocation,
              signal: controller.signal,
              progress: (text) => {
                if (text.length < 1 || text.length > 2000)
                  return Promise.reject(new Error("Progress must contain 1–2000 characters."));
                return this.send("progress", invocation.id, text);
              },
            }),
            aborted,
          ]);
          terminal =
            typeof text === "string" &&
            text.length > 0 &&
            text.length <= 16000 &&
            Buffer.byteLength(JSON.stringify(text)) <= 60000
              ? { type: "completed", text }
              : { type: "failed", text: "Handler output exceeds the admitted text profile." };
        } catch {
          terminal = {
            type: "uncertain",
            text: "Handler failed or was interrupted. External effects may have occurred; not automatically retried.",
          };
        } finally {
          clearTimeout(timeout);
          this.controllers.delete(controller);
        }
      }
      this.db
        .prepare("UPDATE invocations SET terminal=? WHERE id=?")
        .run(JSON.stringify(terminal), invocation.id);
    }
    await this.send(terminal.type, invocation.id, terminal.text);
  }
  async close() {
    if (this.disposed) return;
    this.disposed = true;
    this.fatal(new Error("Provider client closed."), false);
    await Promise.allSettled(this.running.values());
    this.db.close();
  }
}
