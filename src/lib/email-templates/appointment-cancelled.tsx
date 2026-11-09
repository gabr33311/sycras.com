import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  businessName?: string;
  serviceName?: string;
  date?: string;
  time?: string;
  /** "1" when it was a request the business did not accept (not a cancelled booking). */
  declined?: string;
  /** The business page, to book another time. */
  bookUrl?: string;
  /** "5 €" when the deposit paid when booking was given back. */
  refunded?: string;
  brandColor?: string;
  brandText?: string;
}

/** The business cancelled the appointment (or did not accept the request): the client must know. */
const Email = ({
  name,
  businessName,
  serviceName,
  date,
  time,
  declined,
  bookUrl,
  refunded,
  brandColor,
  brandText,
}: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>
      {declined ? "Pedido de marcação não aceite" : "Marcação cancelada"}: {serviceName || ""}{" "}
      {date ? `· ${date}` : ""}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        {businessName && <Text style={brand}>{businessName}</Text>}
        <Heading style={h1}>{declined ? "Pedido não aceite" : "Marcação cancelada"}</Heading>
        <Text style={text}>
          {declined
            ? `Olá ${name || "cliente"}, lamentamos, mas não foi possível aceitar o seu pedido de marcação.`
            : `Olá ${name || "cliente"}, a sua marcação foi cancelada pelo ${businessName || "negócio"}.`}
        </Text>
        <Section style={box}>
          <Text style={row}>
            <b>Serviço:</b> {serviceName || "—"}
          </Text>
          <Text style={row}>
            <b>Data:</b> {date || "—"}
          </Text>
          <Text style={row}>
            <b>Hora:</b> {time || "—"}
          </Text>
          {refunded && (
            <Text style={row}>
              O sinal de {refunded} foi devolvido. Pode levar alguns dias a aparecer na sua conta.
            </Text>
          )}
        </Section>
        {bookUrl && (
          <Button
            href={bookUrl}
            style={{
              ...button,
              backgroundColor: brandColor || "#0a6cf0",
              color: brandText || "#ffffff",
            }}
          >
            Escolher outro horário
          </Button>
        )}
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d) =>
    d["declined"] ? "O seu pedido de marcação não foi aceite" : "A sua marcação foi cancelada",
  displayName: "Marcação cancelada",
  previewData: {
    name: "Ana",
    businessName: "Barbearia Lisboa",
    serviceName: "Corte",
    date: "sábado, 10 de outubro",
    time: "14:30",
    bookUrl: "https://sycras.com/barbearia-lisboa",
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
const h1 = { fontSize: "24px", fontWeight: 800, color: "#111111", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "22px", color: "#111111" };
const box = {
  border: "1px solid #e5e5e5",
  borderRadius: "10px",
  padding: "12px 16px",
  margin: "16px 0",
};
const row = { fontSize: "15px", color: "#111111", margin: "4px 0" };
const button = {
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  borderRadius: "10px",
  padding: "12px 20px",
};
