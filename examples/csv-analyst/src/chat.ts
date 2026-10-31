import { concierge } from "./agents";
import type { CommandName } from "./commands";
import { config, usdc } from "./config";
import { MAX_BYTES } from "./csv";
import { Reply, type FileEntry, type Payvoke, type ThreadMessageEvent } from "./payvoke";
import { tools } from "./state";

// Pre-sale chat: free for the buyer. Every path ends in a text reply, a
// built-in tool (form or choice) or a priced offer.

export type Commands = { byId: Map<string, CommandName>; id: Record<CommandName, string> };

const isCsv = (f: FileEntry) =>
  f.contentType === "text/csv" || f.name.toLowerCase().endsWith(".csv");
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined;
const WANTS_ANALYSIS = /csv|analy|data|file|chart|upload|report|spreadsheet|profile|stat/i;

export async function handleMessage(api: Payvoke, commands: Commands, ev: ThreadMessageEvent) {
  const reply = (suffix: string) => `${ev.messageId}-${suffix}`;

  // 1. The buyer answered a tool we opened earlier.
  if (ev.toolResult) {
    const pending = await tools.get(ev.toolResult.toolCallId);
    const result = (ev.toolResult.result ?? {}) as Record<string, unknown>;
    if (pending?.kind === "intake" && text(result.file))
      return askDepth(api, ev.threadId, reply("depth"), text(result.file)!, text(result.goal));
    if (pending?.kind === "depth") {
      const depth = (result.selected as string[] | undefined)?.[0] === "deep" ? "deep" : "quick";
      return offerAnalyze(
        api,
        commands,
        ev.threadId,
        reply("offer"),
        pending.fileId,
        pending.goal,
        depth,
      );
    }
  }

  // 2. A slash command with its arguments.
  const command = ev.commandId ? commands.byId.get(ev.commandId) : undefined;
  const args = ev.arguments ?? {};
  const fileId = text(args.file);
  if (command === "profile" && fileId)
    return offerProfile(api, commands, ev.threadId, reply("offer"), fileId);
  if (command === "analyze" && fileId) {
    const depth = args.depth === "quick" || args.depth === "deep" ? args.depth : null;
    if (depth)
      return offerAnalyze(
        api,
        commands,
        ev.threadId,
        reply("offer"),
        fileId,
        text(args.goal),
        depth,
      );
    return askDepth(api, ev.threadId, reply("depth"), fileId, text(args.goal));
  }

  // 3. A plain message with a CSV attached: treat the text as the goal.
  const csv = ev.files.find(isCsv);
  if (csv) return askDepth(api, ev.threadId, reply("depth"), csv.fileId, text(ev.content));

  // 4. Plain chat. Offer the upload form when the buyer seems ready.
  const withForm = WANTS_ANALYSIS.test(ev.content);
  const answer = await Reply.open(api, ev.threadId, {
    clientRequestId: reply("chat"),
    ...(withForm ? { tool: intakeForm } : {}),
  });
  if (withForm) await tools.put(answer.messageId, { kind: "intake", threadId: ev.threadId });
  await chatReply(ev, answer);
}

const intakeForm = {
  name: "ask_form" as const,
  args: {
    title: "Analyze a CSV",
    description: "Upload a CSV and, optionally, tell me what you want to learn.",
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "file",
          title: "CSV file",
          accept: ["text/csv"],
          maxBytes: MAX_BYTES,
        },
        goal: { type: "string", title: "What do you want to learn?", maxLength: 500 },
      },
      required: ["file"],
    },
    submitLabel: "Continue",
  },
};

async function askDepth(
  api: Payvoke,
  threadId: string,
  requestId: string,
  fileId: string,
  goal?: string,
) {
  const message = await api.sendMessage(threadId, {
    clientRequestId: requestId,
    tool: {
      name: "ask_choice",
      args: {
        prompt: "How deep should the analysis go?",
        options: [
          {
            id: "quick",
            label: `Quick, ${usdc(config.PRICE_QUICK)} USDC`,
            description: "Key metrics, column profile and 2 charts, in about 5 minutes",
          },
          {
            id: "deep",
            label: `Deep, ${usdc(config.PRICE_DEEP)} USDC`,
            description: "5 charts, outliers and a longer written analysis",
          },
        ],
      },
    },
  });
  await tools.put(message.id, { kind: "depth", threadId, fileId, goal });
}

async function offer(api: Payvoke, threadId: string, body: Parameters<Payvoke["createOffer"]>[1]) {
  try {
    await api.createOffer(threadId, { validForSeconds: 1800, ...body });
  } catch (error) {
    // Most often the price is below the deployment floor: tell the buyer
    // instead of leaving the thread silent, and log it for the builder.
    console.error(`offer failed: ${error instanceof Error ? error.message : error}`);
    await api.sendMessage(threadId, {
      clientRequestId: `${body.clientRequestId}-error`,
      content:
        "Sorry, I could not create an offer for this job right now. Please try again in a minute.",
    });
  }
}

function offerProfile(
  api: Payvoke,
  commands: Commands,
  threadId: string,
  requestId: string,
  fileId: string,
) {
  return offer(api, threadId, {
    clientRequestId: requestId,
    commandId: commands.id.profile,
    arguments: { file: fileId },
    grossAmount: config.PRICE_PROFILE,
    summary:
      "A column-by-column profile of your CSV: types, missing values, ranges and top values.",
  });
}

function offerAnalyze(
  api: Payvoke,
  commands: Commands,
  threadId: string,
  requestId: string,
  fileId: string,
  goal: string | undefined,
  depth: "quick" | "deep",
) {
  const summary =
    depth === "deep"
      ? "Deep analysis: column profile, 5 charts, outliers and a written analysis, plus the numbers as JSON and CSV."
      : "Quick analysis: key metrics, column profile, 2 charts and a short written summary, plus the numbers as JSON and CSV.";
  return offer(api, threadId, {
    clientRequestId: requestId,
    commandId: commands.id.analyze,
    arguments: { file: fileId, depth, ...(goal ? { goal } : {}) },
    grossAmount: depth === "deep" ? config.PRICE_DEEP : config.PRICE_QUICK,
    // An offer may shorten the command's delivery time, never extend it.
    deliverySeconds: depth === "deep" ? 600 : 300,
    summary: goal ? `${summary} Focus: ${goal}` : summary,
  });
}

async function chatReply(ev: ThreadMessageEvent, answer: Reply) {
  type Turn = { role: "user"; content: string } | { role: "assistant"; content: string };
  const history: Turn[] = ev.conversation.slice(-10).map((m): Turn => {
    const content = m.content || "(attachment)";
    return m.role === "BUYER" ? { role: "user", content } : { role: "assistant", content };
  });
  if (history.at(-1)?.content !== ev.content) history.push({ role: "user", content: ev.content });
  try {
    // The buyer watches the reply appear token by token.
    const out = await concierge.stream(history, { abortSignal: AbortSignal.timeout(30_000) });
    for await (const delta of out.textStream) await answer.write(delta);
  } catch (error) {
    console.error(`chat model failed: ${error instanceof Error ? error.message : error}`);
  }
  await answer.close(
    "I analyze CSV files. Run **/profile** for a quick column profile, or **/analyze** for charts, outliers and a written analysis. You can also upload a CSV here.",
  );
}
