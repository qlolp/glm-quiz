# HTTPS + Domain Setup Plan — glm-quiz

Target: 147.45.174.206 → https://<domain> for seminar 25-27 August
Date: 2026-07-08
Author: Hermes

═══════════════════════════════════════════════
 0. WHAT I NEED FROM YOU BEFORE I TOUCH ANYTHING
═══════════════════════════════════════════════

Two facts block all real progress:

[?Q1] **Domain name** — must be already registered and pointing (NS at least)
      to a zone you control. Anything like `quiz.example.org` etc. I don't buy
      domains — that's your zone.

[?Q2] **DNS control** — I need to add `A @ → 147.45.174.206` (and `A www` if
      you want www). Either via registrar UI screenshot or via creds to the DNS
      provider. If you don't have one — Cloudflare free tier takes 5 min,
      bill me the setup.

Until both are answered, **I do NOT touch** the VPS, do NOT install nginx,
do NOT request certs. Premature infra work on a running prod is how seminars
get cancelled.

═══════════════════════════════════════════════
 1. PLAN (after Q1+Q2 answered)
═══════════════════════════════════════════════

### Phase A — DNS (you, ~5 min)
  - A `quiz.<your-domain>` → 147.45.174.206
  - Wait for TTL (~60s, sometimes up to 600s if zone was cached)

### Phase B — Pre-flight on VPS (Hermes, ~10 min, ZERO downtime)

  1. SSH to VPS, snapshot current state:
       - `ss -lntp` — what listens on :80/:443/:3002 (or whatever port)
       - `systemctl list-units --type=service --state=running` — current
         systemd units
       - `nginx -v` (if installed) — otherwise `apt list --installed`
       - `cat /etc/nginx/sites-enabled/*` — current config
  2. Backup current nginx config: `cp -a /etc/nginx /root/.nginx-backup-<date>`
  3. If a server.js systemd unit is going through `:3002`, identify exact
     command + working directory.

  CRITICAL: the Node app must keep serving :3002 (or whatever current port)
  on the LOOPBACK only, behind nginx. No public direct exposure.

### Phase C — nginx as reverse proxy (Hermes, ~15 min, ZERO downtime)

  Install nginx if absent:
    apt-get install -y nginx

  Write `/etc/nginx/sites-available/glm-quiz.conf`:
    server {
        listen 80;
        server_name quiz.<your-domain>;
        location /.well-known/acme-challenge/ {
            root /var/www/letsencrypt;
        }
        location / {
            return 301 https://$host$request_uri;
        }
    }
  Enable: `ln -s ../sites-available/glm-quiz.conf /etc/nginx/sites-enabled/`
  Test: `nginx -t`
  Reload: `systemctl reload nginx` (NOT restart — keeps current connections)

### Phase D — Let's Encrypt certbot (Hermes, ~5 min)
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d quiz.<your-domain>

  Certbot auto-edits the nginx config to add `:443` block with modern
  settings (TLS 1.2/1.3, 30-day auto-renewal via systemd timer).

### Phase E — Tighten Node bind (Hermes, ~5 min)
  Edit server.js (or systemd unit env) so Express listens ONLY on
  127.0.0.1:<port>, not 0.0.0.0. The public surface is now nginx.

  Check: from external curl http://quiz.<your-domain>:3002/ — should fail
  (port not exposed). From local curl 127.0.0.1:3002 — should work.

### Phase F — WebSocket over wss:// (Hermes, ~5 min)
  nginx must include Upgrade / Connection headers in `:443` block (certbot
  usually adds by default, but verify):
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

  LIVE TEST:
    wscat -c wss://quiz.<your-domain>/
    Should see WebSocket upgrade succeed.

### Phase G — CSP + Helmet adjustment (Hermes, ~10 min)

  Review `connect-src 'self' ws: wss:` — good, already includes wss.

  Add `strict-transport-security: max-age=31536000; includeSubDomains; preload`
  to helmet config — currently HSTS is 15552000 (180 days), bump to 1 year
  for the production-surfaced version.

  Optional: add `upgrade-insecure-requests` directive to CSP — auto-upgrades
  http:// subresource requests to https:// — recommended for going from
  HTTP to HTTPS without explicit frontend changes.

### Phase H — Smoke tests (Hermes, ~10 min)

  All of these MUST pass before we call it done:
    curl -sS https://quiz.<your-domain>/api/health
    curl -sS https://quiz.<your-domain>/api/version
    browser load https://quiz.<your-domain>/   (no mixed-content warnings)
    browser load https://quiz.<your-domain>/qr.html
    WebSocket connection smoke
    Headers: HSTS, CSP, CORP cross-origin, COOP same-origin
    /api/auth/verify rate-limit still active
    /api/quiz/complete replay dedup still works

═══════════════════════════════════════════════
 2. RISK ANALYSIS
═══════════════════════════════════════════════

Why I'm being conservative:

- VPS 147.45.174.206 currently serves public HTTP on the app port. People
  (including your seminar speakers) might have the OLD URL bookmarked. After
  HTTPS deploy, HTTP auto-redirects to HTTPS — clean transition.

- If certbot DNS-01 fails (some DNS providers don't have an API for certbot
  yet), fallback is HTTP-01 challenge — needs port 80 open. Plan C handles
  this.

- The Node server.js Express binding currently may be 0.0.0.0 (listening on
  all interfaces). After nginx-fronted deploy we want loopback only. This
  is one-line systemd Environment or args change — but it MEANS a restart,
  which means a brief downtime window. Schedule it during low traffic.

- If something breaks during cutover — rollback is `rm
  /etc/nginx/sites-enabled/glm-quiz.conf && systemctl reload nginx`, then
  HTTP back to direct-Node. 30-second revert.

═══════════════════════════════════════════════
 3. WHAT'S BLOCKED UNTIL YOU ANSWER
═══════════════════════════════════════════════

Answer Q1 (domain) + Q2 (DNS access) and I start Phase B in the next turn.
No partial action until then.
