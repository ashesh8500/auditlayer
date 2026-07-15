# Manual Supabase Report Upload Workflow

When a report is generated locally (not through the portal worker) and needs to appear in Narin's dashboard, use this workflow.

## Prerequisites

```bash
SUPA_URL="https://eamnfmtkvglbnugzmotw.supabase.co"
SRK="<service_role_key>"  # from web/.env.local SUPABASE_SERVICE_ROLE_KEY
```

## Upload Steps

### 1. Upload HTML to Storage (reports bucket)

```bash
curl -s -X POST "$SUPA_URL/storage/v1/object/reports/{report_filename}.html" \
  -H "apikey: $SRK" \
  -H "Authorization: Bearer $SRK" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/report.html
```

If file exists (409 error), DELETE first then re-upload:
```bash
curl -s -X DELETE "$SUPA_URL/storage/v1/object/reports/{report_filename}.html" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
```

Storage path convention: `{report_filename}.html` (no user_id prefix needed for portal-generated audits).

### 2. Create/Update Audit Record

```bash
# Create new record:
curl -s -X POST "$SUPA_URL/rest/v1/audits" \
  -H "apikey: $SRK" \
  -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"user_id":"7b8300ff-77bc-4dc2-b098-8e8fe7f579eb","handle":"<handle>","platform":"instagram","goal":"growth","status":"done","report_path":"<report_id>.html","created_at":"<iso_timestamp>"}'

# Update existing record (e.g., change status or user_id):
curl -s -X PATCH "$SUPA_URL/rest/v1/audits?id=eq.<audit_id>" \
  -H "apikey: $SRK" \
  -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

### 3. Add Audit Events

```bash
curl -s -X POST "$SUPA_URL/rest/v1/audit_events" \
  -H "apikey: $SRK" \
  -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -d '[{"audit_id":"<audit_id>","actor":"system","event_type":"status_change","phase":"done","detail":"Report uploaded via manual workflow","created_at":"<iso_timestamp>"}]'
```

## Portal URL

After upload: `https://auditlayermedia.com/audits/{audit_id}`

## User IDs

| User | user_id |
|---|---|
| Narin Fazlalipour | `7b8300ff-77bc-4dc2-b098-8e8fe7f579eb` |
| Ashesh Kaji | `ef59640a-d073-4f35-967f-31f42997be06` |

## Pitfalls

- **Wrong user_id**: Narin can't see audits created under Ashesh's account. Always use her user_id.
- **Storage duplicate**: Supabase Storage returns 409 on duplicate. DELETE first, then POST.
- **Auth header format**: Must use `-H "apikey: $SRK"` AND `-H "Authorization: Bearer $SRK"` on every Supabase REST call (even DELETE).
- **audit_id vs report_path**: The `report_path` field stores the storage filename, not the full URL. The portal generates signed URLs on request.
