/** Canonical new opt-in pricing. Legacy offer contracts remain immutable. */
import policy from "./commercial-policy.json";
export const commercial = policy;
export type CommercialPlan = "free" | "brand" | "studio";
