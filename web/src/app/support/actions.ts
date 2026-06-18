"use server";

import { z } from "zod";

export interface SupportState {
  status: "idle" | "ok" | "error";
  message?: string;
}

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  subject: z.string().min(3, "Subject must be at least 3 characters.").max(200),
  message: z.string().min(10, "Message must be at least 10 characters.").max(3000),
});

const SUPPORT_TO = process.env.SUPPORT_EMAIL_TO ?? "ashesh@asheshkaji.com";
const SUPPORT_FROM =
  process.env.SUPPORT_EMAIL_FROM ?? "AuditLayerMedia <support@auditlayermedia.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function submitSupportRequest(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message,
    };
  }

  const { email, subject, message } = parsed.data;

  if (!RESEND_API_KEY) {
    console.error("Support form: RESEND_API_KEY not configured");
    return {
      status: "error",
      message:
        "Support isn't configured yet. Email support@auditlayermedia.com directly.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SUPPORT_FROM,
        to: SUPPORT_TO,
        reply_to: email,
        subject: `[Support] ${subject}`,
        text: `From: ${email}\nSubject: ${subject}\n\n${message}\n\n---\nSent via auditlayermedia.com/support`,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Support form: Resend API error", err);
      throw new Error("Resend API returned non-OK");
    }

    return { status: "ok" };
  } catch (err) {
    console.error("Support form: failed to send", err);
    return {
      status: "error",
      message:
        "Failed to send. Try emailing support@auditlayermedia.com directly.",
    };
  }
}
