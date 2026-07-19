.PHONY: test e2e check diagnose-hermes smoke web-check worker-check check-v2 \
	dev-web worker-run worker-once deploy-prod dns-vercel supabase-push supabase-types vercel-logs \
	hermes-vm-sync hermes-vm-ssh hermes-vm-status hermes-vm-worker test-intake-parity

PYTHON ?= .venv/bin/python
SUPABASE ?= npx supabase@latest

# Legacy v1 targets run against the archived app in legacy/.
test:
	PYTHONPATH=legacy/src $(PYTHON) -m pytest legacy/tests

e2e:
	$(PYTHON) legacy/scripts/e2e-smoke.py

check: test e2e
	PYTHONPATH=legacy/src $(PYTHON) -m auditlayer check-config
	PYTHONPATH=legacy/src $(PYTHON) -m auditlayer validate-hermes

diagnose-hermes:
	PYTHONPATH=legacy/src $(PYTHON) -m auditlayer diagnose-hermes

smoke:
	scripts/smoke-check.sh http://127.0.0.1:8000

# --- v2 stack (Next.js + worker) -------------------------------------------
# Cheat sheet: docs/agent-handoff.md

web-check:
	cd web && pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm e2e

worker-check:
	cd worker && uv run pytest

test-intake-parity:
	cd worker && uv run pytest tests/test_intake_parity_crosslang.py tests/test_intake_parity.py -v

check-v2: web-check worker-check

dev-web:
	cd web && pnpm dev

worker-run:
	cd worker && uv run python -m auditlayer_worker run

worker-once:
	cd worker && uv run python -m auditlayer_worker run --once

deploy-prod:
	cd web && vercel deploy --prod

dns-vercel:
	./scripts/setup-auditlayermedia-dns.sh

supabase-push:
	$(SUPABASE) db push

supabase-types:
	$(SUPABASE) gen types typescript --linked > web/src/lib/supabase/types.ts

vercel-logs:
	cd web && vercel logs https://web-delta-dun-29.vercel.app --limit 30

# --- hermes-vm (Hetzner) -----------------------------------------------------
hermes-vm-sync:
	chmod +x scripts/hermes-vm-sync.sh infra/hermes-vm/bootstrap.sh
	./scripts/hermes-vm-sync.sh

hermes-vm-ssh:
	ssh hermes-vm

hermes-vm-status:
	ssh hermes-vm 'export PATH=$$HOME/.local/bin:$$PATH; \
		echo "== hermes gateway =="; hermes gateway status 2>&1 | head -8; \
		echo "== auditlayer worker =="; systemctl is-active auditlayer-worker 2>/dev/null || echo not-installed; \
		echo "== diagnose-hermes =="; cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker diagnose-hermes 2>&1 | rg "ok|auth_ok|tcp_reachable|api_server"'

promote-admin:
	cd worker && uv run python ../scripts/promote-admin.py $(EMAIL)

hermes-vm-worker:
	ssh hermes-vm 'sudo cp ~/projects/auditlayer/worker/infra/auditlayer-worker.vm.service /etc/systemd/system/auditlayer-worker.service && \
		sudo systemctl daemon-reload && sudo systemctl enable --now auditlayer-worker && \
		systemctl status auditlayer-worker --no-pager'
