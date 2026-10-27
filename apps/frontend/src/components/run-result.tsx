import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { ChatWidget } from "./chat-widget";
import { StageBadge } from "./activity-page";
import { ErrorNotice, LoadingState, PageHeader, PageShell, errorMessage } from "./page-kit";
import { QuestionForm } from "./question-form";
import { ResultView } from "./result-view";
import { RevisionControl } from "./thread-chat";
import { stageOf } from "@/src/lib/activity";
import { formatUsdc } from "@/src/lib/apps";
import { downloadFile, formatBytes } from "@/src/lib/files";
import {
  answerQuestion,
  getActivity,
  getInvocation,
  getSnapshot,
  getThread,
} from "@/src/lib/paid-chat";

// One tool run: live status, the verified result, delivered files and the
// in-scope follow-ups (answers, revisions) that stay inside the same hold.
export function RunResult({ invocationId }: { invocationId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const status = useQuery({
    queryKey: ["invocation", invocationId],
    queryFn: () => getInvocation(invocationId),
    refetchInterval: 4000,
  });
  const threadId = status.data?.threadId;
  const thread = useQuery({
    queryKey: ["thread", threadId, "details"],
    queryFn: () => getThread(threadId!),
    enabled: Boolean(threadId),
  });
  const snapshot = useQuery({
    queryKey: ["thread", threadId, "snapshot"],
    queryFn: () => getSnapshot(threadId!),
    enabled: Boolean(threadId),
    refetchInterval: 4000,
  });
  // Deadlines and the hold outcome come from the activity row.
  const activity = useQuery({
    queryKey: ["invocation", invocationId, "activity"],
    queryFn: async () =>
      (await getActivity()).items.find((item) => item.invocationId === invocationId) ?? null,
    refetchInterval: 15_000,
  });

  if (status.isPending) return <LoadingState className="px-8">Loading run…</LoadingState>;
  if (status.isError)
    return (
      <PageShell className="pt-10">
        <ErrorNotice onRetry={() => void status.refetch()}>
          {errorMessage(status.error, "Could not load this run.")}
        </ErrorNotice>
      </PageShell>
    );
  const invocation = snapshot.data?.invocations.find((item) => item.id === invocationId);
  const live = (snapshot.data?.messages ?? []).filter((m) => m.invocationId === invocationId);
  const questions = (snapshot.data?.questions ?? []).filter(
    (question) => question.invocationId === invocationId && question.status === "OPEN",
  );
  const used = (snapshot.data?.revisions ?? []).filter((r) => r.invocationId === invocationId);
  const remaining = Math.max(0, (thread.data?.revisionPolicy?.maxIncluded ?? 0) - used.length);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["thread", threadId] }),
      queryClient.invalidateQueries({ queryKey: ["invocation", invocationId] }),
    ]);

  return (
    <PageShell className="pt-10">
      <PageHeader
        eyebrow={`Run · ${invocationId.slice(0, 8)}`}
        title={thread.data?.app.name ?? "Tool run"}
        description={
          activity.data
            ? `${formatUsdc(activity.data.grossAmount)} held · ${stageOf(activity.data).detail}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activity.data && <StageBadge stage={stageOf(activity.data)} />}
            {thread.data && (
              <Button
                variant="outline"
                size="sm"
                render={<Link to="/console/run/$appId" params={{ appId: thread.data.appId }} />}
              >
                Run again
              </Button>
            )}
          </div>
        }
      />
      <div className="mt-8 grid gap-4">
        {live.length > 0 && invocation?.executionStatus !== "DELIVERED" && (
          <ChatWidget label="Live output" meta={status.data.executionStatus.toLowerCase()}>
            {live.map((message) => (
              <p key={message.messageId} className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
            ))}
          </ChatWidget>
        )}
        {questions.map((question) => (
          <ChatWidget key={question.id} label="The tool needs an answer">
            <QuestionForm
              question={question}
              onSubmit={async (values) => {
                await answerQuestion(
                  invocationId,
                  question.questionId,
                  values,
                  crypto.randomUUID(),
                );
                await refresh();
              }}
            />
          </ChatWidget>
        ))}
        {invocation?.executionStatus === "DELIVERED" && invocation.output !== null ? (
          <ChatWidget label="Verified result" meta={status.data.delivery?.evidenceLevel}>
            <ResultView output={invocation.output} />
            {invocation.files.length > 0 && (
              <ul aria-label="Delivered files" className="grid gap-1.5">
                {invocation.files.map((file) => (
                  <li key={file.fileId} className="min-w-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="max-w-full font-mono"
                      onClick={() =>
                        void downloadFile(file.fileId).catch((cause) =>
                          setError(errorMessage(cause)),
                        )
                      }
                    >
                      <Download />
                      <span className="truncate">{file.name}</span>
                      <span className="text-faint">{formatBytes(file.size)}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {remaining > 0 && <RevisionControl invocationId={invocationId} remaining={remaining} />}
          </ChatWidget>
        ) : (
          questions.length === 0 &&
          live.length === 0 && (
            <LoadingState>
              {status.data.paymentStatus === "HELD"
                ? "Payment held. Waiting for the tool to deliver…"
                : "Waiting for the payment hold to finalize…"}
            </LoadingState>
          )
        )}
        {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
      </div>
    </PageShell>
  );
}
