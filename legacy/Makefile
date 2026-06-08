.PHONY: test e2e check diagnose-hermes smoke

PYTHON ?= .venv/bin/python

test:
	PYTHONPATH=src $(PYTHON) -m pytest

e2e:
	$(PYTHON) scripts/e2e-smoke.py

check: test e2e
	PYTHONPATH=src $(PYTHON) -m auditlayer check-config
	PYTHONPATH=src $(PYTHON) -m auditlayer validate-hermes

diagnose-hermes:
	PYTHONPATH=src $(PYTHON) -m auditlayer diagnose-hermes

smoke:
	scripts/smoke-check.sh http://127.0.0.1:8000
