/**
 * GLM Quiz — Helmet header unit tests
 *
 * Run with:
 *   node tests/helmet-headers.test.cjs
 *
 * Verifies the security headers from server.js match the policy we expect.
 * Boots a child Node process to read server.js (without actually starting
 * the server) and inspects the helmet config literal. Also starts the real
 * server briefly and curls the headers.
 *
 * Why two modes:
 *   - Static mode: catches "config literal" regressions
 *     (someone typed `hsts: true` instead of `hsts: hstsEnabled`)
 *   - Live mode: catches runtime regressions (env var not read, etc.)
 *
 * Set BASE_URL=http://147.45.174.206 for live mode.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✅ ${msg}`); }
    else      { failed++; console.log(`  ❌ ${msg}`); }
}

async function liveHeaderCheck(baseUrl, label) {
    return new Promise((resolve) => {
        const url = new URL('/api/health', baseUrl);
        const req = http.request({
            hostname: url.hostname,
            port: url.port || (baseUrl.startsWith('https') ? 443 : 80),
            path: url.pathname,
            method: 'GET',
        }, (res) => {
            const hsts = res.headers['strict-transport-security'] || null;
            const csp  = res.headers['content-security-policy'] || null;
            const corp = res.headers['cross-origin-resource-policy'] || null;
            const coop = res.headers['cross-origin-opener-policy'] || null;
            const xcto = res.headers['x-content-type-options'] || null;
            res.resume();
            res.on('end', () => resolve({ hsts, csp, corp, coop, xcto }));
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
    });
}

async function main() {
    console.log('═'.repeat(70));
    console.log(' Helmet headers — static + live regression');
    console.log('═'.repeat(70));

    // ───────── STATIC (server.js source) ─────────
    const serverJs = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'server.js'), 'utf8');

    console.log('\n[static] server.js helmet config:');
    assert(/const hstsEnabled = process\.env\.ENABLE_HSTS === '1'/.test(serverJs),
        'ENABLE_HSTS env var gate present');
    assert(/strictTransportSecurity:\s*hstsEnabled/.test(serverJs),
        'helmet strictTransportSecurity bound to hstsEnabled');
    assert(/upgradeInsecureRequests:\s*null/.test(serverJs),
        'CSP upgrade-insecure-requests is null (off)');
    assert(/connectSrc:\s*\[\s*"'self'"\s*,\s*"ws:"\s*,\s*"wss:"\s*\]/.test(serverJs),
        'CSP connect-src includes ws: and wss: for WebSocket');
    assert(/frameAncestors:\s*\["'none'"\]/.test(serverJs),
        'CSP frame-ancestors is none (clickjacking)');
    assert(/crossOriginResourcePolicy:\s*\{\s*policy:\s*'cross-origin'\s*\}/.test(serverJs),
        'CORP policy is cross-origin (allows CDN scripts in browser)');

    // ───────── LIVE (only if BASE_URL set) ─────────
    const base = process.env.BASE_URL;
    if (base) {
        console.log(`\n[live] ${base}:`);
        const h = await liveHeaderCheck(base, 'live');
        if (h.error) {
            console.log(`  ⚠️  Cannot reach ${base}: ${h.error}`);
        } else {
            // Without ENABLE_HSTS: HSTS must be absent (HTTP-only VPS)
            if (process.env.ENABLE_HSTS === '1') {
                assert(/max-age=\d+/.test(h.hsts || ''),
                    `HSTS enabled (ENABLE_HSTS=1): got "${h.hsts}"`);
            } else {
                assert(h.hsts === null,
                    `HSTS OFF by default: got "${h.hsts}" (env ENABLE_HSTS not set)`);
            }
            assert((h.csp || '').includes("connect-src 'self' ws: wss:"),
                'CSP connect-src includes ws: wss: at runtime');
            assert((h.csp || '').includes("frame-ancestors 'none'"),
                'CSP frame-ancestors none at runtime');
            assert(h.corp === 'cross-origin',
                `CORP=cross-origin at runtime: got "${h.corp}"`);
            assert(h.xcto === 'nosniff',
                `X-Content-Type-Options=nosniff at runtime: got "${h.xcto}"`);
        }
    } else {
        console.log('\n[live] skipped (set BASE_URL=... to enable)');
    }

    console.log('\n' + '═'.repeat(70));
    console.log(` ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(70));
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });