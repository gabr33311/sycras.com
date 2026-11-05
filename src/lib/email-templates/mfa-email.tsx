import React from "react";
import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

/** The code that lets the owner in without the authenticator app (it turns two-step off). */
const CodeEmail = ({ code }: { code?: string }) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>O teu código para entrar na SYCRAS: {code ?? ""}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SYCRAS</Text>
        <Heading style={h1}>Entrar sem a app autenticadora</Heading>
        <Text style={text}>Escreve este código no ecrã de entrada:</Text>
        <Text style={codeStyle}>{code}</Text>
        <Text style={text}>
          Ao entrares com ele, a verificação em dois passos fica desligada. Podes voltar a ativá-la
          em Definições → Conta.
        </Text>
        <Text style={footer}>
          O código é válido durante 10 minutos. Se não foste tu a pedi-lo, alguém sabe a tua
          palavra-passe: muda-a já.
        </Text>
      </Container>
    </Body>
  </Html>
);

/** Sent after two-step was turned off with an email code. */
const OffEmail = () => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>A verificação em dois passos foi desligada</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SYCRAS</Text>
        <Heading style={h1}>A verificação em dois passos foi desligada</Heading>
        <Text style={text}>
          Alguém entrou na tua conta com a palavra-passe e um código enviado para este email, e a
          verificação em dois passos foi desligada. Podes voltar a ativá-la em Definições → Conta.
        </Text>
        <Text style={text}>
          Se não foste tu, muda já a palavra-passe e escreve-nos para suporte@sycras.com.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const codeTemplate = {
  component: CodeEmail,
  subject: (d) => `${d["code"] ?? ""} é o teu código para entrar na SYCRAS`,
  displayName: "Código para entrar sem a app autenticadora",
  previewData: { code: "482913" },
} satisfies TemplateEntry;

export const offTemplate = {
  component: OffEmail,
  subject: "A verificação em dois passos foi desligada",
  displayName: "Aviso: verificação em dois passos desligada",
  previewData: {},
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "32px 24px", maxWidth: "520px" };
const brand = {
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#666666",
  margin: "0 0 8px",
};
const h1 = { fontSize: "24px", fontWeight: 800, color: "#111111", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "22px", color: "#111111" };
const codeStyle = {
  fontSize: "34px",
  fontWeight: 800,
  letterSpacing: "0.3em",
  color: "#111111",
  margin: "20px 0",
};
const footer = { fontSize: "13px", color: "#666666" };
