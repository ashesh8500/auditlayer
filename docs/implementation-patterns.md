# Implementation Patterns

Deployment, operations, and integration patterns discovered while building the AuditLayer demo and running the audit pipeline.

> **v2 production stack:** See [`deployment.md`](deployment.md) and [`agent-handoff.md`](agent-handoff.md)
> for Vercel + Supabase + worker commands. This doc retains demo-era patterns (GitHub Pages,
> Hermes skill loading, report editing) that still apply to report content work.

---

## Deployment Pattern: GitHub Pages Sub-Root

For hosting static artifacts under a custom domain sub-path (e.g., `asheshkaji.com/auditlayer/`):

```bash
# 1. Create repo
gh repo create ashesh8500/<name> --public -d "Description" --source=. --remote origin --push

# 2. Local clone
git clone git@github.com:ashesh8500/<name>.git ~/projects/<name>

# 3. Set git identity (repo-local)
cd ~/projects/<name>
git config user.email "ashesh@asheshkaji.com"
git config user.name "Ashesh Kaji"

# 4. Push and enable Pages
git push origin master
# Use GitHub API or UI to enable Pages from master branch, root (/)
```

**Live URL pattern:** `https://asheshkaji.com/<name>/` — available immediately after Pages deployment. HTTPS certificate covered by existing custom domain config on the `personal_web` repo.

**Branch convention:** `master` (not `main`) — the `personal_web` repo and all sub-project repos use `master`.

---

## Hermes Skill Integration

### Skill Location
- Global skills: `~/.hermes/skills/<category>/<skill-name>/SKILL.md`
- Repo-local skills: `<repo>/.hermes/SKILL.md` (used when working inside that repo)

### Skill Loading Pattern
When generating an audit via Hermes:
1. The `social-media-audit` skill is loaded — provides the 15-section framework, CSS patterns, delivery conventions
2. Research phase: web_search + web_extract across platform analytics, competitor data, sentiment
3. Assembly: report built per the design system, saved to `~/projects/analyses/<subject>-social-media-audit.md`
4. Delivery: `send_message` with `MEDIA:` path for platform-native file delivery

### Report Save Pattern
```
/home/asheshkaji/projects/analyses/<subject-slug>-social-media-audit.md
```

---

## Git Operations for Audit Reports

### Adding Comparisons to Existing Reports
```bash
cd ~/projects/narin
# Edit the report HTML (add comparison section before <!-- TARGETS -->)
git add hemalpatelphd-instagram-audit.html
git commit -m "add @hubermanlab comparison to hemalpatelphd audit"
git push origin master
```

**Rules:**
- One commit per comparison addition
- Always update the report `.subtitle` to list new benchmark handles
- Use the report's existing CSS classes — never introduce new styles

### Bulk Find-and-Replace
Use Python scripts (not chained sed) to avoid double-replacement problems:

```python
#!/usr/bin/env python3
"""Safe bulk find-and-replace for HTML/markdown reports."""
import sys, json

def safe_replace(filepath, replacements):
    with open(filepath, "r") as f:
        content = f.read()
    for old, new in replacements:
        count = content.count(old)
        if count > 0:
            content = content.replace(old, new)
            print(f"Replaced {count}x: {old[:60]}")
    with open(filepath, "w") as f:
        f.write(content)

if __name__ == "__main__":
    filepath, replacements = sys.argv[1], json.loads(sys.argv[2])
    safe_replace(filepath, replacements)
```

Usage: `python3 safe-replace.py <file> '[["old", "new"], ...]'`

**Pitfall:** "Dr Joe" → "Dr Joe" replacements must not create "Dr Dr Joe". Python's str.replace handles this correctly when applied in sequence with longer patterns first. Chained sed fails on this.

---

## File Delivery Patterns

### Telegram
```python
# Correct: native media delivery
send_message(action="send", target="telegram:typeshit", message="Report ready:\nMEDIA:/path/to/report.html")

# Wrong: local paths in markdown
send_message(message="Report here: /home/asheshkaji/projects/analyses/report.md")
# ↑ The Telegram user cannot access the VM filesystem
```

