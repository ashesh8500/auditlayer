"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  processWaitlistSubmission,
  type WaitlistEntry,
  type WaitlistState,
} from "@/lib/waitlist";

const DEFAULT_WAITLIST_RECIPIENTS = [
  "ashesh8500@gmail.com",
  "narinfazlalipour79@gmail.com",
];

function waitlistRecipients(): string[] {
  const configured = process.env.WAITLIST_EMAIL_TO
    ?.split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_WAITLIST_RECIPIENTS;
}

async function saveWaitlistEntry(entry: WaitlistEntry): Promise<void> {
  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from("waitlist_entries")
    .upsert(
      {
        name: entry.name,
        email: entry.email,
        organization: entry.organization,
        social_handle: entry.socialHandle,
        primary_interest: entry.primaryInterest,
        notes: entry.notes,
        marketing_updates: entry.marketingUpdates,
        source: entry.source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );

  if (error) {
    console.error("Waitlist: failed to save lead", {
      code: error.code,
      message: error.message,
    });
    throw new Error("waitlist_save_failed");
  }
}

async function notifyFounders(entry: WaitlistEntry): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Waitlist: RESEND_API_KEY is not configured; lead saved without email notification");
    return;
  }

  const from =
    process.env.WAITLIST_EMAIL_FROM ??
    "AuditLayerMedia <support@auditlayermedia.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: waitlistRecipients(),
      reply_to: entry.email,
      subject: `New AuditLayerMedia waitlist lead — ${entry.primaryInterest}`,
      text: [
        `Name: ${entry.name}`,
        `Email: ${entry.email}`,
        `Organization: ${entry.organization || "Not provided"}`,
        `Social account: ${entry.socialHandle || "Not provided"}`,
        `Primary interest: ${entry.primaryInterest}`,
        `Product updates: ${entry.marketingUpdates ? "Yes" : "No"}`,
        "",
        "Notes:",
        entry.notes || "Not provided",
        "",
        "Reply to this email to contact the lead directly.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    console.error("Waitlist: founder notification failed", {
      status: response.status,
    });
    throw new Error("waitlist_notification_failed");
  }
}

export async function joinWaitlist(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  return processWaitlistSubmission(
    {
      name: formData.get("name"),
      email: formData.get("email"),
      organization: formData.get("organization"),
      socialHandle: formData.get("socialHandle"),
      primaryInterest: formData.get("primaryInterest"),
      notes: formData.get("notes"),
      marketingUpdates: formData.get("marketingUpdates"),
      website: formData.get("website"),
    },
    {
      save: saveWaitlistEntry,
      notify: notifyFounders,
    },
  );
}
