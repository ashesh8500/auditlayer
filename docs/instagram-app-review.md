# Instagram Connection Approval and Production Runbook

**Priority:** launch-critical
**Meta review app:** alm (`1919113942129447`)
**Instagram Login app:** alm-IG (`1624742575301528`), confirmed under the parent app on September 7, 2026.
**Flow:** Instagram API with Instagram Login
**Permissions:** `instagram_business_basic`, `instagram_business_manage_insights`

## Production URLs

- Site: https://auditlayermedia.com
- OAuth start: https://auditlayermedia.com/api/auth/instagram/start
- OAuth callback: https://auditlayermedia.com/api/auth/instagram/callback
- Privacy: https://auditlayermedia.com/privacy
- Data deletion: https://auditlayermedia.com/data-deletion
- Connection support: https://auditlayermedia.com/support#instagram

## Product contract

- Business and Creator accounts connect directly through Instagram.
- A Facebook Page is not required.
- The permissions are read-only and are used for profile, recent-content, and private media-reach metrics in owner-scoped reports.
- AuditLayerMedia cannot publish, edit, comment, message, follow, or manage advertising.
- Tokens remain server-side, are scoped by AuditLayer owner and Instagram account, and are deleted on disconnect.
- OAuth state is short-lived, user-bound, HttpOnly, Secure, and cleared on every callback outcome.
- The current short-token contract must contain exactly one `data` record. Its `access_token`, `user_id`, and `permissions` are read only after cardinality validation. Both requested permissions must be present; otherwise reject the connection before persistence.
- Code exchange, long-lived exchange, and profile fetch each have a bounded network deadline.
- Direct Instagram Login persistence records the explicit `instagram` Graph API family. Legacy rows without a family require reconnect; token text is never used to infer the family.
- The worker refreshes eligible direct Instagram tokens inside the seven-day expiry window.
- A known connection that is expired, malformed, missing its explicit Graph API family, or fails token/profile validation must fail closed and require reconnect.
- An auth/permission failure durably marks only that owner's connection `reconnect_required`.
- Later audits read that state before any Meta request and require reconnect without public fallback.
- Successful owner-scoped OAuth persistence resets the connection to `connected`.
- Known failed connections never fall back to public signals.
- Public-signal fallback is allowed only when no owner-scoped Instagram connection exists.
- Expected per-media Insights gaps remain partial/unavailable rows and do not invalidate otherwise verified connected profile metrics.

## Meta App Dashboard checklist

Open https://developers.facebook.com/apps/1919113942129447/ and complete:

- [ ] Instagram API with Instagram Login product is active.
- [ ] Exact OAuth redirect URI is allow-listed.
- [ ] App domain and website URL use `auditlayermedia.com`.
- [ ] Privacy Policy URL is the production privacy page.
- [ ] Data Deletion Instructions URL is the production deletion page.
- [ ] Contact email, category, display name, icon, and business details are complete.
- [ ] A dedicated Business or Creator reviewer account is added and has accepted its tester invitation.
- [ ] `instagram_business_basic` and `instagram_business_manage_insights` Advanced Access requests are submitted.
- [ ] App is moved to Live only after the reviewer/tester production flow succeeds.

## App Review recording script

Record one uninterrupted walkthrough on the production domain:

1. Open https://auditlayermedia.com/login, enter the reviewer email, and use the secure sign-in link sent to that inbox.
2. Open https://auditlayermedia.com/dashboard and scroll to Connected data.
3. Read the disclosure showing the exact read-only purpose and actions the app cannot take.
4. Select **Connect Instagram**.
5. Approve `instagram_business_basic` and `instagram_business_manage_insights` in Instagram.
6. Return to AuditLayerMedia and show the connected username, follower/media counts, account type, connected Graph API provenance, and authorization expiry.
7. Start an audit for that same handle.
8. Show the status event/report provenance indicating connected Instagram Graph API data was used, including average reach with its explicit successful/eligible denominator (for example, `8 of 10 eligible posts`); also show reach unavailable rather than zero when no eligible Insights succeed.
9. Return to Connected data and select **Disconnect and delete access**.
10. Open the public Privacy and Data Deletion pages.

Do not expose the app secret, access token, browser network payloads, or another customer's data in the recording.

## Reviewer instructions template

