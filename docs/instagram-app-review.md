# Instagram Connection Approval and Production Runbook

**Priority:** launch-critical
**App:** alm-IG (`1624742575301528`)
**Flow:** Instagram API with Instagram Login
**Permission:** `instagram_business_basic`

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
- The permission is read-only and is used for profile and recent-content metrics in owner-scoped reports.
- AuditLayerMedia cannot publish, edit, comment, message, follow, or manage advertising.
- Tokens remain server-side, are scoped by AuditLayer owner and Instagram account, and are deleted on disconnect.
- The worker refreshes direct Instagram tokens inside the seven-day expiry window and otherwise falls back honestly to public signals when no usable connection exists.

## Meta App Dashboard checklist

Open https://developers.facebook.com/apps/1624742575301528/ and complete:

- [ ] Instagram API with Instagram Login product is active.
- [ ] Exact OAuth redirect URI is allow-listed.
- [ ] App domain and website URL use `auditlayermedia.com`.
- [ ] Privacy Policy URL is the production privacy page.
- [ ] Data Deletion Instructions URL is the production deletion page.
- [ ] Contact email, category, display name, icon, and business details are complete.
- [ ] A dedicated Business or Creator reviewer account is added and has accepted its tester invitation.
- [ ] `instagram_business_basic` Advanced Access request is submitted.
- [ ] App is moved to Live only after the reviewer/tester production flow succeeds.

## App Review recording script

Record one uninterrupted walkthrough on the production domain:

1. Sign in to AuditLayerMedia.
2. Open Reports and scroll to Connected data.
3. Read the disclosure showing the exact read-only purpose and actions the app cannot take.
4. Select **Connect Instagram**.
5. Approve `instagram_business_basic` in Instagram.
6. Return to AuditLayerMedia and show the connected username, follower/media counts, account type, and expiry.
7. Start an audit for that same handle.
8. Show the status event/report provenance indicating connected Instagram Graph API data was used.
9. Return to Connected data and select **Disconnect and delete access**.
10. Open the public Privacy and Data Deletion pages.

Do not expose the app secret, access token, browser network payloads, or another customer's data in the recording.

## Reviewer instructions template

> Sign in with the supplied AuditLayerMedia reviewer account. Open Reports and scroll to Connected data. Select Connect Instagram and approve access with the supplied Instagram Business/Creator test account. The app returns to Reports and displays the connected username and read-only data status. Start a Pulse audit for the same handle to see the approved profile and recent-content metrics used in the report. To remove access, return to Connected data and select Disconnect and delete access. Privacy and deletion instructions are available at the public URLs supplied in this submission.

## Release verification

- [ ] Web tests, typecheck, lint, build, and Playwright pass.
- [ ] Worker Instagram tests and full worker suite pass.
- [ ] Vercel production has `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and the canonical site URL.
- [ ] Unauthenticated OAuth start redirects to login.
- [ ] Callback without matching state fails closed.
- [ ] Public privacy, support, and data-deletion pages return 200.
- [ ] Successful connection creates one owner-scoped connection without exposing token columns to authenticated clients.
- [ ] Disconnect deletes the connection.
- [ ] One controlled audit uses connected metrics and records explicit provenance.
