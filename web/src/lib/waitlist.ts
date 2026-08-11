import { z } from "zod";

export const WAITLIST_INTERESTS = [
  "brand-strategy",
  "competitive-intelligence",
  "content-planning",
  "account-growth",
  "ongoing-management",
  "team-enterprise",
] as const;

const waitlistSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  organization: z.string().trim().max(160),
  socialHandle: z.string().trim().max(160),
  primaryInterest: z.enum(WAITLIST_INTERESTS),
  notes: z.string().trim().max(2000),
  marketingUpdates: z.boolean(),
  source: z.literal("website"),
});

export type WaitlistEntry = z.infer<typeof waitlistSchema>;

export interface WaitlistRawInput {
  name: unknown;
  email: unknown;
  organization: unknown;
  socialHandle: unknown;
  primaryInterest: unknown;
  notes: unknown;
  marketingUpdates: unknown;
  website: unknown;
}

export interface WaitlistState {
  status: "idle" | "ok" | "error";
  message?: string;
}

export interface WaitlistDependencies {
  save: (entry: WaitlistEntry) => Promise<void>;
  notify: (entry: WaitlistEntry) => Promise<void>;
}

export async function processWaitlistSubmission(
  raw: WaitlistRawInput,
  dependencies: WaitlistDependencies,
): Promise<WaitlistState> {
  if (typeof raw.website === "string" && raw.website.trim()) {
    return { status: "ok" };
  }

  const parsed = waitlistSchema.safeParse({
    name: raw.name,
    email: raw.email,
    organization: raw.organization ?? "",
    socialHandle: raw.socialHandle ?? "",
    primaryInterest: raw.primaryInterest,
    notes: raw.notes ?? "",
    marketingUpdates: raw.marketingUpdates === "on" || raw.marketingUpdates === true,
    source: "website",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter your name and a valid email address.",
    };
  }

  const entry = parsed.data;
  try {
    await dependencies.save(entry);
  } catch {
    return {
      status: "error",
      message: "We couldn't save your request. Please try again.",
    };
  }

  try {
    await dependencies.notify(entry);
  } catch {
    // The durable lead is the source of truth; notification can be retried separately.
  }
  return { status: "ok" };
}
