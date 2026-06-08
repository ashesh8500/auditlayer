from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any, Iterator
from uuid import uuid4


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class ClientRecord:
    id: str
    email: str
    name: str
    plan: str
    onboarding_status: str
    subscription_status: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    current_period_end: str | None
    created_at: str


@dataclass(frozen=True)
class AuditRecord:
    id: str
    client_id: str
    handle: str
    platform: str
    goal: str
    context: str
    status: str
    limitations: list[str]
    admin_notes: str
    report_path: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class EventRecord:
    id: str
    audit_id: str | None
    client_id: str | None
    actor: str
    event_type: str
    detail: str
    created_at: str


@dataclass(frozen=True)
class AuthTokenRecord:
    id: str
    email: str
    token_hash: str
    expires_at: str
    consumed_at: str | None
    created_at: str


@dataclass(frozen=True)
class SessionRecord:
    id: str
    client_id: str
    token_hash: str
    expires_at: str
    revoked_at: str | None
    created_at: str


@dataclass(frozen=True)
class RefinementRecord:
    id: str
    audit_id: str
    client_id: str
    section: str
    instruction: str
    status: str
    error: str
    created_at: str
    updated_at: str


class Store:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS clients (
                  id TEXT PRIMARY KEY,
                  email TEXT NOT NULL UNIQUE,
                  name TEXT NOT NULL DEFAULT '',
                  plan TEXT NOT NULL DEFAULT 'free',
                  onboarding_status TEXT NOT NULL DEFAULT 'lead',
                  subscription_status TEXT NOT NULL DEFAULT 'trial',
                  stripe_customer_id TEXT,
                  stripe_subscription_id TEXT,
                  current_period_end TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audits (
                  id TEXT PRIMARY KEY,
                  client_id TEXT NOT NULL REFERENCES clients(id),
                  handle TEXT NOT NULL,
                  platform TEXT NOT NULL,
                  goal TEXT NOT NULL,
                  context TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL,
                  limitations_json TEXT NOT NULL DEFAULT '[]',
                  admin_notes TEXT NOT NULL DEFAULT '',
                  report_path TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
                CREATE INDEX IF NOT EXISTS idx_audits_client ON audits(client_id);

                CREATE TABLE IF NOT EXISTS events (
                  id TEXT PRIMARY KEY,
                  audit_id TEXT REFERENCES audits(id),
                  client_id TEXT REFERENCES clients(id),
                  actor TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  detail TEXT NOT NULL DEFAULT '',
                  created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_events_audit ON events(audit_id);
                CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id);
                CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

                CREATE TABLE IF NOT EXISTS auth_tokens (
                  id TEXT PRIMARY KEY,
                  email TEXT NOT NULL,
                  token_hash TEXT NOT NULL UNIQUE,
                  expires_at TEXT NOT NULL,
                  consumed_at TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

                CREATE TABLE IF NOT EXISTS sessions (
                  id TEXT PRIMARY KEY,
                  client_id TEXT NOT NULL REFERENCES clients(id),
                  token_hash TEXT NOT NULL UNIQUE,
                  expires_at TEXT NOT NULL,
                  revoked_at TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
                CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id);

                CREATE TABLE IF NOT EXISTS refinements (
                  id TEXT PRIMARY KEY,
                  audit_id TEXT NOT NULL REFERENCES audits(id),
                  client_id TEXT NOT NULL REFERENCES clients(id),
                  section TEXT NOT NULL,
                  instruction TEXT NOT NULL,
                  status TEXT NOT NULL,
                  error TEXT NOT NULL DEFAULT '',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_refinements_audit ON refinements(audit_id);
                CREATE INDEX IF NOT EXISTS idx_refinements_client ON refinements(client_id);
                """
            )
            ensure_columns(
                conn,
                "clients",
                {
                    "subscription_status": "TEXT NOT NULL DEFAULT 'trial'",
                    "stripe_customer_id": "TEXT",
                    "stripe_subscription_id": "TEXT",
                    "current_period_end": "TEXT",
                },
            )

    def upsert_client(
        self,
        email: str,
        name: str = "",
        plan: str = "free",
        onboarding_status: str = "lead",
        subscription_status: str | None = None,
        stripe_customer_id: str | None = None,
        stripe_subscription_id: str | None = None,
        current_period_end: str | None = None,
    ) -> ClientRecord:
        now = utcnow()
        with self.connect() as conn:
            existing = conn.execute("SELECT * FROM clients WHERE email = ?", (email,)).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE clients
                    SET name = COALESCE(NULLIF(?, ''), name),
                        plan = ?,
                        onboarding_status = ?,
                        subscription_status = COALESCE(?, subscription_status),
                        stripe_customer_id = COALESCE(?, stripe_customer_id),
                        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
                        current_period_end = COALESCE(?, current_period_end)
                    WHERE email = ?
                    """,
                    (name, plan, onboarding_status, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, email),
                )
                row = conn.execute("SELECT * FROM clients WHERE email = ?", (email,)).fetchone()
            else:
                client_id = f"client_{uuid4().hex[:12]}"
                conn.execute(
                    """
                    INSERT INTO clients
                    (id, email, name, plan, onboarding_status, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        client_id,
                        email,
                        name,
                        plan,
                        onboarding_status,
                        subscription_status or "trial",
                        stripe_customer_id,
                        stripe_subscription_id,
                        current_period_end,
                        now,
                    ),
                )
                row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        return _client_from_row(row)

    def get_client(self, client_id: str) -> ClientRecord | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        return _client_from_row(row) if row else None

    def get_client_by_email(self, email: str) -> ClientRecord | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM clients WHERE email = ?", (email,)).fetchone()
        return _client_from_row(row) if row else None

    def update_client_billing(
        self,
        email: str,
        plan: str,
        subscription_status: str,
        stripe_customer_id: str | None = None,
        stripe_subscription_id: str | None = None,
        current_period_end: str | None = None,
        onboarding_status: str = "paid",
    ) -> ClientRecord:
        return self.upsert_client(
            email=email,
            plan=plan,
            onboarding_status=onboarding_status,
            subscription_status=subscription_status,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            current_period_end=current_period_end,
        )

    def update_client_onboarding(self, client_id: str, onboarding_status: str) -> ClientRecord:
        with self.connect() as conn:
            conn.execute(
                "UPDATE clients SET onboarding_status = ? WHERE id = ?",
                (onboarding_status, client_id),
            )
            row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if row is None:
            raise KeyError(client_id)
        return _client_from_row(row)

    def create_audit(
        self,
        client_id: str,
        handle: str,
        platform: str,
        goal: str,
        context: str,
        status: str,
        limitations: list[str],
        admin_notes: str = "",
    ) -> AuditRecord:
        now = utcnow()
        audit_id = f"audit_{uuid4().hex[:12]}"
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO audits
                (id, client_id, handle, platform, goal, context, status, limitations_json, admin_notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (audit_id, client_id, handle, platform, goal, context, status, json.dumps(limitations), admin_notes, now, now),
            )
            row = conn.execute("SELECT * FROM audits WHERE id = ?", (audit_id,)).fetchone()
        return _audit_from_row(row)

    def list_clients(self) -> list[ClientRecord]:
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM clients ORDER BY created_at DESC").fetchall()
        return [_client_from_row(row) for row in rows]

    def list_audits(self, status: str | None = None, client_id: str | None = None) -> list[AuditRecord]:
        with self.connect() as conn:
            if status and client_id:
                rows = conn.execute(
                    "SELECT * FROM audits WHERE status = ? AND client_id = ? ORDER BY created_at DESC",
                    (status, client_id),
                ).fetchall()
            elif status:
                rows = conn.execute("SELECT * FROM audits WHERE status = ? ORDER BY created_at DESC", (status,)).fetchall()
            elif client_id:
                rows = conn.execute("SELECT * FROM audits WHERE client_id = ? ORDER BY created_at DESC", (client_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM audits ORDER BY created_at DESC").fetchall()
        return [_audit_from_row(row) for row in rows]

    def get_audit(self, audit_id: str) -> AuditRecord | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM audits WHERE id = ?", (audit_id,)).fetchone()
        return _audit_from_row(row) if row else None

    def update_audit(self, audit_id: str, **fields: Any) -> AuditRecord:
        if not fields:
            found = self.get_audit(audit_id)
            if found is None:
                raise KeyError(audit_id)
            return found
        fields["updated_at"] = utcnow()
        assignments = []
        values = []
        for key, value in fields.items():
            column = "limitations_json" if key == "limitations" else key
            if key == "limitations":
                value = json.dumps(value)
            assignments.append(f"{column} = ?")
            values.append(value)
        values.append(audit_id)
        with self.connect() as conn:
            conn.execute(f"UPDATE audits SET {', '.join(assignments)} WHERE id = ?", values)
            row = conn.execute("SELECT * FROM audits WHERE id = ?", (audit_id,)).fetchone()
        if row is None:
            raise KeyError(audit_id)
        return _audit_from_row(row)

    def append_event(
        self,
        event_type: str,
        detail: str = "",
        audit_id: str | None = None,
        client_id: str | None = None,
        actor: str = "system",
    ) -> EventRecord:
        event_id = f"evt_{uuid4().hex[:12]}"
        now = utcnow()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO events (id, audit_id, client_id, actor, event_type, detail, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (event_id, audit_id, client_id, actor, event_type, detail, now),
            )
            row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        return _event_from_row(row)

    def list_events(self, audit_id: str | None = None, limit: int = 50) -> list[EventRecord]:
        with self.connect() as conn:
            if audit_id:
                rows = conn.execute(
                    "SELECT * FROM events WHERE audit_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
                    (audit_id, limit),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM events ORDER BY created_at DESC, rowid DESC LIMIT ?", (limit,)).fetchall()
        return [_event_from_row(row) for row in rows]

    def count_completed_audits(self, client_id: str) -> int:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM audits WHERE client_id = ? AND status IN ('ready', 'needs_review', 'queued', 'running')",
                (client_id,),
            ).fetchone()
        return int(row["count"])

    def metrics(self) -> dict[str, int]:
        with self.connect() as conn:
            clients = conn.execute("SELECT COUNT(*) AS count FROM clients").fetchone()["count"]
            audits = conn.execute("SELECT COUNT(*) AS count FROM audits").fetchone()["count"]
            ready = conn.execute("SELECT COUNT(*) AS count FROM audits WHERE status = 'ready'").fetchone()["count"]
            review = conn.execute("SELECT COUNT(*) AS count FROM audits WHERE status = 'needs_review'").fetchone()["count"]
            blocked = conn.execute("SELECT COUNT(*) AS count FROM audits WHERE status = 'blocked'").fetchone()["count"]
            paid = conn.execute("SELECT COUNT(*) AS count FROM clients WHERE subscription_status IN ('active', 'trialing') AND plan != 'free'").fetchone()["count"]
        return {"clients": clients, "audits": audits, "ready": ready, "needs_review": review, "blocked": blocked, "paid_clients": paid}

    def usage_for_client(self, client_id: str) -> dict[str, int]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT
                  COUNT(*) AS total,
                  SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
                  SUM(CASE WHEN status IN ('queued', 'running', 'needs_review') THEN 1 ELSE 0 END) AS active
                FROM audits
                WHERE client_id = ?
                """,
                (client_id,),
            ).fetchone()
        return {"total": int(row["total"] or 0), "ready": int(row["ready"] or 0), "active": int(row["active"] or 0)}

    def create_auth_token(self, email: str, raw_token: str, expires_at: str) -> AuthTokenRecord:
        token_id = f"auth_{uuid4().hex[:12]}"
        now = utcnow()
        token_hash = hash_secret(raw_token)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO auth_tokens (id, email, token_hash, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (token_id, email, token_hash, expires_at, now),
            )
            row = conn.execute("SELECT * FROM auth_tokens WHERE id = ?", (token_id,)).fetchone()
        return _auth_token_from_row(row)

    def consume_auth_token(self, raw_token: str, now: str | None = None) -> AuthTokenRecord | None:
        now = now or utcnow()
        token_hash = hash_secret(raw_token)
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM auth_tokens WHERE token_hash = ? AND consumed_at IS NULL AND expires_at >= ?",
                (token_hash, now),
            ).fetchone()
            if row is None:
                return None
            conn.execute("UPDATE auth_tokens SET consumed_at = ? WHERE id = ?", (now, row["id"]))
            updated = conn.execute("SELECT * FROM auth_tokens WHERE id = ?", (row["id"],)).fetchone()
        return _auth_token_from_row(updated)

    def create_session(self, client_id: str, raw_token: str, expires_at: str) -> SessionRecord:
        session_id = f"sess_{uuid4().hex[:12]}"
        now = utcnow()
        token_hash = hash_secret(raw_token)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO sessions (id, client_id, token_hash, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, client_id, token_hash, expires_at, now),
            )
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return _session_from_row(row)

    def get_session(self, raw_token: str, now: str | None = None) -> SessionRecord | None:
        now = now or utcnow()
        token_hash = hash_secret(raw_token)
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at >= ?",
                (token_hash, now),
            ).fetchone()
        return _session_from_row(row) if row else None

    def revoke_session(self, raw_token: str) -> None:
        token_hash = hash_secret(raw_token)
        with self.connect() as conn:
            conn.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (utcnow(), token_hash))

    def create_refinement(self, audit_id: str, client_id: str, section: str, instruction: str, status: str = "queued") -> RefinementRecord:
        now = utcnow()
        refinement_id = f"ref_{uuid4().hex[:12]}"
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO refinements (id, audit_id, client_id, section, instruction, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (refinement_id, audit_id, client_id, section, instruction, status, now, now),
            )
            row = conn.execute("SELECT * FROM refinements WHERE id = ?", (refinement_id,)).fetchone()
        return _refinement_from_row(row)

    def update_refinement(self, refinement_id: str, status: str, error: str = "") -> RefinementRecord:
        with self.connect() as conn:
            conn.execute(
                "UPDATE refinements SET status = ?, error = ?, updated_at = ? WHERE id = ?",
                (status, error, utcnow(), refinement_id),
            )
            row = conn.execute("SELECT * FROM refinements WHERE id = ?", (refinement_id,)).fetchone()
        if row is None:
            raise KeyError(refinement_id)
        return _refinement_from_row(row)

    def list_refinements(self, audit_id: str, limit: int = 20) -> list[RefinementRecord]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM refinements WHERE audit_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
                (audit_id, limit),
            ).fetchall()
        return [_refinement_from_row(row) for row in rows]


