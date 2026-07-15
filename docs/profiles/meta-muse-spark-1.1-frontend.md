# Profile: meta-muse-spark-1.1 (frontend)

Load ONLY this + your card's `in` files. Never full-scan web/.

## Tokens (globals.css — authoritative)
--bg #f5f1e8 · --surface #fffdf8 · --text #14241f · --muted #65736e · --line #dcd7ca
--accent #0d9488 · --accent-muted #e0f2ed · --green #059669 · --amber #d97706 · --red #dc2626 · --blue #2563eb
--radius 8px · --shadow · --shadow-md · --shadow-lg
Fonts: Inter body, JetBrains Mono numbers.

## Primitives (use, do not reinvent)
alm-shell (max-w-6xl px) · alm-kicker (mono .68rem uppercase .14em accent) · alm-panel (border-border bg-card shadow) · alm-table-wrap · alm-focus
Badge tone= neutral|accent|success|warning|danger|info (components/ui/badge.tsx EXISTS)
NEW: Banner[tone,icon,title] · EmptyState[icon,title,body,action] · PageHeader[kicker,title,desc] · HealthDot[state:active|stale|expired] · AccountCard

## Bans (delete on sight)
bg-[#14241f] one-offs (allowed ONLY: landing hero, landing method section, login split, dashboard active-audit hero)
border-green-200 bg-green-50 / raw tailwind color literals → use --green-muted via Badge/Banner
style={{background:"#1877F2"}} inline → Button variant
rounded-xl hover:-translate-y-0.5 (use alm-panel + hover:shadow-md)
per-page bespoke h1 → PageHeader

## Nav
AppHeader: Accounts (primary, Building2) · Audits · Admin(if) · Sign out. Active = accent underline.
Post-login landing = /accounts (not /dashboard).
