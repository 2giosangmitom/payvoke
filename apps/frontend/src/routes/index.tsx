import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/src/components/landing-page";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <LandingPage />;
}
