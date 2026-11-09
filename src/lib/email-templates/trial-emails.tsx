import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

// The three emails of the free trial: day 5 (how it is going), 3 days before the end,
// and the day it ends. Same look as the other owner emails.

interface Props {
  businessName?: string;
  /** Bookings received so far (day 7). */
  bookings?: string;
  /** Free days still left (day 5). */
  daysLeft?: string;
  plansUrl?: string;
  pageUrl?: string;
}

const PRICE = "19 € por mês ou 180 € por ano (−20%)";

const Shell = ({ preview, children }: { preview: string; children: React.ReactNode }) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SYCRAS</Text>
        {children}
        <Text style={footer}>Alguma dúvida? Responde a este email.</Text>
      </Container>
    </Body>
  </Html>
);

const Week = ({ businessName, bookings, daysLeft, pageUrl }: Props) => {
  const n = Number(bookings ?? 0);
  return (
    <Shell preview="Os teus primeiros dias com a SYCRAS">
      <Heading style={h1}>Os primeiros dias de SYCRAS</Heading>
      <Text style={text}>
        {n > 0
          ? `${businessName ?? "O teu negócio"} já recebeu ${n} ${n === 1 ? "marcação" : "marcações"} pela SYCRAS. Cada uma é um telefonema a menos.`
          : `A página ${businessName ? `de ${businessName} ` : ""}está pronta, mas ainda não recebeu marcações. Põe o link na bio do Instagram e envia-o aos teus clientes habituais por WhatsApp.`}
      </Text>
      <Text style={text}>
        Ainda tens {daysLeft ?? "9"} dias grátis. Dica: em Gestão → Marcações escolhes se aprovas cada pedido ou se
        ficam logo confirmados.
      </Text>
      {pageUrl && (
        <Button href={pageUrl} style={button}>
          Abrir a minha página
        </Button>
      )}
    </Shell>
  );
};

const Ending = ({ businessName, plansUrl }: Props) => (
  <Shell preview="Faltam 3 dias do teu SYCRAS Pro grátis">
    <Heading style={h1}>Faltam 3 dias</Heading>
    <Text style={text}>
      O teu período grátis {businessName ? `de ${businessName} ` : ""}acaba daqui a 3 dias. Para a tua
      página continuar a receber marcações, subscreve o SYCRAS Pro: {PRICE}.
    </Text>
    <Text style={text}>
      Se subscreveres agora, a primeira cobrança só acontece no fim do período grátis.
    </Text>
    {plansUrl && (
      <Button href={plansUrl} style={button}>
        Continuar com o SYCRAS Pro
      </Button>
    )}
  </Shell>
);

const Ended = ({ businessName, plansUrl }: Props) => (
  <Shell preview="O teu período grátis da SYCRAS acabou">
    <Heading style={h1}>O teu período grátis acabou</Heading>
    <Text style={text}>
      A página {businessName ? `de ${businessName} ` : ""}deixou de aceitar marcações novas. As tuas
      marcações, clientes e definições ficam todos guardados.
    </Text>
    <Text style={text}>Subscreve o SYCRAS Pro ({PRICE}) e tudo volta a funcionar na hora.</Text>
    {plansUrl && (
      <Button href={plansUrl} style={button}>
        Reativar a minha página
      </Button>
    )}
  </Shell>
);

const preview = {
  businessName: "Barbearia Lisboa",
  bookings: "12",
  daysLeft: "9",
  plansUrl: "https://sycras.com/plans",
  pageUrl: "https://sycras.com/exemplo",
};

export const trialWeek = {
  component: Week,
  subject: "Os teus primeiros dias com a SYCRAS",
  displayName: "Teste grátis: dia 5",
  previewData: preview,
} satisfies TemplateEntry;

export const trialEnding = {
  component: Ending,
  subject: "Faltam 3 dias do teu SYCRAS Pro grátis",
  displayName: "Teste grátis: faltam 3 dias",
  previewData: preview,
} satisfies TemplateEntry;

export const trialEnded = {
  component: Ended,
  subject: "O teu período grátis da SYCRAS acabou",
  displayName: "Teste grátis: acabou",
  previewData: preview,
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "32px 24px", maxWidth: "520px" };
const brand = {
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "#666666",
  margin: "0 0 8px",
};
const h1 = { fontSize: "24px", fontWeight: 800, color: "#111111", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "22px", color: "#111111" };
const button = {
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  borderRadius: "10px",
  padding: "12px 20px",
  marginTop: "16px",
  backgroundColor: "#0a6cf0",
  color: "#ffffff",
};
const footer = { fontSize: "13px", color: "#666666", marginTop: "24px" };
