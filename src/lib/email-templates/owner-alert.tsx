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
  title?: string;
  customerName?: string;
  serviceName?: string;
  when?: string;
  phone?: string;
  /** "1" when the owner still has to accept or decline it. */
  pending?: string;
  appUrl?: string;
}

/** To the owner: a new booking, a request to answer, a cancellation or a new time. */
const Email = ({ title, customerName, serviceName, when, phone, pending, appUrl }: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>{`${customerName ?? ""} · ${serviceName ?? ""} · ${when ?? ""}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SYCRAS</Text>
        <Heading style={h1}>{title}</Heading>
        <Text style={row}>
          <b>{customerName}</b>
          {phone ? ` · ${phone}` : ""}
        </Text>
        <Text style={row}>{serviceName}</Text>
        <Text style={row}>{when}</Text>
        {pending ? (
          <Text style={hint}>Este pedido espera pela tua resposta: confirma ou recusa.</Text>
        ) : null}
        {appUrl && (
          <Button href={appUrl} style={button}>
            {pending ? "Responder ao pedido" : "Abrir a agenda"}
          </Button>
        )}
        <Text style={footer}>
          Podes desligar estes emails nas Definições da SYCRAS, em «Avisos por email».
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d) => `${d["title"] ?? "Marcação"}: ${d["customerName"] ?? ""}`,
  displayName: "Aviso ao dono: marcação nova, pedido ou cancelamento",
  previewData: {
    title: "Novo pedido de marcação",
    customerName: "Mário Silva",
    serviceName: "Corte + Barba",
    when: "terça-feira, 27 de outubro às 11:30",
    phone: "912 345 678",
    pending: "1",
    appUrl: "https://sycras.com/today",
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
const row = { fontSize: "15px", lineHeight: "22px", color: "#111111", margin: "2px 0" };
const hint = { fontSize: "15px", lineHeight: "22px", color: "#b45309", margin: "14px 0 0" };
const button = {
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  borderRadius: "10px",
  padding: "12px 20px",
  marginTop: "18px",
  backgroundColor: "#0a6cf0",
  color: "#ffffff",
};
const footer = { fontSize: "13px", color: "#666666", marginTop: "24px" };
