"""Render a report HTML string to PDF.

Primary path: headless Chromium ``--print-to-pdf`` (self-contained HTML, no
network needed). Fallback: a clearly-marked stub PDF (valid minimal PDF) so the
pipeline never hard-fails when Chromium is unavailable.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


_CHROMIUM_CANDIDATES = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
)


@dataclass(frozen=True)
class PdfResult:
    data: bytes
    mode: str  # "browser" | "stub"
    note: str = ""


def _find_chromium(explicit: str | None) -> str | None:
    if explicit and (Path(explicit).exists() or shutil.which(explicit)):
        return explicit
    for candidate in _CHROMIUM_CANDIDATES:
        if Path(candidate).exists():
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return None


def render_pdf(html: str, *, mode: str = "browser", chromium_path: str | None = None) -> PdfResult:
    if mode == "browser":
        chromium = _find_chromium(chromium_path)
        if chromium:
            try:
                return PdfResult(data=_chromium_pdf(chromium, html), mode="browser")
            except Exception as exc:  # noqa: BLE001 - fall back to stub, never hard-fail
                return _stub_pdf(f"Chromium PDF render failed: {exc}")
        return _stub_pdf("No Chromium binary found for --print-to-pdf")
    return _stub_pdf("PDF mode is 'stub' (browser rendering disabled)")


def _chromium_pdf(chromium: str, html: str) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "report.html"
        pdf_path = Path(tmp) / "report.pdf"
        html_path.write_text(html, encoding="utf-8")
        cmd = [
            chromium,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ]
        subprocess.run(
            cmd,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120,
            env={**os.environ},
        )
        if not pdf_path.exists():
            raise RuntimeError("Chromium did not produce a PDF")
        return pdf_path.read_bytes()


def _stub_pdf(reason: str) -> PdfResult:
    # Minimal but valid one-page PDF with a clearly-marked notice.
    text = f"AuditLayer report PDF stub - {reason}. Use the HTML report."
    text = text.replace("(", "[").replace(")", "]")
    content_stream = f"BT /F1 12 Tf 50 760 Td ({text}) Tj ET".encode("latin-1", "replace")
    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
    )
    objects.append(
        b"<< /Length " + str(len(content_stream)).encode() + b" >>\nstream\n" + content_stream + b"\nendstream"
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    pdf = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode()
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{off:010d} 00000 n \n".encode()
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode()
    )
    return PdfResult(data=bytes(pdf), mode="stub", note=reason)
