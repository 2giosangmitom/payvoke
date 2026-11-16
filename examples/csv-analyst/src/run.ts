import { planner, writer } from "./agents";
import type { Commands } from "./chat";
import {
  aggregate,
  CsvError,
  MAX_BYTES,
  numericColumns,
  outliers,
  parseCsv,
  profile as profileOf,
  toCsv,
  type Outlier,
  type Point,
  type Profile,
  type Row,
} from "./csv";
import type { InvocationReadyEvent, Payvoke, RevisionEvent, ToolResultEvent } from "./payvoke";
import { Run } from "./payvoke";
import {
  defaultPlan,
  planPrompt,
  planSchema,
  validatePlan,
  type ChartSpec,
  type Plan,
} from "./plan";
import { columnsTable, headline, mdTable, runProfile } from "./profile";
import { jobs, type Job } from "./state";
import * as ui from "./ui";

// Paid work. Each feed event starts one run: ACK it, report `started`,
// stream progress and UI, then end with `tool_call`, `result` or `failed`.

const AUTO = "auto";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function handleReady(
  api: Payvoke,
  commands: Commands,
  ev: InvocationReadyEvent & { id: string },
) {
  const command = commands.byId.get(ev.input.commandId);
  const args = ev.input.arguments;
  const run = await claim(api, ev.invocationId, ev.id, ev.runId);
  if (!run) return;
  // Instant /profile: the CSV text is an argument and there are no files. It
  // allows no revisions, so no job state is kept.
  if (command === "profile")
    return guard(run, async () => {
      await run.report({ type: "started", data: { command } });
      await runProfile(run, args, (name, type, body) => uploads(run, [[name, type, body]]));
    });
  const fileId = str(args.file);
  const file = ev.input.context.files.find((f) => f.fileId === fileId) ?? ev.input.context.files[0];
  await guard(run, async () => {
    if (command !== "analyze" || !file) throw new CsvError("This job has no CSV file attached.");
    const job: Job = {
      command,
      threadId: ev.threadId,
      fileId: file.fileId,
      fileName: file.name,
      goal: str(args.goal),
      depth: args.depth === "deep" ? "deep" : "quick",
      artifactVersion: 0,
    };
    await jobs.put(ev.invocationId, job);
    await run.report({ type: "started", data: { command } });
    const data = await load(run, job);

    // Ask which metric matters, with the real column names. This ends the
    // run; the answer arrives as invocation.tool_result in a new run.
    const numbers = numericColumns(data.profile);
    if (numbers.length >= 2) {
      await run.finish({
        type: "tool_call",
        data: {
          toolCallId: `metric-${ev.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"),
          name: "ask_choice",
          args: {
            prompt: `I found ${numbers.length} numeric columns in ${ui.safe(job.fileName)}. Which one matters most?`,
            options: [
              ...numbers.slice(0, 11).map((c, i) => ({
                id: `col-${i}`,
                label: ui.safe(c.name, 120),
                description: `${c.min} to ${c.max}, mean ${c.mean}`,
              })),
              { id: AUTO, label: "Let the agent decide" },
            ],
          },
        },
      });
      return;
    }
    job.metric = numbers[0]?.name ?? null;
    await jobs.put(ev.invocationId, job);
    await analyze(run, job, data);
  });
}

export async function handleToolResult(api: Payvoke, ev: ToolResultEvent & { id: string }) {
  const run = await claim(api, ev.invocationId, ev.id, ev.runId);
  if (!run) return;
  await guard(run, async () => {
    const job = await jobs.get(ev.invocationId);
    if (!job) throw new Error("job state lost");
    await run.report({ type: "started", data: { resumedFrom: ev.toolCallId } });
    const data = await load(run, job);
    const selected = (ev.result as { selected?: string[] } | null)?.selected?.[0];
    const index = selected?.startsWith("col-") ? Number(selected.slice(4)) : NaN;
    job.metric = numericColumns(data.profile)[index]?.name ?? null;
    await jobs.put(ev.invocationId, job);
    await analyze(run, job, data);
  });
}

export async function handleRevision(api: Payvoke, ev: RevisionEvent & { id: string }) {
  const run = await claim(api, ev.invocationId, ev.id, ev.runId);
  if (!run) return;
  await guard(run, async () => {
    const job = await jobs.get(ev.invocationId);
    if (!job) throw new Error("job state lost");
    await run.report({ type: "started", data: { revision: true } });
    const data = await load(run, job);
    await analyze(run, job, data, ev.reason);
  });
}

async function claim(api: Payvoke, invocationId: string, eventId: string, runId: string) {
  const ack = await api.ackRun(invocationId, eventId);
  if (ack.status !== "ACKED") {
    console.warn(`run ${runId}: already ${ack.status}, skipping`);
    return null;
  }
  return new Run(api, invocationId, ack.runId ?? runId);
}

// Any failure ends the run with `failed`, which refunds the buyer in full.
async function guard(run: Run, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    const known = error instanceof CsvError;
    console.error(`run ${run.runId} failed: ${error instanceof Error ? error.message : error}`);
    try {
      await run.startText(`failed-${run.runId}`.slice(0, 100));
      await run.text(
        known
          ? `I could not analyze this file: ${(error as Error).message} You will be refunded automatically.`
          : "Something went wrong on my side. You will be refunded automatically.",
      );
      await run.finish({
        type: "failed",
        data: { reason: known ? (error as Error).message : "internal_error" },
      });
    } catch (reportError) {
      // If even the report fails, the delivery deadline refunds the buyer.
      console.error(`run ${run.runId}: could not report failure: ${reportError}`);
    }
  }
}

type Data = { rows: Row[]; profile: Profile };

async function load(run: Run, job: Job): Promise<Data> {
  await run.progress("read", `Reading ${ui.safe(job.fileName, 60)}`);
  const bytes = await run.api.download(run.invocationId, job.fileId);
  if (bytes.byteLength > MAX_BYTES) throw new CsvError("The file is larger than 5 MB.");
  const rows = parseCsv(new TextDecoder().decode(bytes));
  const profile = profileOf(rows);
  if (profile.columns.every((c) => c.type === "empty"))
    throw new CsvError("Every column is empty.");
  await run.progress(
    "read",
    "Read the file",
    "done",
    `${profile.rows} rows, ${profile.columns.length} columns`,
  );
  return { rows, profile };
}

async function analyze(run: Run, job: Job, { rows, profile }: Data, feedback?: string) {
  const deep = job.depth === "deep";
  const max = deep ? 5 : 2;

  await run.progress("plan", "Choosing charts");
  const plan = await makePlan(profile, job, max, feedback);
  await run.progress(
    "plan",
    "Chose charts",
    "done",
    plan.source === "model"
      ? `${plan.charts.length} charts picked by the model`
      : "Model unavailable, used the default plan",
  );

  await run.progress("ui", "Building the dashboard");
  const charts = plan.charts.map((spec) => ({
    spec,
    title: chartTitle(spec),
    points: aggregate(rows, profile, spec.groupBy, spec.metric, spec.agg),
  }));
  const focus = profile.columns.find((c) => c.name === job.metric) ?? numericColumns(profile)[0];
  const found = deep && focus ? outliers(rows, focus) : [];

  // Each patch defines one section and redefines the root to include it, so
  // the buyer watches the dashboard fill in.
  const sections: string[] = [];
  const add = (id: string, patch: string) => {
    sections.push(id);
    return run.surface("dashboard", `${patch}\n${ui.root(sections)}`);
  };
  await add(
    "head",
    ui.header(
      "head",
      `Analysis of ${job.fileName}`,
      job.goal ? `Goal: ${job.goal}` : "No goal given",
    ),
  );
  await add("kpi", ui.metrics("kpi", headline(profile, focus?.name)));
  for (const [i, c] of charts.entries())
    if (c.points.length) await add(`ch${i}`, ui.chart(`ch${i}`, c.title, c.points));
  if (deep && focus) await add("out", ui.outlierCard("out", focus.name, found));
  await add("cols", ui.profileCard("cols", profile));
  await run.progress("ui", "Built the dashboard", "done");

  await run.progress("write", "Writing the analysis");
  const narrative = await write(run, job, profile, charts, found, feedback);
  await run.progress("write", "Wrote the analysis", "done");

  await run.progress("files", "Saving files");
  const files = await uploads(run, [
    [
      "analysis.json",
      "application/json",
      JSON.stringify({ profile, plan, charts, outliers: found }, null, 2),
    ],
    [
      "summary.csv",
      "text/csv",
      toCsv(
        ["chart", "label", "value"],
        charts.flatMap((c) => c.points.map((p) => [c.title, p.label, p.value])),
      ),
    ],
  ]);
  await run.progress("files", "Saved files", "done", `${files.length} files`);

  await run.finish({
    type: "result",
    data: {
      artifactVersion: await nextVersion(run, job),
      output: analysisMarkdown(job, profile, narrative, charts, found),
      files,
    },
  });
}

async function makePlan(profile: Profile, job: Job, max: number, feedback?: string): Promise<Plan> {
  const prompt = planPrompt(profile, { goal: job.goal, metric: job.metric ?? null, max, feedback });
  // Two tries: small free models fail often, and usually succeed on retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await planner.generate(prompt, {
        // Schema in the system prompt instead of response_format, which not
        // every free OpenRouter model supports.
        structuredOutput: { schema: planSchema, jsonPromptInjection: true },
        abortSignal: AbortSignal.timeout(45_000),
      });
      const charts = validatePlan(out.object, profile, max);
      if (charts.length) return { charts, source: "model" };
    } catch (error) {
      console.warn(
        `planner attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return { charts: defaultPlan(profile, job.metric ?? null, max), source: "fallback" };
}

type ChartData = { spec: ChartSpec; title: string; points: Point[] };

async function write(
  run: Run,
  job: Job,
  profile: Profile,
  charts: ChartData[],
  found: Outlier[],
  feedback?: string,
): Promise<string> {
  const facts = [
    `Dataset: ${profile.rows} rows, ${profile.columns.length} columns.`,
    job.goal ? `Buyer's goal: ${job.goal}` : "",
    feedback ? `The buyer asked to revise the previous version: ${feedback}` : "",
    ...numericColumns(profile)
      .slice(0, 8)
      .map(
        (c) =>
          `${c.name}: min ${c.min}, max ${c.max}, mean ${c.mean}, median ${c.median}, total ${c.sum}.`,
      ),
    ...charts.map(
      (c) =>
        `${c.title}: ${c.points
          .slice(0, 8)
          .map((p) => `${p.label} = ${p.value}`)
          .join("; ")}.`,
    ),
    found.length
      ? `Outliers in ${job.metric}: ${found.map((o) => `${o.value} on line ${o.row}`).join(", ")}.`
      : "",
  ].filter(Boolean);
  const length =
    job.depth === "deep" ? "3 to 5 short paragraphs" : "one paragraph of 3 or 4 sentences";
  const prompt = `Write ${length} about this data.\n\n${facts.join("\n")}`;

  await run.startText(`analysis-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));
  let all = "";
  let pending = "";
  let flushedAt = Date.now();
  try {
    const out = await writer.stream(prompt, { abortSignal: AbortSignal.timeout(120_000) });
    for await (const delta of out.textStream) {
      all += delta;
      pending += delta;
      // Batch deltas: one HTTP request per ~0.4 s instead of per token.
      if (pending.length > 300 || Date.now() - flushedAt > 400) {
        await run.text(pending);
        pending = "";
        flushedAt = Date.now();
      }
    }
    await run.text(pending);
  } catch (error) {
    console.warn(`writer: ${error instanceof Error ? error.message : error}`);
  }
  if (!all.trim()) {
    all = `The model was unavailable, so this report has no written analysis. Every number above was computed directly from the file.`;
    await run.text(all);
  }
  await run.endText();
  return all.trim();
}

// Result files are optional extras: if uploads fail, deliver without them.
async function uploads(run: Run, files: [string, string, string][]): Promise<{ fileId: string }[]> {
  const ids: { fileId: string }[] = [];
  for (const [name, type, body] of files) {
    try {
      ids.push({
        fileId: await run.api.upload(run.invocationId, name, type, new TextEncoder().encode(body)),
      });
    } catch (error) {
      console.warn(`upload ${name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return ids;
}

async function nextVersion(run: Run, job: Job) {
  job.artifactVersion += 1;
  await jobs.put(run.invocationId, job);
  return job.artifactVersion;
}

const chartTitle = (s: ChartSpec) =>
  s.agg === "count"
    ? `Rows by ${s.groupBy}`
    : `${s.agg === "mean" ? "Average" : "Total"} ${s.metric} by ${s.groupBy}`;

function analysisMarkdown(
  job: Job,
  p: Profile,
  narrative: string,
  charts: ChartData[],
  found: Outlier[],
) {
  const parts = [
    `# Analysis of ${job.fileName}`,
    job.goal ? `**Goal:** ${job.goal}` : "",
    `${p.rows} rows, ${p.columns.length} columns.`,
    `## Findings\n\n${narrative}`,
    ...charts.map(
      (c) =>
        `## ${c.title}\n\n${mdTable(
          [c.spec.groupBy, c.spec.metric ?? "rows"],
          c.points.map((pt) => [pt.label, pt.value]),
        )}`,
    ),
    job.depth === "deep"
      ? `## Outliers\n\n${
          found.length
            ? mdTable(
                ["CSV line", "Value", "z-score"],
                found.map((o) => [o.row, o.value, o.z]),
              )
            : "None found (no value more than 3 standard deviations from the mean)."
        }`
      : "",
    `## Columns\n\n${columnsTable(p)}`,
  ];
  return parts.filter(Boolean).join("\n\n").slice(0, 60_000) + "\n";
}
