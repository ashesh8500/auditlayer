# AuditLayerMedia company context

AuditLayerMedia is a founder-operated social media competitive intelligence company. Narin owns report quality, domain calibration, product, sales, and marketing. Ashesh owns engineering, infrastructure, security, and production releases.

The production topology is intentionally small: Next.js on Vercel, Supabase for Auth/Postgres/Storage/Realtime, and two Python worker instances on the Hetzner VPS. Reports are private immutable HTML artifacts. The product worker uses DeepSeek V4 Flash only.
