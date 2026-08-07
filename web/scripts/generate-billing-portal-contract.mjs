#!/usr/bin/env node
/**
 * Deterministic generator for `web/artifacts/billing-portal-contract.json`
 * (ALM-I-026).
 *
 * The billing-portal module is dependency-light (no runtime imports), so it
 * can be loaded directly under Node's type-stripping mode. Run twice and
 * `cmp` to prove byte-determinism; the artifact contains no timestamps,
 * environment paths, customer data, credentials, or URL secrets.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const moduleUrl = new URL("../src/lib/billing-portal.ts", import.meta.url);
const { buildBillingPortalContract } = await import(moduleUrl.href);

const outPath = join(here, "..", "artifacts", "billing-portal-contract.json");
const payload = JSON.stringify(buildBillingPortalContract(), null, 2) + "\n";
writeFileSync(outPath, payload, "utf8");
console.log(`wrote ${outPath} (${payload.length} bytes)`);
