import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConsoleShell } from "@/src/components/console-shell";

// The signed-in workspace: chats, tool runs, payments and Studio share one
// app shell instead of the public site's header and footer.
export const Route = createFileRoute("/console")({ component: ConsoleLayout });

function ConsoleLayout() {
  return (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  );
}
