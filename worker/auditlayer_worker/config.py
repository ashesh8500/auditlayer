"""Worker configuration, read from environment (and an optional .env file)."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import socket


def _load_dotenv(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (override or key not in os.environ):
            os.environ[key] = value


def load_env_files() -> None:
    here = Path(__file__).resolve()
    repo_root = here.parents[2]
    _load_dotenv(repo_root / ".env")
    _load_dotenv(here.parents[1] / ".env", override=True)


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _default_worker_id() -> str:
    explicit = os.getenv("AUDITLAYER_WORKER_ID")
    if explicit:
        return explicit
    hostname = os.getenv("HOSTNAME")
    if hostname:
        return hostname
    try:
        return socket.gethostname()
    except Exception:
        return "unknown"


@dataclass(frozen=True)
class WorkerSettings:
    supabase_url: str | None
    supabase_service_role_key: str | None
    reports_bucket: str
    pdfs_bucket: str
    signed_url_ttl_seconds: int
    hermes_mode: str
    hermes_api_base: str
    hermes_api_key: str | None
    hermes_model: str
    hermes_provider: str
    hermes_timeout_seconds: float
    hermes_gateway_bin: str | None
    hermes_subprocess_idle_seconds: float
    hermes_gateway_startup_timeout: float
    hermes_agent_root: str | None
    hermes_max_iterations: int
    alm_accounts_root: str
    enabled_toolsets: tuple[str, ...]
    max_tokens: int
    temperature: float
    generator: str
    token_cap: int
    cost_cap_usd: float
    price_in_per_mtok: float
    price_out_per_mtok: float
    poll_interval_seconds: float
    phase_interval_seconds: float
    pdf_mode: str
    chromium_path: str | None
    worker_id: str
    output_dir: Path

    @classmethod
    def from_env(cls) -> "WorkerSettings":
        load_env_files()
        toolsets = os.getenv("AUDITLAYER_TOOLSETS", "web,browser,x_search")
        return cls(
            supabase_url=os.getenv("SUPABASE_URL") or None,
            supabase_service_role_key=(
                os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or None
            ),
            reports_bucket=os.getenv("AUDITLAYER_REPORTS_BUCKET", "reports"),
            pdfs_bucket=os.getenv("AUDITLAYER_PDFS_BUCKET", "pdfs"),
            signed_url_ttl_seconds=int(os.getenv("AUDITLAYER_SIGNED_URL_TTL", str(60 * 60 * 24 * 365))),
            hermes_mode=os.getenv("HERMES_MODE", "http").strip().lower(),
            hermes_api_base=os.getenv("HERMES_API_BASE", "http://127.0.0.1:8642/v1"),
            hermes_api_key=os.getenv("HERMES_API_KEY") or None,
            hermes_model=os.getenv("HERMES_MODEL", "gpt-5.6-sol"),
            hermes_provider=os.getenv("HERMES_PROVIDER", "openai-codex"),
            hermes_timeout_seconds=float(os.getenv("HERMES_TIMEOUT_SECONDS", "600")),
            hermes_gateway_bin=os.getenv("HERMES_GATEWAY_BIN") or None,
            hermes_subprocess_idle_seconds=float(
                os.getenv("HERMES_SUBPROCESS_IDLE_SECONDS", "120")
            ),
            hermes_gateway_startup_timeout=float(
                os.getenv("HERMES_GATEWAY_STARTUP_TIMEOUT", "60")
            ),
            hermes_agent_root=os.getenv("HERMES_AGENT_ROOT") or None,
            hermes_max_iterations=int(os.getenv("HERMES_MAX_ITERATIONS", "15")),
            alm_accounts_root=os.getenv("ALM_ACCOUNTS_ROOT", "/opt/alm/hermes/accounts"),
            enabled_toolsets=tuple(t.strip() for t in toolsets.split(",") if t.strip()),
            max_tokens=int(os.getenv("HERMES_MAX_TOKENS", "32000")),
            temperature=float(os.getenv("HERMES_TEMPERATURE", "0.2")),
            generator=os.getenv("AUDITLAYER_GENERATOR", "hermes").lower(),
            token_cap=int(os.getenv("AUDITLAYER_TOKEN_CAP", "120000")),
            cost_cap_usd=float(os.getenv("AUDITLAYER_COST_CAP_USD", "3.0")),
            price_in_per_mtok=float(os.getenv("AUDITLAYER_PRICE_IN_PER_MTOK", "0.14")),
            price_out_per_mtok=float(os.getenv("AUDITLAYER_PRICE_OUT_PER_MTOK", "0.28")),
            poll_interval_seconds=float(os.getenv("AUDITLAYER_POLL_INTERVAL", "5")),
            phase_interval_seconds=float(os.getenv("AUDITLAYER_PHASE_INTERVAL", "0")),
            pdf_mode=os.getenv("AUDITLAYER_PDF_MODE", "browser").lower(),
            chromium_path=os.getenv("CHROMIUM_PATH") or None,
            worker_id=_default_worker_id(),
            output_dir=Path(os.getenv("AUDITLAYER_OUTPUT_DIR", "var/worker-out")),
        )

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)
