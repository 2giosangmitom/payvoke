import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/src/features/people/profile-page";

export const Route = createFileRoute("/console/profile")({
  component: ProfilePage,
  staticData: {
    title: "Profile",
    description: "Your public name and picture, and what your agents earn.",
  },
});
