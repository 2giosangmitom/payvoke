import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { debitTypedData, paymentSignatureHeader, type QuoteDocument } from "@payvoke/shared/x402";
import type { Hex } from "viem";

// Sends one request to the API as the token's buyer, in process.
export type BuyerApi = (
  method: string,
  path: string,
  init?: { json?: unknown; headers?: Record<string, string> },
) => Promise<{ status: number; body: unknown }>;

const id = z.string().min(1).max(128);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const encode = encodeURIComponent;

const text = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  ...(isError ? { isError } : {}),
});

// A 4xx/5xx answer is a tool error the host can read: `{ status, error }`.
const answer = ({ status, body }: { status: number; body: unknown }) =>
  status >= 400 ? text({ status, ...(body as object) }, true) : text(body);

const usdc = (atomic: string) => {
  const value = BigInt(atomic);
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, "0")}`.replace(
    /\.?0+$/,
    "",
  );
};

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function payvokeMcpServer(api: BuyerApi, resourceUrl: string) {
  const server = new McpServer(
    { name: "payvoke", version: "1.0.0" },
    {
      instructions:
        "Payvoke is a store of AI agents for hire on Avalanche, paid in USDC through the PayvokeVault escrow. " +
        "Find an agent, open a chat with it and send the job. The agent answers with an offer that has a price " +
        "and a delivery time. To pay, call prepare_payment, show the user the price and get their consent, sign " +
        "the returned typed data with the delegated grant's signer key on the user's machine, then call " +
        "submit_payment. The vault holds the payment until the result is delivered and refunds it if it is not.",
    },
  );

  server.registerTool(
    "search_agents",
    {
      title: "Search agents",
      description: "Search the Payvoke store for agents by name, description or command.",
      inputSchema: {
        query: z.string().max(100).optional(),
        cursor: z.string().max(128).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: readOnly,
    },
    async ({ query, cursor, limit }) => {
      const search = new URLSearchParams();
      if (query) search.set("q", query);
      if (cursor) search.set("cursor", cursor);
      if (limit) search.set("limit", String(limit));
      return answer(await api("GET", `/v1/apps?${search}`));
    },
  );

  server.registerTool(
    "get_agent",
    {
      title: "Get agent",
      description: "Read one agent and its slash commands, with their arguments and price caps.",
      inputSchema: { appId: id },
      annotations: readOnly,
    },
    async ({ appId }) => {
      const agent = await api("GET", `/v1/apps/${encode(appId)}`);
      if (agent.status >= 400) return answer(agent);
      const commands = await api("GET", `/v1/apps/${encode(appId)}/commands`);
      if (commands.status >= 400) return answer(commands);
      return text({ agent: agent.body, commands: commands.body });
    },
  );

  server.registerTool(
    "start_chat",
    {
      title: "Start chat",
      description: "Open a chat with an agent. Returns the thread to send messages to.",
      inputSchema: { appId: id, title: z.string().max(120).optional() },
    },
    async ({ appId, title }) =>
      answer(
        await api("POST", "/v1/threads", {
          json: { appId, title, clientRequestId: crypto.randomUUID() },
        }),
      ),
  );

  server.registerTool(
    "send_message",
    {
      title: "Send message",
      description:
        "Send a message to the agent in a chat. `content` is always the text the agent reads; add " +
        "`commandId` and `arguments` to run one of its slash commands. Messages are free; the agent " +
        "replies with an offer. Answer a form, choice or confirmation it opened with answer_tool.",
      inputSchema: {
        threadId: id,
        content: z.string().min(1).max(16000),
        commandId: id.optional(),
        arguments: z.record(z.string(), z.unknown()).optional(),
        fileIds: z.array(id).max(20).optional(),
      },
    },
    async ({ threadId, ...message }) =>
      answer(
        await api("POST", `/v1/threads/${encode(threadId)}/messages`, {
          json: { ...message, clientRequestId: crypto.randomUUID() },
        }),
      ),
  );

  server.registerTool(
    "read_chat",
    {
      title: "Read chat",
      description:
        "Read a chat as ordered messages. Each part is text, a file or a tool call: offers, the " +
        "agent's open forms (ask_form), choices (ask_choice) and confirmations (confirm) with status " +
        "`open`, paid jobs with their phase, steps and output.",
      inputSchema: { threadId: id },
      annotations: readOnly,
    },
    async ({ threadId }) => {
      const result = await api("GET", `/v1/threads/${encode(threadId)}/timeline`);
      if (result.status >= 400) return answer(result);
      // Generative UI surfaces are for the web chat; hosts read the rest.
      const timeline = result.body as {
        messages: { parts: { type: string; toolName?: string }[] }[];
      };
      for (const message of timeline.messages)
        message.parts = message.parts.filter((part) => part.toolName !== "render_ui");
      return text(timeline);
    },
  );

  server.registerTool(
    "answer_tool",
    {
      title: "Answer tool",
      description:
        "Answer a tool call the agent opened, by its `toolCallId` from read_chat. ask_form takes the " +
        "form's fields, ask_choice takes `{ selected: [optionId] }`, confirm takes `{ approved: boolean }`. " +
        "Each tool call takes one answer.",
      inputSchema: {
        threadId: id,
        toolCallId: id,
        result: z.record(z.string(), z.unknown()),
      },
    },
    async ({ threadId, toolCallId, result }) =>
      answer(
        await api("POST", `/v1/threads/${encode(threadId)}/tool-results`, {
          json: { toolCallId, result, clientRequestId: crypto.randomUUID() },
        }),
      ),
  );

  server.registerTool(
    "decline_offer",
    {
      title: "Decline offer",
      description: "Decline an open offer in a chat.",
      inputSchema: { threadId: id, offerId: id },
      annotations: { idempotentHint: true },
    },
    async ({ threadId, offerId }) =>
      answer(
        await api("POST", `/v1/threads/${encode(threadId)}/tool-results`, {
          json: {
            toolCallId: offerId,
            result: { accepted: false },
            clientRequestId: `decline-${offerId}`,
          },
        }),
      ),
  );

  server.registerTool(
    "prepare_payment",
    {
      title: "Prepare payment",
      description:
        "Turn an open offer into a quote and return the EIP-712 debit to sign. Nothing is paid yet. " +
        "Show the user the price before signing. Sign `typedData` with the delegated grant's signer key, " +
        'for example `cast wallet sign --data "$TYPED_DATA"` or `bun apps/api/scripts/sign-payment.ts`, ' +
        "then call submit_payment before `validUntil`.",
      inputSchema: {
        threadId: id,
        offerId: id,
        grantId: bytes32.describe("The vault grant that pays, bytes32"),
        grantEpoch: z
          .string()
          .regex(/^[1-9]\d*$/)
          .describe("The grant's current epoch"),
        fileIds: z.array(id).max(100).optional(),
      },
    },
    async ({ threadId, offerId, grantId, grantEpoch, fileIds = [] }) => {
      const clientRequestId = crypto.randomUUID();
      const result = await api("POST", "/v1/quotes", {
        json: {
          threadId,
          offerId,
          clientRequestId,
          contextSelection: { messageIds: [], briefVersionId: null, fileIds },
        },
        headers: { "idempotency-key": clientRequestId },
      });
      if (result.status >= 400) return answer(result);
      const quote = result.body as QuoteDocument;
      const typed = debitTypedData(quote, grantId as Hex, BigInt(grantEpoch));
      return text({
        quoteId: quote.quoteId,
        invocationId: quote.invocationId,
        price: `${usdc(quote.grossAmount)} USDC`,
        grossAmount: quote.grossAmount,
        validUntil: new Date(quote.validUntil * 1000).toISOString(),
        deliveryDeadline: new Date(quote.deliveryDeadline * 1000).toISOString(),
        resolveBy: new Date(quote.resolveBy * 1000).toISOString(),
        // JSON EIP-712, as `cast wallet sign --data` and eth_signTypedData_v4 read it.
        typedData: {
          domain: typed.domain,
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            DebitAuthorization: typed.types.DebitAuthorization,
          },
          primaryType: typed.primaryType,
          message: { ...typed.message, grantEpoch },
        },
      });
    },
  );

  server.registerTool(
    "submit_payment",
    {
      title: "Submit payment",
      description:
        "Pay a prepared quote with the signed debit. The vault holds the USDC until the agent delivers; " +
        "only call this after the user agreed to the price.",
      inputSchema: {
        quoteId: id,
        grantId: bytes32,
        grantEpoch: z.string().regex(/^[1-9]\d*$/),
        signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ quoteId, grantId, grantEpoch, signature }) => {
      const restored = await api("GET", `/v1/quotes/${encode(quoteId)}`);
      if (restored.status >= 400) return answer(restored);
      const quote = (restored.body as { quote: QuoteDocument | null }).quote;
      if (!quote) return text({ status: 410, error: "QUOTE_NOT_PAYABLE" }, true);
      const header = paymentSignatureHeader(
        quote,
        grantId as Hex,
        BigInt(grantEpoch),
        signature as Hex,
        resourceUrl,
      );
      return answer(
        await api("POST", "/v1/invocations", {
          json: { quoteId },
          headers: { "idempotency-key": quote.invocationId, "payment-signature": header },
        }),
      );
    },
  );

  server.registerTool(
    "list_jobs",
    {
      title: "List jobs",
      description: "List paid jobs, newest first, with their payment and delivery state.",
      inputSchema: { cursor: z.string().max(128).optional() },
      annotations: readOnly,
    },
    async ({ cursor }) =>
      answer(await api("GET", `/v1/invocations${cursor ? `?cursor=${encode(cursor)}` : ""}`)),
  );

  server.registerTool(
    "get_job",
    {
      title: "Get job",
      description: "Read one paid job: payment, delivery and refund state.",
      inputSchema: { invocationId: id },
      annotations: readOnly,
    },
    async ({ invocationId }) => answer(await api("GET", `/v1/invocations/${encode(invocationId)}`)),
  );

  server.registerTool(
    "prepare_reclaim",
    {
      title: "Prepare reclaim",
      description:
        "Build the vault transaction that takes back a held payment once its review window has closed " +
        "without a release. The buyer's wallet must simulate, sign and send it; nothing is sent here.",
      inputSchema: { invocationId: id },
      annotations: readOnly,
    },
    async ({ invocationId }) =>
      answer(
        await api("POST", `/v1/invocations/${encode(invocationId)}/financial-intents`, {
          json: { action: "reclaim" },
        }),
      ),
  );

  return server;
}
