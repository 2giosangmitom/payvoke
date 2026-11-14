import { Payvoke, type Report } from "../src/payvoke";
import { cvBytes } from "./fixtures";

export class FakePayvoke extends Payvoke {
  reports: (Report & { reportId: string; sequence: number })[] = [];
  messages: Parameters<Payvoke["sendMessage"]>[1][] = [];
  offers: Parameters<Payvoke["createOffer"]>[1][] = [];
  streams: Parameters<Payvoke["stream"]>[2][number][] = [];
  uploads: { name: string; contentType: string; bytes: Uint8Array }[] = [];
  seen = new Set<string>();
  bytes: Uint8Array = cvBytes;
  uploadError: Error | null = null;
  offerError: Error | null = null;
  nextAckStatus = "ACKED";
  constructor() {
    super("https://example.invalid", "test-app", "pvk_test");
  }

  override ackRun: Payvoke["ackRun"] = async (_id, eventId) => {
    if (this.seen.has(eventId)) return { runId: "claimed", status: "COMPLETED" };
    this.seen.add(eventId);
    return { runId: `claimed-${eventId}`, status: this.nextAckStatus };
  };
  override report: Payvoke["report"] = async (_id, report) => {
    this.reports.push(structuredClone(report));
    return { lastCommittedSequence: report.sequence };
  };
  override stream: Payvoke["stream"] = async (_id, _run, lines) => {
    this.streams.push(...structuredClone(lines));
    return { lastCommittedSequence: lines.at(-1)!.streamSequence };
  };
  override download: Payvoke["download"] = async () => this.bytes;
  override upload: Payvoke["upload"] = async (_id, name, contentType, bytes) => {
    if (this.uploadError) throw this.uploadError;
    this.uploads.push({ name, contentType, bytes });
    return `uploaded-${this.uploads.length}`;
  };
  override sendMessage: Payvoke["sendMessage"] = async (_id, message) => {
    this.messages.push(structuredClone(message));
    return { id: `reply-${this.messages.length}`, streaming: message.streaming ?? false };
  };
  override createOffer: Payvoke["createOffer"] = async (_id, offer) => {
    if (this.offerError) throw this.offerError;
    this.offers.push(structuredClone(offer));
    return { id: `offer-${this.offers.length}` };
  };
  override appendDelta: Payvoke["appendDelta"] = async () => ({ id: "reply" });
}
