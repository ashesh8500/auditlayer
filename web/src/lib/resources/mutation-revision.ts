import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { ResourceName } from "./workspace";
// Call after successful durable mutations, before redirect. Session cookie only;
// this is an invalidation nonce, never a credential or cached authorization.
export async function bumpResourceRevision(resource: ResourceName) {
  (await cookies()).set(`alm-${resource}-revision`, randomUUID(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
  });
}
