import React from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  businessName?: string;
  serviceName?: string;
  weeks?: string;
  bookUrl?: string;
  brandColor?: string;
  brandText?: string;
}

/** Some weeks after a visit: time for the next one, with the booking link. */
const Email = ({ name, businessName, serviceName, weeks, bookUrl, brandColor, brandText }: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>Está na hora de voltar{businessName ? ` a ${businessName}` : ""}</Preview>
    <Body style={main}>
      <Container style={container}>
        {businessName && <Text style={brand}>{businessName}</Text>}
        <Heading style={h1}>Está na hora de voltar</Heading>
        <Text style={text}>
          Olá {name || "cliente"}, já passaram {weeks || "algumas"} semanas desde a sua última visita
          {serviceName ? ` (${serviceName})` : ""}. Marque a próxima num minuto, à hora que lhe der jeito.
        </Text>
        {bookUrl && (
          <Button
            href={bookUrl}
            style={{ ...button, backgroundColor: brandColor || "#0a6cf0", color: brandText || "#ffffff" }}
          >
            Marcar a próxima visita
          </Button>
        )}
        <Text style={footer}>Recebeu este email porque é cliente de {businessName || "este negócio"}.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d) => `${d["name"] ? `${d["name"]}, e` : "E"}stá na hora de voltar${d["businessName"] ? ` a ${d["businessName"]}` : ""}`,
  displayName: "Está na hora de voltar",
  previewData: {
    name: "Ana",
    businessName: "Barbearia Lisboa",
    serviceName: "Corte",
    weeks: "4",
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
