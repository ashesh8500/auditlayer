# Profile: infra-ops

## Worker (Hetzner CX22, hermes.kalanak.com)
Units: auditlayer-worker@1, auditlayer-worker@2 (systemd template worker/infra/auditlayer-worker@.service). Old singleton disabled.
Code deploy dir: /opt/auditlayer/worker  (rsync from ~/projects/auditlayer/worker)
Hermes agent: /opt/auditlayer/.hermes/hermes-agent  REAL DIR copy (NOT symlink to /home — ProtectHome + 0700 on /home/asheshkaji blocks the auditlayer user, caused crash-loop). chown auditlayer:auditlayer.
Env: worker/.env mode 0600 — provider deepseek, model deepseek-v4-flash, DEEPSEEK_API_KEY present, HERMES_AGENT_ROOT=/opt/auditlayer/.hermes/hermes-agent, HERMES_MODE=inprocess. Cost cap $3. NEVER Codex/OpenAI.

## Deploy sequence
worker: sudo rsync -a --delete --exclude .venv --exclude __pycache__ --exclude '*.pyc' --exclude var/ --exclude .env ~/projects/auditlayer/worker/ /opt/auditlayer/worker/ && sudo chown -R auditlayer:auditlayer /opt/auditlayer/worker && sudo systemctl restart auditlayer-worker@{1,2}
CRITICAL: ALWAYS --exclude .env. Local worker/.env has HERMES_AGENT_ROOT=/home/asheshkaji/... which re-breaks prod (ProtectHome crash-loop). Prod /opt/auditlayer/worker/.env is canonical (HERMES_AGENT_ROOT=/opt/auditlayer/.hermes/hermes-agent). Never overwrite it.
verify: systemctl is-active @1 @2 == active, NRestarts==0, journalctl grep 'connected'
web: cd web && HOME=/home/asheshkaji npx vercel --prod --yes  → aliases auditlayermedia.com
migration: npx supabase db push --linked (PAT at ~/.supabase/access-token mode 0600)

## Fallbacks
worker broken: keep /opt/auditlayer/worker.prev before rsync; restore + restart.
migration bad: 00NN_down.sql.
web bad: vercel rollback (previous deploy stays live until alias).

## Prod checkpoints
curl -s -o /dev/null -w '%{http_code}' https://auditlayermedia.com/ == 200
Last good audit ref: cost $0.1329, HTML 18249B, PDF 138048B, 15 sections.