### Target Routing
Always check the session context for the user's origin:
- `Source: Telegram (group: typeshit)` → target: `"telegram:typeshit"`
- `Source: Telegram` (no group) → target: `"telegram"` (home DM)

When unsure, call `send_message(action="list")` to enumerate available targets.

---

## Audit Generation Performance

### Research Phase Timings
- Web search sweep (5-8 queries): 30-60 seconds
- Data extraction (3-5 URLs): 20-40 seconds
- Competitor lookup: 30-60 seconds
- Sentiment analysis (Reddit, reviews): 20-40 seconds

### Assembly Phase Timings
- Report compilation (15 sections): 2-4 minutes
- Total end-to-end: 3-5 minutes

### Token Budget Guidelines
- Research phase: ~15K-25K tokens (input)
- Assembly phase: ~20K-40K tokens (output)
- Total per audit: ~35K-65K tokens
- Cost: $0.60-$1.80 depending on model and audit depth
- Hard cap: $3/audit (safety net, not a target)

---

## Cache Invalidation

### Static Site Deployment
When updating files on GitHub Pages, cached versions may be served:
```bash
# Force cache refresh
curl -sI "https://asheshkaji.com/auditlayer/?v=$(date +%s)" | head -5
```

For scripts referenced in HTML, version-bust with query params:
```html
<script src="companion.js?v=12"></script>
```
Increment the version number on every deployment that changes JavaScript behavior.

### Production Consideration
The production portal should add cache-control headers appropriate for authenticated vs. public content. Auth-gated report pages: `Cache-Control: private, no-cache`. Public landing: `Cache-Control: public, max-age=3600`.

---

## Repository Conventions

### Repo Structure for Sub-Projects
```
auditlayer/              # Standalone service repo
├── AGENTS.md            # Agentic dev guidelines
├── README.md
├── docs/                # All product/domain documentation
├── .hermes/SKILL.md     # Repo-specific Hermes skill
├── src/                 # Application code
├── templates/           # HTML templates
└── static/              # Static assets
```

### Branch Naming
- `master` — default branch (matches personal_web conventions)
- Feature branches: `feature/<description>`
- No `main` branch

### Commit Messages
- Imperative mood, lowercase: "add comparison section", "fix subtitle update", "deploy demo v3"
- Descriptive, not generic: not "update file", "fix bug"

---

## Server Infrastructure

### Current Setup (CX22 VM)
- Host: Hetzner CX22 (2 vCPU, 4GB RAM)
- OS: Linux 6.8.0-111-generic
- IP: 100.83.195.75
- SSH: PubkeyAuth only, fail2ban enabled, PasswordAuth disabled
- Syncthing syncs: skills, memories, projects across laptop and VM

### Useful Commands
```bash
# Check GitHub Pages status
curl -sI https://asheshkaji.com/auditlayer/ | head -3

# Force Pages rebuild
gh api /repos/ashesh8500/ashesh8500.github.io/pages/builds -X POST

# Check disk usage
df -h /

# Check running services
systemctl list-units --state=running | grep -E 'hermes|syncthing|nginx|fail2ban'

# Navigate projects (zoxide)
z auditlayer   # or: zoxide query auditlayer
```

---

## Pitfalls

1. **Two repos, different remotes** — `personal_web` pushes to `ashesh8500/ashesh8500.github.io`, `auditlayer` should push to `ashesh8500/auditlayer`
2. **Auth-gated content vs. static demo** — the production portal needs auth; the demo is public. Don't deploy auth-gated content to the public demo path.
3. **Git identity** — set repo-local git config, not global, to avoid cross-repo identity confusion
4. **Cache busting** — always increment version query params after JS changes
5. **Subtitle updates** — always update `.subtitle` when adding comparisons; it's easy to forget
6. **Master branch** — repos use `master`, not `main`; pushing to `main` creates a parallel branch that won't deploy
