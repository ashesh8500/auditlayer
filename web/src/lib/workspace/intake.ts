import { validate } from "@/lib/workspace-contracts";
/** Explicit new-contract input cannot silently fall through to old report rights.
 * No quote is accepted until server quote persistence and atomic customer admission
 * are composed with the execution lane. In particular a valid DTO is not authority.
 */
export function workspaceIntentBlocker(value: unknown, ownerId: string): string {
  try {
    const intent=validate("RunIntent",value);
    if(intent.quote.refs.owner_id!==ownerId) return "Workspace quote not found.";
    return "Workspace credit execution is unavailable pending model qualification, approved terms and atomic admission.";
  } catch { return "Invalid workspace quote or consent."; }
}
