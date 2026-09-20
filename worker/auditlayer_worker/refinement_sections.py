"""Identity-preserving edits to canonical section artifacts, including old versions."""
from __future__ import annotations

import re
from html.parser import HTMLParser


class _EvidenceText(HTMLParser):
    """Project visible facts, including snapshot notes outside the sections."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'style', 'script', 'svg', 'head'}:
            self.hidden += 1
        if not self.hidden and tag == 'a':
            for name, value in attrs:
                if name == 'href' and value and value.startswith(('https://', 'http://')):
                    self.parts.append(value)

    def handle_endtag(self, tag):
        if tag in {'style', 'script', 'svg', 'head'}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden and data.strip():
            self.parts.append(data.strip())


def refinement_evidence(document: str, heading: str) -> tuple[str, str]:
    start, end = _selected_span(document, heading)
    selected = document[start:end]
    parser = _EvidenceText()
    parser.feed(document)
    supporting = '\n'.join(parser.parts)
    # Never silently discard the tail of observations or source attribution.
    if len(selected) > 32000 or len(supporting) > 48000:
        raise ValueError('Refinement evidence exceeds safe prompt budget')
    return selected, supporting

class _SectionSpans(HTMLParser):
    def __init__(self, document: str):
        super().__init__(convert_charrefs=True)
        self.document = document
        self.lines = [0]
        for match in re.finditer('\n', document):
            self.lines.append(match.end())
        self.depth = 0
        self.start = 0
        self.spans = []

    def char_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag == 'section':
            if not self.depth:
                self.start = self.char_offset()
            self.depth += 1

    def handle_endtag(self, tag):
        if tag == 'section' and self.depth:
            self.depth -= 1
            if not self.depth:
                self.spans.append((self.start, self.document.index('>', self.char_offset()) + 1))


def _selected_span(document: str, heading: str) -> tuple[int, int]:
    # Use the producer's strict structural/attribute validator, not a heading
    # regex. Reject unsafe/ambiguous artifacts rather than repairing their DOM.
    from .core import _ReportSectionParser
    parser = _SectionSpans(document)
    parser.feed(document)
    matches = []
    for start, end in parser.spans:
        validator = _ReportSectionParser()
        try:
            _, headings = validator.sanitized(document[start:end])
        except ValueError as exc:
            raise ValueError('Unsafe or ambiguous report section') from exc
        if len(headings) != 1 or not 0 < len(headings[0].strip()) <= 160:
            raise ValueError('Unsafe or ambiguous report section')
        if headings[0].strip() == heading:
            matches.append((start, end))
    if parser.depth or len(matches) != 1:
        raise ValueError('Requested section is absent or ambiguous in this report version')
    return matches[0]


def replace_refinement_section(document: str, heading: str, replacement: str) -> str:
    start, end = _selected_span(document, heading)
    # Literal slice insertion: regex replacement syntax in prose is not code.
    return document[:start] + replacement + document[end:]
