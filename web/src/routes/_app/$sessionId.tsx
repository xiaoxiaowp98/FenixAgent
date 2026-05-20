import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const SessionDetail = lazy(() => import("../../pages/SessionDetail").then((m) => ({ default: m.SessionDetail })));

export const Route = createFileRoute("/_app/$sessionId")({
  component: SessionRoute,
});

function SessionRoute() {
  const { sessionId } = Route.useParams();
  const search = Route.useSearch<{ cwd?: string; agentId?: string }>();
  return (
    <Suspense>
      <SessionDetail key={sessionId} sessionId={sessionId} agentId={search.agentId} initialCwd={search.cwd} />
    </Suspense>
  );
}
