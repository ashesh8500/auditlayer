"""Process-wide synchronization for temporary Hermes home changes."""

from __future__ import annotations

import threading


HERMES_HOME_LOCK = threading.RLock()
