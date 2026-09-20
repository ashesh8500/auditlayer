import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bumpResourceRevision } from "@/lib/resources/mutation-revision";

export type ClaimState = { status: "idle" | "success" | "error"; message?: string };
const failure = { status: "error", message: "Trial access could not be confirmed. Please try again." } as const;
const errors: Record<string, string> = {
  trial_expired: "This invite has expired. Ask the sender for a new invite.",
  trial_revoked: "This invite has been revoked. Contact the sender.",
  trial_exhausted: "This invite has no remaining places. Contact the sender.",
  trial_not_found: "This invite could not be found. Check the invite link.",
  trial_already_redeemed: "Your account has already redeemed a different trial. No additional credits were added.",
};
/** Authentication is checked here, never supplied by the form. The RPC owns all grants. */
export async function claimTrial(token: string): Promise<ClaimState> {
  if (!token || token.length > 512) return failure;
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { status: "error", message: "Sign in again before claiming this invite." };
    const admin = createAdminClient();
    // A same-offer replay is a read, even when that offer is now full/expired.
    // Do not treat a different offer as success or grant anything in application code.
    const alreadyClaimed = async () => {
      const { data: profile, error } = await admin.from("profiles").select("trial_link_id").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (!profile?.trial_link_id) return false;
      const { data: offer, error: offerError } = await admin.from("trial_links").select("id").eq("id", profile.trial_link_id).eq("token", token).maybeSingle();
      if (offerError) throw offerError;
      return Boolean(offer);
    };
    let repeated = await alreadyClaimed();
    if (!repeated) {
      const { data, error } = await admin.rpc("redeem_trial_link", { p_token: token, p_user_id: user.id });
      if (error) {
        // A concurrent request may have won the canonical row locks.
        repeated = await alreadyClaimed();
        if (!repeated) return { status: "error", message: errors[error.message] ?? failure.message };
      } else if (!data || typeof data !== "object" || !("trial_link_id" in data)) {
        return failure;
      }
    }
    await bumpResourceRevision("reports");
    await bumpResourceRevision("subjects");
    (await cookies()).set("alm_trial_token", "", { maxAge: 0, path: "/" });
    return { status: "success", message: repeated ? "This invite was already claimed by your account. No extra credits were added." : "Trial access claimed. Your workspace now reflects the offer." };
  } catch {
    return failure;
  }
}