> Open https://auditlayermedia.com/login, enter the supplied reviewer email, and use the secure sign-in link sent to that inbox. Open https://auditlayermedia.com/dashboard and scroll to Connected data. Select Connect Instagram and approve access with the supplied Instagram Business/Creator test account. The app returns to Reports and displays the connected username and read-only Graph API data status. Start a Pulse audit for the same handle to see the approved profile, recent-content, and available reach metrics used in the report. Average reach names the successful/eligible-post denominator; when Instagram returns no eligible Insights, the report says reach is unavailable instead of showing zero. To remove access, return to Connected data and select Disconnect and delete access. Privacy and deletion instructions are available at the public URLs supplied in this submission.

## Release verification

- [ ] Web tests, typecheck, lint, build, and Playwright pass.
- [ ] Worker Instagram tests and full worker suite pass.
- [ ] Vercel production has `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and the canonical site URL.
- [ ] Unauthenticated OAuth start redirects to login.
- [ ] Callback without matching state fails closed.
- [ ] Current nested short-token response contains exactly one canonical record, both granted permissions are verified, and zero-record, multi-record, top-level, or partial-grant responses persist nothing.
- [ ] All three Meta network calls terminate at their configured deadline and surface only safe error classes.
- [ ] Public privacy, support, and data-deletion pages return 200.
- [ ] Successful connection creates one owner-scoped connection without exposing token columns to authenticated clients.
- [ ] Direct login persists `graph_api_family = instagram`; a legacy NULL family and every known expired/malformed/token/profile failure visibly require reconnect, with no public fallback.
- [ ] An owner-scoped auth/permission rejection transitions exactly that connection to `reconnect_required`; a repeat worker lookup makes no Meta request, and the dashboard/account surfaces show **Reconnect Instagram**.
- [ ] Completing OAuth again resets that same connection to `connected`, clears bounded reconnect metadata, and restores the connected-data UI.
- [ ] Disconnect deletes the connection.
- [ ] One controlled audit uses connected metrics and records explicit provenance plus average reach with its explicit successful/eligible denominator (for example, `8 of 10 eligible posts`), and shows reach unavailable rather than zero when no eligible Insights succeed.

## Current official Meta references

Verified August 27, 2026:

- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/) — authorization, nested short-token response, granted permissions, long-lived exchange, and refresh endpoints.
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/) — professional-account boundary and no Facebook Page requirement.
- [Instagram Insights](https://developers.facebook.com/documentation/instagram-platform/insights/) — `instagram_business_basic` plus `instagram_business_manage_insights`, `graph.instagram.com`, and unavailable-data behavior.
- [Instagram Account Insights](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights/) and [Instagram Media Insights](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights/) — Business/Creator reading boundary and current Insights requirements.


## September 7 resubmission release

- Meta parent app `1919113942129447` contains Instagram Login app `1624742575301528`; verified in the authenticated dashboard. Keep the Instagram client ID in OAuth.
- The configured professional test account is `auditlayermedia`.
- Release baseline is production `3548ec4`, Meta candidate `fb64f97`, plus the reviewed follow-up tree `f129b80`.
- Run the Graph family, lifecycle, and rolling-upgrade migrations in one transaction. The rolling-upgrade migration restores the deployed eight-argument writer without granting false Insights-ready state. It remains service-role-only; legacy writes require reconnect in the new app.
- Reconnect/expired/inactive cards must never display a connected-success banner merely because a URL contains `instagram_connected`.
- Disclose Vercel, Supabase, Hetzner and the verified production inference provider DeepSeek in the submission. Do not claim that no processors handle Meta data.
- Preview and production must show the same reviewed code. Both system worker instances use `/opt/auditlayer/worker`; syncing a repository is not a worker deployment.

Connected report provenance is reconciled only after successful authenticated metrics retrieval. The initial unauthenticated Instagram limitation is removed for that run; genuine missing research and user-context limitations remain. Public-only reports retain their original limitation. Prompt version 1.7 identifies this correction.

The subject and audit-channel pickers must derive connection readiness from the same protected lifecycle metadata as the dashboard. A historical account link does not prove current access. Channels needing reconnect cannot be selected for a new audit until reconnect completes.

Meta requires app test credentials and explicitly prohibits supplying Instagram credentials. Provide an isolated non-admin Supabase Auth account through normal password sign-in, with review audit entitlements. This uses the existing Supabase password flow, has no bypass, exposes no credentials in code, and does not require custom SMTP. Reviewer account details belong in 1Password and the private Meta form only.