def _client_from_row(row: sqlite3.Row) -> ClientRecord:
    return ClientRecord(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
        onboarding_status=row["onboarding_status"],
        subscription_status=row["subscription_status"],
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        current_period_end=row["current_period_end"],
        created_at=row["created_at"],
    )


def _audit_from_row(row: sqlite3.Row) -> AuditRecord:
    return AuditRecord(
        id=row["id"],
        client_id=row["client_id"],
        handle=row["handle"],
        platform=row["platform"],
        goal=row["goal"],
        context=row["context"],
        status=row["status"],
        limitations=json.loads(row["limitations_json"]),
        admin_notes=row["admin_notes"],
        report_path=row["report_path"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _event_from_row(row: sqlite3.Row) -> EventRecord:
    return EventRecord(
        id=row["id"],
        audit_id=row["audit_id"],
        client_id=row["client_id"],
        actor=row["actor"],
        event_type=row["event_type"],
        detail=row["detail"],
        created_at=row["created_at"],
    )


def _auth_token_from_row(row: sqlite3.Row) -> AuthTokenRecord:
    return AuthTokenRecord(
        id=row["id"],
        email=row["email"],
        token_hash=row["token_hash"],
        expires_at=row["expires_at"],
        consumed_at=row["consumed_at"],
        created_at=row["created_at"],
    )


def _session_from_row(row: sqlite3.Row) -> SessionRecord:
    return SessionRecord(
        id=row["id"],
        client_id=row["client_id"],
        token_hash=row["token_hash"],
        expires_at=row["expires_at"],
        revoked_at=row["revoked_at"],
        created_at=row["created_at"],
    )


def _refinement_from_row(row: sqlite3.Row) -> RefinementRecord:
    return RefinementRecord(
        id=row["id"],
        audit_id=row["audit_id"],
        client_id=row["client_id"],
        section=row["section"],
        instruction=row["instruction"],
        status=row["status"],
        error=row["error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
