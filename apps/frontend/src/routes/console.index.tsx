import { createFileRoute } from "@tanstack/react-router";
import { ConsoleHome } from "@/src/components/console-home";

export const Route = createFileRoute("/console/")({
  component: ConsoleHome,
  head: () => ({ meta: [{ title: "Console · Payvoke" }] }),
});
