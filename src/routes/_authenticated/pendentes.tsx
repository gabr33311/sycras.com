import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/pendentes")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_authenticated/pendentes"!</div>;
}
