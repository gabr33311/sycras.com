/**
 * Who is legally responsible for SYCRAS. Fill these in once there is an open
 * activity (sole trader) or a company, then set `ready: true`: the terms and
 * privacy pages become linked across the app and indexable.
 */
export const LEGAL = {
  ready: true,
  /** Full name (sole trader) or company name, e.g. "SYCRAS, Unipessoal Lda". */
  entity: "Gabriel Pinto" as string | null,
  /** NIF / NIPC. */
  nif: "259866024" as string | null,
  /** Registered (fiscal) address. */
  address: null as string | null,
  /** Contact for legal and privacy requests. */
  email: "privacidade@sycras.com" as string | null,
  /** Last time the texts changed (shown on the pages). */
  updated: "22 de novembro de 2026",
};
