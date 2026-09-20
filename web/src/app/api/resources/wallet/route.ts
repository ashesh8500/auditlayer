import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validate } from "@/lib/workspace-contracts";
import { parseCommercialWallet } from "@/lib/commercial-wallet";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const session = await createClient();
    // Narrow boundary until the parent regenerates Supabase types. Not an admin client.
    const rpc = session as unknown as { rpc(name: "workspace_credit_wallet" | "commercial_credit_wallet"): Promise<{ data: unknown; error: unknown }> };
    const commercial = await rpc.rpc("commercial_credit_wallet");
    if (commercial.error) throw new Error("commercial_wallet_read_failed");
    let wallet;
    if (commercial.data !== null) wallet = parseCommercialWallet(commercial.data);
    else {
      const { data, error } = await rpc.rpc("workspace_credit_wallet");
      if (error) throw new Error("wallet_read_failed");
      wallet = data === null ? null : validate("Wallet", data);
    }
    if (wallet && wallet.owner_id !== profile.id) throw new Error("owner_scope_mismatch");
    return NextResponse.json({ ownerId: profile.id, fetchedAt: new Date().toISOString(), wallet }, { headers });
  } catch {
    return NextResponse.json({ error: "Wallet unavailable. Your existing report access is unchanged." }, { status: 503, headers });
  }
}
