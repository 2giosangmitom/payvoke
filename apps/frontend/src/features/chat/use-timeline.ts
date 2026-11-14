import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectionPhase } from "@/src/components/assistant-ui/elements/connection-state";
import {
  getTimeline,
  threadEventsUrl,
  type Timeline,
  type TimelineDelta,
} from "@/src/features/chat/api";

export const timelineKey = (threadId: string) => ["thread", threadId, "timeline"] as const;

// Appends one streamed token to the text part it names. A delta for a part the
// cached timeline does not have yet is dropped; the next timeline carries it.
function applyDelta(timeline: Timeline, delta: TimelineDelta): Timeline {
  return {
    ...timeline,
    messages: timeline.messages.map((message) =>
      message.id !== delta.messageId
        ? message
        : {
            ...message,
            parts: message.parts.map((part) =>
              part.type === "text" && part.id === delta.partId
                ? { ...part, text: part.text + delta.delta }
                : part,
            ),
          },
    ),
  };
}

// The thread as the API projects it, kept live over SSE: every connection
// starts with a whole `timeline`, structural changes resend it, and text
// tokens arrive as `delta` events. A dropped stream reconnects with backoff
// and the first timeline after it replaces whatever was missed. A draft chat
// (null) has no thread yet: nothing is fetched and no stream is opened.
export function useThreadTimeline(threadId: string | null) {
  const queryClient = useQueryClient();
  const timeline = useQuery({
    queryKey: timelineKey(threadId ?? ""),
    queryFn: () => getTimeline(threadId!),
    enabled: Boolean(threadId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [connection, setConnection] = useState<{ phase: ConnectionPhase; attempt: number }>({
    phase: "online",
    attempt: 0,
  });

  useEffect(() => {
    if (!threadId) return;
    let closed = false;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      source = new EventSource(threadEventsUrl(threadId), { withCredentials: true });
      source.addEventListener("timeline", (event) => {
        let next: Timeline;
        try {
          next = JSON.parse((event as MessageEvent<string>).data) as Timeline;
        } catch {
          return;
        }
        queryClient.setQueryData(timelineKey(threadId), next);
        // Allowance, the active quote and availability follow the timeline.
        void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] });
        if (attempt > 0) {
          attempt = 0;
          setConnection({ phase: "resumed", attempt: 0 });
          settle = setTimeout(() => setConnection({ phase: "online", attempt: 0 }), 2500);
        }
      });
      source.addEventListener("delta", (event) => {
        let delta: TimelineDelta;
        try {
          delta = JSON.parse((event as MessageEvent<string>).data) as TimelineDelta;
        } catch {
          return;
        }
        queryClient.setQueryData<Timeline>(timelineKey(threadId), (current) =>
          current ? applyDelta(current, delta) : current,
        );
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (closed) return;
        attempt += 1;
        setConnection({ phase: "reconnecting", attempt });
        retry = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt - 1, 4), 15000));
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (settle) clearTimeout(settle);
      source?.close();
    };
  }, [threadId, queryClient]);

  return { timeline, connection };
}
