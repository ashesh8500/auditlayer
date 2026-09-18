# SEC-2 closure: exact provider profile identity

The initial review reproduced `/me` raw JSON `user_id:9007199254740993` silently becoming `"9007199254740992"`. This is an authoritative identity, not a metric.

Added a private `canonicalInstagramId` validator at the persistence return boundary. Exact positive canonical decimal strings within PostgreSQL signed bigint range pass unchanged. Numeric values must be safe integers; unsafe numbers are rejected with the existing sanitized `instagram_profile_fetch_failed` error rather than guessed/repaired. Leading zeros, whitespace, exponent strings, fractions, booleans, nonpositive IDs and out-of-range strings reject. The short-token exchange ID remains a presence-only check and is not used for durable identity.

This intentionally chooses the review's fail-closed option rather than introducing a new JSON parser dependency. A provider that emits an unsafe numeric `/me` ID will require exact-text parsing support before that response shape can connect; the release must not call this supported until observed/implemented. Existing documented/string profile IDs remain exact.

TDD: raw JSON `Response` fixtures, not already-rounded JavaScript literals. Initial run: 11 failures / 13 passes. After minimal fix: 24/24 passed. Adjacent exact strings and maximum bigint retained exactly; no live provider calls. Logs `/tmp/alm-sec2-red.txt`, `/tmp/alm-sec2-green.txt`.

Changed only `web/src/lib/instagram-oauth.ts` and its test. Requires fresh independent review of the final web/SQL diff; no deployment claimed.
