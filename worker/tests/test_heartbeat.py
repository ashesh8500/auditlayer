"""Smoke tests for the heartbeat mechanism in pipeline.py."""
import time

import pytest

from auditlayer_worker.pipeline import _Heartbeat, _HEARTBEAT_INTERVAL, EventSink


class _FakeSink:
    """Minimal EventSink implementation for heartbeat tests."""

    def __init__(self) -> None:
        self.events: list[tuple[str, str, str | None]] = []

    def emit(self, phase: str, detail: str = "", *, event_type: str | None = None) -> None:
        self.events.append((phase, detail, event_type))


def test_heartbeat_fires_during_sleep() -> None:
    """Heartbeat should fire at least one event during a short sleep."""
    sink = _FakeSink()
    with _Heartbeat(sink, interval=0.1) as hb:
        hb.progress("researching", "Starting research")
        time.sleep(0.35)  # Should give us ~3 heartbeats

    heartbeats = [ev for ev in sink.events if ev[2] == "heartbeat"]
    assert len(heartbeats) >= 2, f"Expected at least 2 heartbeats, got {len(heartbeats)}"
    for _, detail, _ in heartbeats:
        assert "Heartbeat" in detail


def test_heartbeat_phase_tracks_progress() -> None:
    """Heartbeat phase should reflect the most recent progress call."""
    sink = _FakeSink()
    with _Heartbeat(sink, interval=0.1) as hb:
        hb.progress("researching", "R1")
        time.sleep(0.15)
        hb.progress("metrics", "M1")
        time.sleep(0.15)
        hb.progress("composing", "C1")
        time.sleep(0.15)

    heartbeats = [ev for ev in sink.events if ev[2] == "heartbeat"]
    assert len(heartbeats) >= 2
    # Last heartbeat should reflect the last-set phase
    last_hb = heartbeats[-1]
    assert last_hb[0] == "composing", f"Expected 'composing', got '{last_hb[0]}'"


def test_heartbeat_stops_after_context() -> None:
    """Heartbeat thread should stop after exiting context manager."""
    sink = _FakeSink()
    with _Heartbeat(sink, interval=0.05) as hb:
        hb.progress("researching", "R")
        time.sleep(0.1)

    count_before = len(sink.events)
    time.sleep(0.2)  # Wait longer than interval — no more heartbeats
    count_after = len(sink.events)
    assert count_after == count_before, (
        f"Heartbeat continued firing after context exit: {count_before} -> {count_after}"
    )


def test_heartbeat_interval_constant() -> None:
    """Default interval should be the expected 60 seconds."""
    assert _HEARTBEAT_INTERVAL == 60.0


def test_heartbeat_exception_does_not_crash() -> None:
    """Heartbeat thread must not crash the worker if sink.emit raises."""

    class _BrittleSink:
        call_count = 0

        def emit(self, phase: str, detail: str = "", *, event_type: str | None = None) -> None:
            self.call_count += 1
            if event_type == "heartbeat":
                raise RuntimeError("transient supabase error")

    sink = _BrittleSink()
    with _Heartbeat(sink, interval=0.05) as hb:
        hb.progress("researching", "R")
        time.sleep(0.15)

    # Context should exit cleanly despite heartbeat exceptions
    assert sink.call_count >= 1, "Progress call should succeed"
