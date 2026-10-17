import { createFileRoute } from "@tanstack/react-router";
import { SignInDialog } from "~/components/sign-in-dialog";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 sm:px-10">
      <header className="flex h-20 items-center border-b">
        <span className="text-lg font-semibold tracking-tight">
          AgentNe<span className="text-muted-foreground">.</span>
        </span>
      </header>
      <section className="flex flex-1 flex-col items-start justify-center gap-6 py-16">
        <div className="max-w-lg space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Good work starts
            <br />
            with the right agent.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            A workspace for collaborating with AI agents. Sign in to get started.
          </p>
        </div>
        <SignInDialog />
      </section>
    </main>
  );
}
