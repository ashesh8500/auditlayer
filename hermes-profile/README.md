# ALM canonical Hermes profile distribution

This directory is the version-controlled source of truth for AuditLayerMedia's Hermes roles. Runtime profile directories under `~/.hermes/profiles/` contain secrets, sessions, memory, and other mutable state; they are deployments, not canonical configuration.

## Roles

| Canonical role | Runtime profile | Purpose |
|---|---|---|
| `operator` | `alm` | Founder-facing company operator and report discussion surface |
| `dev` | `alm-dev` | Private full-stack engineering worker |
| `ops` | `alm-ops` | Private production diagnostics and release worker |
| `report` | `alm-report` | Noninteractive report-runtime template |

Every role is pinned to `deepseek` + `deepseek-v4-flash` with no fallback. The report role is additionally denied terminal, file, messaging, delegation, broad memory, and deployment tools.

## Install or verify

```bash
python hermes-profile/scripts/install_profile.py --all
python hermes-profile/scripts/install_profile.py --all --check
```

Materialization overwrites only managed `config.yaml`, `SOUL.md`, and shared context documents. It preserves `.env`, `auth.json`, state databases, sessions, memories, logs, and other runtime state.

The `alm` Telegram adapter remains disabled in committed configuration. Enable it only after a unique BotFather token and explicit Ashesh/Narin numeric user allowlist are written to the runtime profile's private `.env`.

## Product runtime

The Python worker does not share the mutable `alm` home. It creates account-scoped homes and seeds them from `profiles/report`. This keeps creator memory tenant-isolated while using the same versioned model/tool/policy contract.

Runtime state and secrets must never be committed.
