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

interface Props {
  businessName?: string;
  serviceName?: string;
  day?: string;
  bookUrl?: string;
  brandColor?: string;
  brandText?: string;
}

/** The client asked to be told: a time opened on the day that was full. */
const Email = ({ businessName, serviceName, day, bookUrl, brandColor, brandText }: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>Abriu uma vaga{day ? ` para ${day}` : ""}</Preview>
    <Body style={main}>
      <Container style={container}>
        {businessName && <Text style={brand}>{businessName}</Text>}
        <Heading style={h1}>Abriu uma vaga</Heading>
        <Text style={text}>
          Pediu para ser avisado: já há horas livres{day ? ` ${day}` : ""}
          {serviceName ? ` para ${serviceName}` : ""}. As vagas são para quem marcar primeiro.
        </Text>
        {bookUrl && (
          <Button
            href={bookUrl}
            style={{
              ...button,
              backgroundColor: brandColor || "#0a6cf0",
              color: brandText || "#ffffff",
            }}
          >
            Marcar agora
          </Button>
        )}
        <Text style={footer}>
          Recebeu este email porque pediu para ser avisado na página de{" "}
          {businessName || "este negócio"}. É o único aviso que enviamos.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d) => `Abriu uma vaga${d["businessName"] ? ` em ${d["businessName"]}` : ""}`,
  displayName: "Abriu uma vaga (lista de espera)",
  previewData: {
    businessName: "Barbearia Lisboa",
    serviceName: "Corte",
    day: "sábado, 28 de novembro",
    bookUrl: "https://sycras.com/exemplo",
  },
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
const h1 = { fontSize: "26px", fontWeight: 800, color: "#111111", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "22px", color: "#111111" };
const button = {
  display: "inline-block",
  padding: "14px 22px",
  borderRadius: "12px",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  margin: "12px 0 20px",
};
const footer = { fontSize: "12px", color: "#888888" };
