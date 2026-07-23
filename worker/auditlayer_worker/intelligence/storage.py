"""Private atomic JSON stores for resumable local intelligence stages."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import threading
from typing import Any, Mapping
from uuid import uuid4

from .evidence import canonical_json
from .runtime import ChannelStage, SynthesisStage


def _digest(*parts: str) -> str:
    return hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()


class _AtomicJsonStore:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        self._lock = threading.Lock()

    @staticmethod
    def _read(path: Path) -> dict[str, Any] | None:
        try:
            raw = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("intelligence checkpoint is corrupt") from exc
        if not isinstance(value, dict):
            raise RuntimeError("intelligence checkpoint must be a JSON object")
        return value

    def _write(self, path: Path, value: Mapping[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(path.parent, 0o700)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        data = canonical_json(value).encode("utf-8")
        with self._lock:
            descriptor = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            try:
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, path)
                os.chmod(path, 0o600)
            finally:
                try:
                    temporary.unlink()
                except FileNotFoundError:
                    pass


class JsonStageStore(_AtomicJsonStore):
    """Durable successful-stage checkpoints; filenames reveal no customer IDs."""

    def _channel_path(self, run_id: str, channel_id: str) -> Path:
        return self.root / "channels" / f"{_digest(run_id, channel_id)}.json"

    def _synthesis_path(self, run_id: str) -> Path:
        return self.root / "synthesis" / f"{_digest(run_id)}.json"

    def load_channel(self, run_id: str, channel_id: str) -> ChannelStage | None:
        value = self._read(self._channel_path(run_id, channel_id))
        if value is None:
            return None
        cache_key = value.get("cache_key")
        analysis = value.get("analysis")
        if not isinstance(cache_key, str) or not isinstance(analysis, dict):
            raise RuntimeError("channel intelligence checkpoint has invalid shape")
        return ChannelStage(cache_key=cache_key, analysis=analysis)

    def save_channel(self, run_id: str, channel_id: str, stage: ChannelStage) -> None:
        self._write(
            self._channel_path(run_id, channel_id),
            {"cache_key": stage.cache_key, "analysis": stage.analysis},
        )

    def load_synthesis(self, run_id: str) -> SynthesisStage | None:
        value = self._read(self._synthesis_path(run_id))
        if value is None:
            return None
        cache_key = value.get("cache_key")
        synthesis = value.get("synthesis")
        if not isinstance(cache_key, str) or not isinstance(synthesis, dict):
            raise RuntimeError("synthesis intelligence checkpoint has invalid shape")
        return SynthesisStage(cache_key=cache_key, synthesis=synthesis)

    def save_synthesis(self, run_id: str, stage: SynthesisStage) -> None:
        self._write(
            self._synthesis_path(run_id),
            {"cache_key": stage.cache_key, "synthesis": stage.synthesis},
        )


class JsonAnalysisCache(_AtomicJsonStore):
    """Content-addressed validated analysis cache with atomic writes."""

    def _path(self, key: str) -> Path:
        return self.root / key[:2] / f"{_digest(key)}.json"

    def get(self, key: str) -> Mapping[str, Any] | None:
        return self._read(self._path(key))

    def put(self, key: str, value: Mapping[str, Any]) -> None:
        self._write(self._path(key), value)
