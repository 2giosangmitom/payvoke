import { createFileRoute } from "@tanstack/react-router";
import { ApprovePage } from "@/src/features/payments/approve-page";

export const Route = createFileRoute("/console/approve/$quoteId")({
  component: ApproveRoute,
  staticData: {
    title: "Approve payment",
    description: "Approve a payment your AI assistant asked for.",
  },
});

function ApproveRoute() {
  const { quoteId } = Route.useParams();
  return <ApprovePage key={quoteId} quoteId={quoteId} />;
}
