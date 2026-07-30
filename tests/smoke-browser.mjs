/**
 * Browser smoke test — requires: cd tests && npm install && npx playwright install chromium
 * Usage: BASE_URL=http://147.45.174.206 node smoke-browser.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://147.45.174.206';
let failed = 0;

function assert(cond, msg) {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.log(`  ❌ ${msg}`); failed++; }
}

const browser = await chromium.launch({ headless: true });

// Quiz flow
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const reqFailed = [];
    const upgradedOrigin = BASE_URL.replace(/^http:/, 'https:');
    page.on('requestfailed', r => {
        if (r.url().startsWith(upgradedOrigin)) reqFailed.push(r.url());
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.click('button:has-text("Начать викторину")');
    await page.waitForTimeout(4000);

    const quiz = await page.evaluate(() => ({
        screen: document.querySelector('.screen.active')?.id,
        questions: typeof questions !== 'undefined' ? questions.length : 0,
        token: !!localStorage.getItem('userToken'),
        error: document.querySelector('.error-message')?.textContent || null
    }));

    assert(reqFailed.length === 0, 'No HTTPS upgrade errors on HTTP VPS');
    assert(quiz.screen === 'quiz-screen', 'Quiz screen opens after start');
    assert(quiz.questions > 0, `Questions loaded (${quiz.questions})`);
    assert(quiz.token, 'Guest session token created');
    assert(!quiz.error, 'No load error on main quiz');

    await ctx.close();
}

// Status page
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/status.html`, { waitUntil: 'networkidle' });
    const text = await page.textContent('#status-card');
    assert(text && text.includes('Система'), 'Status page renders');
    assert(!text.includes('Не удалось загрузить'), 'Status API reachable');
    await ctx.close();
}

// Stale loading hash
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/#loading-screen`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const fix = await page.evaluate(() => ({
        hash: location.hash,
        active: document.querySelector('.screen.active')?.id
    }));
    assert(fix.active === 'welcome-screen', 'Stale #loading-screen redirects to welcome');
    await ctx.close();
}

// Key pages load
for (const path of ['/register.html', '/cases.html', '/learning.html', '/rating.html', '/realtime-host.html', '/pulse-host.html', '/pulse-player.html', '/qa-host.html', '/qa-player.html', '/seminar-digest.html']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
    assert(res && res.status() < 400, `Page ${path} loads (${res?.status()})`);
    await ctx.close();
}

await browser.close();

console.log(failed ? `\n📊 Failed: ${failed}` : '\n📊 All browser smoke tests passed');
process.exit(failed > 0 ? 1 : 0);
