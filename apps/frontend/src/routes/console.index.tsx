import { createFileRoute } from "@tanstack/react-router";
import { ConsoleHome } from "@/src/features/console/console-home";

export const Route = createFileRoute("/console/")({
  component: ConsoleHome,
  staticData: { title: "Console" },
});
