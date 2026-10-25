import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import { eventStream, pause } from "../../http/sse";
import type { KeyScope } from "../provider/provider.validation";
import type { AnswerBody, RevisionBody } from "./continuation.service";
import type { ReportBody } from "./provider-run.service";

type WorkParams = { appId: string; id: string };
export type FeedRoute = { Params: { appId: string }; Querystring: { once?: string } };
export type AckRoute = { Params: WorkParams; Body?: { eventId?: unknown } };
export type ReportRoute = { Params: WorkParams; Body?: Partial<ReportBody> };
export type StreamRoute = { Params: WorkParams & { runId: string } };
export type AnswerRoute = { Params: { id: string }; Body?: AnswerBody };
export type RevisionRoute = { Params: { id: string }; Body?: RevisionBody };

const FEED_INTERVAL_MS = 3000;

export class RunsController {
  private readonly keys: Cradle["providerKeyService"];
  private readonly runs: Cradle["providerRunService"];
  private readonly continuations: Cradle["continuationService"];

  constructor({ providerKeyService, providerRunService, continuationService }: Cradle) {
    this.keys = providerKeyService;
    this.runs = providerRunService;
    this.continuations = continuationService;
  }

  // Provider worker routes accept only an app key with the given scope.
  private async work(request: FastifyRequest<{ Params: WorkParams }>, scope: KeyScope) {
    const { appId, id } = request.params;
    await this.keys.authenticate(request.headers.authorization, appId, scope);
    return this.runs.work(appId, id);
  }

  // `?once=1` returns the pending feed as JSON; otherwise an SSE stream that
  // re-sends unacknowledged events and doubles as the provider heartbeat.
  feed = async (request: FastifyRequest<FeedRoute>, reply: FastifyReply) => {
    const { appId } = request.params;
    await this.keys.authenticate(request.headers.authorization, appId, "events:read");
    await this.runs.heartbeat(appId);
    if (request.query.once === "1")
      return { events: (await this.runs.feed(appId)).map(({ id, event }) => ({ id, ...event })) };
    return eventStream(reply, "no-store", async (stream) => {
      while (stream.open) {
        await this.runs.heartbeat(appId);
        for (const row of await this.runs.feed(appId))
          if (!stream.send(row.id, String(row.event.type), row.event)) break;
        stream.comment("keep-alive");
        await pause(FEED_INTERVAL_MS);
      }
    });
  };

  acknowledge = async (request: FastifyRequest<AckRoute>) =>
    this.runs.acknowledge(await this.work(request, "events:ack"), request.body?.eventId);

  report = async (request: FastifyRequest<ReportRoute>) =>
    this.runs.report(await this.work(request, "reports:write"), request.body);

  streamCursor = async (request: FastifyRequest<StreamRoute>) =>
    this.runs.cursor(await this.work(request, "reports:write"), request.params.runId);

  stream = async (request: FastifyRequest<StreamRoute>) => {
    const invocation = await this.work(request, "reports:write");
    const body = request.is("application/x-ndjson")
      ? (request.body as AsyncIterable<Buffer>)
      : null;
    return this.runs.ingest(invocation, request.params.runId, body);
  };

  answer = async (request: FastifyRequest<AnswerRoute>, reply: FastifyReply) =>
    reply
      .code(202)
      .send(await this.continuations.answer(request.account!.id, request.params.id, request.body));

  requestRevision = async (request: FastifyRequest<RevisionRoute>, reply: FastifyReply) =>
    reply
      .code(202)
      .send(
        await this.continuations.requestRevision(
          request.account!.id,
          request.params.id,
          request.body,
        ),
      );
}
