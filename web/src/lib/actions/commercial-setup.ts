"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bumpResourceRevision } from "@/lib/resources/mutation-revision";
import { canonicalizeWebsiteLocator } from "@/lib/intelligence/channel-locator";

const request = z.strictObject({
  request_id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  subject_type: z.enum(["person", "creator", "brand", "organization", "project"]),
  platform: z.enum(["instagram", "youtube", "tiktok", "x", "linkedin", "website"]),
  locator: z.string().trim().min(1).max(200),
  identity: z.string().trim().min(8).max(2000),
  audience: z.string().trim().min(1).max(2000),
  goal: z.string().trim().min(1).max(200),
  confirmed: z.literal(true),
  managed: z.literal(true),
});
const receipt = z.object({ subject_id: z.uuid(), channel_id: z.uuid(), brief_id: z.uuid() });
type SetupRPC = { rpc(name: "commercial_brand_setup", args: {p: z.infer<typeof request>}): Promise<{data: unknown; error: {message?: string} | null}> };

/** Setup never enrolls, submits an audit, or consults legacy allowance. */
export async function setupCommercialBrand(input: unknown) {
  try {
    const profile = await requireProfile();
    const p = request.parse(input);
    if (p.platform === "website") {
      const url = new URL(/^https?:\/\//i.test(p.locator) ? p.locator : `https://${p.locator}`);
      if (url.username || url.password || url.port) throw new Error("invalid_locator");
      p.locator = canonicalizeWebsiteLocator(p.locator);
      if (!/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(\/[^\s?#]*)?$/.test(p.locator)) throw new Error("invalid_locator");
    } else {
      p.locator = p.locator.replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_][a-z0-9_.-]{0,99}$/.test(p.locator)) throw new Error("invalid_locator");
    }
    const db = await createClient();
    // Session RPC derives auth.uid(). No service-role identity supplied by the browser.
    const result = await (db as unknown as SetupRPC).rpc("commercial_brand_setup", {p});
    if (result.error) {
      if (result.error.message?.includes("channel_already_configured")) return {ok: false as const, error: "This channel is already configured. Open Brands to review its brief, then return to Credits and Reports."};
      if (result.error.message?.includes("setup_request_conflict")) return {ok: false as const, error: "This setup was already saved with different details. Open Brands to review it."};
      throw new Error("setup_failed");
    }
    const saved = receipt.parse(result.data);
    const read = await db.from("subjects")
      .select("id,user_id,living_brief_versions(id,confirmed,created_by),subject_channels(id,managed)")
      .eq("id", saved.subject_id).eq("user_id", profile.id).maybeSingle();
    if (read.error || !read.data || read.data.user_id !== profile.id ||
      !read.data.living_brief_versions.some(b => b.id === saved.brief_id && b.confirmed && b.created_by === profile.id) ||
      !read.data.subject_channels.some(c => c.id === saved.channel_id && c.managed)) throw new Error("setup_unverified");
    await bumpResourceRevision("subjects");
    revalidatePath("/subjects");
    revalidatePath("/commercial");
    return {ok: true as const, ...saved};
  } catch {
    return {ok: false as const, error: "Setup could not be confirmed. Check the fields and retry the same setup. No report has been requested."};
  }
}
