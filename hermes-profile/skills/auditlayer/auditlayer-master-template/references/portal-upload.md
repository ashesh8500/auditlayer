# Portal Upload — Direct Supabase Insert

When a report is generated outside the worker pipeline (e.g., manually via Hermes) and
needs to appear in the AuditLayer dashboard, upload it directly via Supabase service role.

## Quick Upload Script

```bash
# Set vars
AUDIT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
USER_ID="ef59640a-d073-4f35-967f-31f42997be06"  # Ashesh (admin)
HANDLE="kayuraeffect"
PLATFORM="instagram"
GOAL="growth"
HTML_FILE="/home/asheshkaji/projects/analyses/kayuraeffect-instagram-audit.html"
REPORT_PATH="${USER_ID}/${AUDIT_ID}.html"

SUPA_URL="https://eamnfmtkvglbnugzmotw.supabase.co"
SRK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhbW5mbXRrdmdsYm51Z3ptb3R3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY1MDU2MSwiZXhwIjoyMDk2MjI2NTYxfQ.TJoTPmT6RWakmZT0yl6erR_9MYVmwMPf3mjRJ2VmJzM"

# 1. Upload HTML to Storage bucket
curl -s -X POST "${SUPA_URL}/storage/v1/object/reports/${REPORT_PATH}" \
  -H "apikey: ${SRK}" \
  -H "Authorization: Bearer ${SRK}" \
  -H "Content-Type: text/html" \
  --data-binary "@${HTML_FILE}"

# 2. Create audit record
curl -s -X POST "${SUPA_URL}/rest/v1/audits" \
  -H "apikey: ${SRK}" \
  -H "Authorization: Bearer ${SRK}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"id\": \"${AUDIT_ID}\",
    \"user_id\": \"${USER_ID}\",
    \"handle\": \"${HANDLE}\",
    \"platform\": \"${PLATFORM}\",
    \"goal\": \"${GOAL}\",
    \"status\": \"done\",
    \"report_path\": \"${REPORT_PATH}\",
    \"limitations\": []
  }"

# 3. Add audit events
for PHASE in queued running done; do
  curl -s -X POST "${SUPA_URL}/rest/v1/audit_events" \
    -H "apikey: ${SRK}" \
    -H "Authorization: Bearer ${SRK}" \
    -H "Content-Type: application/json" \
    -d "{
      \"audit_id\": \"${AUDIT_ID}\",
      \"actor\": \"hermes\",
      \"event_type\": \"phase_transition\",
      \"phase\": \"${PHASE}\"
    }"
done

echo "Done — audit ${AUDIT_ID} for @${HANDLE} now in dashboard"
```

## Admin User IDs

| User | ID |
|---|---|
| Ashesh Kaji | `ef59640a-d073-4f35-967f-31f42997be06` |
| Narin Fazlalipour | `7b8300ff-77bc-4dc2-b098-8e8fe7f579eb` |

## Storage Buckets

- `reports` — HTML report files, path: `{user_id}/{audit_id}.html`
- `pdfs` — PDF versions, path: `{user_id}/{audit_id}.pdf`

## Audit Status Values

- `queued` → `running` → `done` (success)
- `queued` → `running` → `failed` (error)
- Insert at `done` when uploading a pre-generated report.
