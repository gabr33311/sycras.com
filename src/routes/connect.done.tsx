import { createFileRoute } from "@tanstack/react-router";

// Where Stripe sends a barber back after the payments sign-up started in the phone app.
export const Route = createFileRoute("/connect/done")({
  head: () => ({
    meta: [{ title: "Pagamentos — SYCRAS" }, { name: "robots", content: "noindex" }],
  }),
  component: ConnectDone,
});

function ConnectDone() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold">Volta à SYCRAS</h1>
      <p className="text-muted-foreground">
        Na app vês se a conta de pagamentos ficou pronta. Se faltar algum dado, podes continuar o
        registo a partir de lá.
      </p>
      <a
        href="sycras://gestao"
        className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-semibold text-primary-foreground"
      >
        Voltar à SYCRAS
      </a>
    </main>
  );
}
