import { template as appointmentConfirmed } from "./appointment-confirmed";
import { template as appointmentReminder } from "./appointment-reminder";
import { template as bookingCode } from "./booking-code";
import { template as appointmentCancelled } from "./appointment-cancelled";
import { template as appointmentReview } from "./appointment-review";
import { template as dataExport } from "./data-export";
import { template as ownerNudge } from "./owner-nudge";
import { template as errorSummary } from "./error-summary";
import { template as ownerAlert } from "./owner-alert";
import { trialEnded, trialEnding, trialWeek } from "./trial-emails";
import type { ComponentType } from "react";

/** Values passed to a template: plain strings (names, dates, times). */
export type TemplateData = Record<string, string | undefined>;

export interface TemplateEntry {
  component: ComponentType<TemplateData>;
  subject: string | ((data: TemplateData) => string);
  displayName?: string;
  previewData?: TemplateData;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  "appointment-confirmed": appointmentConfirmed,
  "appointment-reminder": appointmentReminder,
  "booking-code": bookingCode,
  "appointment-cancelled": appointmentCancelled,
  "appointment-review": appointmentReview,
  "data-export": dataExport,
  "owner-nudge": ownerNudge,
  "error-summary": errorSummary,
  "owner-alert": ownerAlert,
  "trial-week": trialWeek,
  "trial-ending": trialEnding,
  "trial-ended": trialEnded,
  // Add templates here as they are created, e.g.:
  // 'welcome': welcomeTemplate,
};
