import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { Rating, RatingButton } from "@/src/components/ui/rating";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Spinner } from "@/src/components/ui/spinner";
import { Textarea } from "@/src/components/ui/textarea";
import { ErrorNotice, SectionHeader, errorMessage, plural } from "@/src/components/layout/page-kit";
import { PersonAvatar, Stars } from "@/src/features/apps/agent-facts";
import { getRatings, rateApp, unrateApp, type Ratings } from "@/src/features/people/api";

const COMMENT_MAX = 500;
const words = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

const reasons: Record<string, string> = {
  SIGN_IN: "Sign in to rate this agent.",
  OWN_APP: "You can't rate your own agent.",
  HIRE_FIRST: "You can rate this agent after you hire it for a job.",
};

const when = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// How the ratings spread over one to five stars, five first.
function Distribution({ ratings }: { ratings: Ratings }) {
  const reduce = useReducedMotion();
  const most = Math.max(1, ...ratings.distribution);
  return (
    <div className="grid gap-1.5">
      {[5, 4, 3, 2, 1].map((score) => {
        const value = ratings.distribution[score - 1];
        return (
          <div
            key={score}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs"
          >
            <span className="text-muted-foreground tabular-nums">{score}★</span>
            <span className="h-1.5 overflow-hidden bg-muted">
              <motion.span
                className="block h-full origin-left bg-primary"
                initial={reduce ? false : { transform: "scaleX(0)" }}
                whileInView={{ transform: `scaleX(${value / most})` }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: (5 - score) * 0.04 }}
              />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function RateForm({ appId, ratings }: { appId: string; ratings: Ratings }) {
  const queryClient = useQueryClient();
  const [score, setScore] = useState(ratings.mine?.score ?? 0);
  const [comment, setComment] = useState(ratings.mine?.comment ?? "");
  useEffect(() => {
    setScore(ratings.mine?.score ?? 0);
    setComment(ratings.mine?.comment ?? "");
  }, [ratings.mine?.score, ratings.mine?.comment]);
  const done = (next: Ratings) => {
    queryClient.setQueryData(["ratings", appId], next);
    void queryClient.invalidateQueries({ queryKey: ["store"] });
  };
  const save = useMutation({
    mutationFn: () => rateApp(appId, { score, comment: comment.trim() || null }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => unrateApp(appId), onSuccess: done });
  const changed =
    score !== (ratings.mine?.score ?? 0) || comment.trim() !== (ratings.mine?.comment ?? "");

  return (
    <form
      className="grid gap-3 border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (score) save.mutate();
      }}
    >
      <p className="text-sm font-medium">{ratings.mine ? "Your rating" : "Rate this agent"}</p>
      <div className="flex items-center gap-3">
        <Rating value={score} onValueChange={setScore} className="text-primary">
          {Array.from({ length: 5 }, (_, index) => (
            <RatingButton
              key={index}
              size={22}
              className="text-primary/35 transition-[color,scale] duration-150 ease-out active:scale-90 data-active:text-primary"
            />
          ))}
        </Rating>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {words[score] || "Pick a score"}
        </span>
      </div>
      <Textarea
        rows={3}
        maxLength={COMMENT_MAX}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="What did it do well, and what could be better? (optional)"
        aria-label="Comment"
      />
      {(save.isError || remove.isError) && (
        <ErrorNotice className="my-0">{errorMessage(save.error ?? remove.error)}</ErrorNotice>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!score || !changed || save.isPending}>
          {save.isPending && <Spinner />} {ratings.mine ? "Update rating" : "Post rating"}
        </Button>
        {ratings.mine && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending && <Spinner />} Remove
          </Button>
        )}
        <span className="ml-auto text-xs text-faint tabular-nums">
          {comment.length}/{COMMENT_MAX}
        </span>
      </div>
    </form>
  );
}

/** Ratings of one agent: the average, how they spread, the latest reviews and the viewer's own. */
export function AgentRatings({ appId }: { appId: string }) {
  const ratings = useQuery({
    queryKey: ["ratings", appId],
    queryFn: () => getRatings(appId),
    staleTime: 15_000,
  });
  const reduce = useReducedMotion();

  return (
    <section aria-labelledby="ratings-title" className="mt-14">
      <SectionHeader
        id="ratings-title"
        eyebrow="Ratings"
        title="What buyers say"
        aside="Only people who hired the agent can rate it."
      />
      {ratings.isPending ? (
        <div
          role="status"
          aria-busy="true"
          className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
        >
          <span className="sr-only">Loading ratings</span>
          <Skeleton className="h-40" />
          <div className="grid gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      ) : ratings.isError ? (
        <ErrorNotice onRetry={() => void ratings.refetch()}>
          {errorMessage(ratings.error, "Couldn't load ratings.")}
        </ErrorNotice>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="grid gap-5 lg:sticky lg:top-20">
            <div className="grid gap-4 border border-border bg-card p-5">
              <div className="flex items-end gap-3">
                <span className="font-mono text-5xl leading-none tabular-nums">
                  {ratings.data.average?.toFixed(1) ?? "–"}
                </span>
                <div className="grid gap-1 pb-0.5">
                  <Stars value={ratings.data.average} size={16} />
                  <span className="text-xs text-muted-foreground">
                    {ratings.data.count ? plural(ratings.data.count, "rating") : "No ratings yet"}
                  </span>
                </div>
              </div>
              <Distribution ratings={ratings.data} />
            </div>
            {ratings.data.canRate ? (
              <RateForm appId={appId} ratings={ratings.data} />
            ) : (
              <p className="border border-dashed border-border-strong/60 px-4 py-3 text-sm text-muted-foreground">
                {reasons[ratings.data.reason ?? ""] ?? "Ratings are closed for this agent."}
                {ratings.data.reason === "HIRE_FIRST" && (
                  <>
                    {" "}
                    <Link to="/console/activity" className="text-primary hover:underline">
                      Your jobs
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>

          {ratings.data.items.length === 0 ? (
            <p className="border border-dashed border-border-strong/60 px-4 py-10 text-center text-sm text-muted-foreground">
              Nobody has rated this agent yet.
            </p>
          ) : (
            <ul className="grid border-t border-border">
              <AnimatePresence initial={false}>
                {ratings.data.items.map((item) => (
                  <motion.li
                    key={item.author.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="grid gap-2 border-b border-border py-4"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        to="/developers/$userId"
                        params={{ userId: item.author.id }}
                        className="flex min-w-0 items-center gap-2 text-sm font-medium hover:text-primary"
                      >
                        <PersonAvatar person={item.author} />
                        <span className="truncate">{item.author.name}</span>
                      </Link>
                      {item.mine && <span className="text-xs text-primary">You</span>}
                      <Stars value={item.score} size={13} />
                      <time
                        dateTime={item.updatedAt}
                        className="ml-auto font-mono text-[11px] text-faint"
                      >
                        {when(item.updatedAt)}
                      </time>
                    </div>
                    {item.comment && (
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                        {item.comment}
                      </p>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
