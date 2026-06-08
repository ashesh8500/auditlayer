from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Protocol

from .config import Settings


class PdfRenderer(Protocol):
    def render(self, html_path: Path, pdf_path: Path) -> Path:
        """Render an HTML file to PDF and return the PDF path."""


@dataclass(frozen=True)
class StubPdfRenderer:
    """Deterministic renderer for tests/dev when Chromium is unavailable."""

    def render(self, html_path: Path, pdf_path: Path) -> Path:
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        source = html_path.read_text(encoding="utf-8")
        content = (
            b"%PDF-1.4\n"
            b"% AuditLayer deterministic PDF stub\n"
            + f"Source: {html_path.name}\n".encode("utf-8")
            + f"HTML bytes: {len(source.encode('utf-8'))}\n".encode("utf-8")
            + b"%%EOF\n"
        )
        pdf_path.write_bytes(content)
        return pdf_path


@dataclass(frozen=True)
class BrowserPdfRenderer:
    settings: Settings

    def render(self, html_path: Path, pdf_path: Path) -> Path:
        if not self.settings.chromium_path:
            raise RuntimeError("CHROMIUM_PATH is required for browser PDF rendering")
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            self.settings.chromium_path,
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            f"--print-to-pdf={pdf_path}",
            html_path.resolve().as_uri(),
        ]
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=90)
        if not pdf_path.exists() or pdf_path.stat().st_size == 0:
            raise RuntimeError("Chromium did not produce a PDF")
        return pdf_path


def pdf_renderer_from_settings(settings: Settings) -> PdfRenderer:
    if settings.pdf_mode == "browser":
        return BrowserPdfRenderer(settings)
    return StubPdfRenderer()

