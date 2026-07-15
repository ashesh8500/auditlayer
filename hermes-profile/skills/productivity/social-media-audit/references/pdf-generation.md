# PDF Generation with Chromium Headless

## The snap sandbox trap

On this VM, `chromium-browser` is installed as a **snap** (Chromium 149+). Snap applications run in a strict sandbox that blocks access to `/tmp` and many system paths.

### Diagnostic signature

| Symptom | What it means |
|---------|---------------|
| Output PDF is **~16–20KB** | Snap sandbox blocked file access — the PDF contains a browser error page, not your content |
| Output PDF is **150KB+** | Success — real content rendered |
| DBus errors in stderr | Harmless snap/sandbox noise. Ignore them. |

### Correct invocation

```bash
# 1. Write HTML to $HOME (NOT /tmp)
write_file(path="/home/asheshkaji/something.html", content="...")

# 2. Use file:// URL + $HOME output path
chromium-browser --headless --disable-gpu \
  --print-to-pdf=/home/asheshkaji/something.pdf \
  --no-pdf-header-footer \
  file:///home/asheshkaji/something.html

# 3. Verify size
ls -lh /home/asheshkaji/something.pdf  # Must be >100KB
```

### What NOT to do

- ❌ `--print-to-pdf=/tmp/something.pdf` — snap can't write there
- ❌ `/tmp/something.html` as input — snap can't read from there
- ❌ Bare path without `file://` — may silently fail

## Page verification workflow

After generating a PDF, verify each page before sending. Don't send blind — page breaks often shift.

```bash
# Extract individual pages as PNG
convert -density 150 /path/to/file.pdf[3] /tmp/check-p3.png
convert -density 150 /path/to/file.pdf[4] /tmp/check-p4.png
# ... etc.

# Feed each to vision_analyze with a specific question
vision_analyze(
  image_url="/tmp/check-p3.png",
  question="Are ALL cards fully visible? Any content cut off? Left edges aligned?"
)
```

### Page index reference

PDF pages are 0-indexed in ImageMagick: `[0]` = cover, `[1]` = page 1, etc.

### Common issues to check

- Multi-card layouts: do all cards fit on one page, or is the last one spilling?
- Tables: are all rows present, columns aligned?
- Text overflow: is any text truncated or overlapping?
- Page breaks: is content split mid-card?

### When pages don't fit

Solutions in priority order:
1. Reduce preview/component heights (150px is safer than 220px+)
2. Reduce page padding (48px is safer than 72px)
3. Reduce font sizes slightly
4. Add `page-break-inside: avoid` to cards
5. Split content across multiple pages as last resort
