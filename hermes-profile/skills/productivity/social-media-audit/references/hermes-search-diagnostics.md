# Hermes Search Diagnostics

Full diagnostic protocol for when `web_search` or `x_search` return errors.
The agent sees opaque JSON errors — these commands reveal the actual root cause.

## Quick Diagnostic Sequence

```bash
# 1. Which search backends are configured?
hermes config check 2>&1 | grep -i search

# Output example:
#   ○ EXA_API_KEY → web_search, web_extract
#   ○ PARALLEL_API_KEY → web_search, web_extract
#   ○ FIRECRAWL_API_KEY → web_search, web_extract
#   ○ TAVILY_API_KEY → web_search, web_extract
#   ○ BRAVE_SEARCH_API_KEY → web_search
#   ○ SEARXNG_URL → web_search
# If all show (not set), no search backend is configured.

# 2. Check which API keys are actually set in .env
grep -E "EXA_API_KEY|BRAVE_SEARCH|TAVILY|SERPER|PARALLEL|FIRECRAWL|SEARXNG" ~/.hermes/.env

# 3. Check gateway logs for the actual HTTP error
journalctl --user -u hermes-gateway --no-pager -n 50 | grep -iE "search|error|402|403|429"
```

## Failure Mode Reference

### Exa credit exhaustion (402)
```
HTTP 402: "You have exceeded your credits limit. Please top up to keep using Exa at dashboard.exa.ai"
```
- **Affects:** `web_search`, `web_extract` (both use Exa when `EXA_API_KEY` is set)
- **Fix:** Top up at https://dashboard.exa.ai or switch to a different backend
- **Temporary workaround:** Unset `EXA_API_KEY` in `.env` to force Hermes to fall through to the next backend (if any other keys are configured). If no other backend is configured, search will degrade gracefully with a tool error — the agent can fall back to browser-based search.

### xAI x_search permission error (403)
```
HTTP 403: "The caller does not have permission to execute the specified operation"
```
- **Affects:** `x_search` only (X/Twitter search)
- **Cause:** The xAI team/account linked to the API key lacks the X Search feature permission
- **Fix:** Enable X Search in the xAI dashboard or use a different API key with the feature enabled
- **Note:** This is NOT a credit/rate-limit issue — it's a feature-access issue. Credits won't help.

### Missing API key
- **Behavior:** `web_search` returns empty results silently or with a generic error. `hermes config check` shows `(not set)` for all backends.
- **Fix:** Set at least one search provider's API key in `~/.hermes/.env`

### Rate limiting (429)
- **Behavior:** Intermittent failures, sometimes works sometimes doesn't
- **Fix:** Wait, or switch to a different backend

## Backend Switching

To override auto-detection and explicitly set a search backend:

```bash
hermes config set web.search_backend brave    # Use Brave Search
hermes config set web.search_backend tavily   # Use Tavily
hermes config set web.search_backend exa      # Use Exa (default if EXA_API_KEY is set)
hermes config set web.search_backend ''       # Reset to auto-detection
```

After changing, restart the gateway: `hermes gateway restart`

## Environment Variables

| Env Var | Backend | Tools |
|---------|---------|-------|
| `EXA_API_KEY` | Exa | web_search, web_extract |
| `BRAVE_SEARCH_API_KEY` | Brave | web_search |
| `TAVILY_API_KEY` | Tavily | web_search, web_extract |
| `PARALLEL_API_KEY` | Parallel | web_search, web_extract |
| `FIRECRAWL_API_KEY` | Firecrawl | web_search, web_extract |
| `SEARXNG_URL` | SearXNG (self-hosted) | web_search |
| `XAI_API_KEY` | xAI | x_search (requires X Search feature permission) |
