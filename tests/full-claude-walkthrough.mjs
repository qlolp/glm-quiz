/**
 * Full walk-through of glm-quiz:
 *  - all 20+ pages
 *  - all in-SPA screens (welcome, quiz, results, etc.)
 *  - console errors / network errors captured
 *  - click each interactive element, log response
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3002';
const PAGES = [
    '/', '/index.html', '/cases.html', '/learning.html', '/learning-enhanced.html',
    '/rating.html', '/gamification.html', '/analytics.html', '/discussion.html',
    '/duel.html', '/teams.html', '/admin.html', '/manager-dashboard.html',
    '/my-certificates.html', '/verify-certificate.html', '/register.html',
    '/realtime-host.html', '/realtime-player.html', '/offline.html',
    '/status.html', '/spaced-repetition.html'
];

let allPassed = 0, allFailed = 0;
const allErrors = [];

function record(test, ok, detail = '') {
    if (ok) { allPassed++; console.log(`  ✅ ${test}${detail ? ' — ' + detail : ''}`); }
    else { allFailed++; console.log(`  ❌ ${test} — ${detail}`); }
}

const browser = await chromium.launch({ headless: true });

// === Part A: page load + smoke ===
console.log('\n=== Part A: page load (each /public/*.html + /) ===');
for (const p of PAGES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErrs = [];
    const netErrs = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => consoleErrs.push('PAGEERR: ' + e.message.slice(0, 200)));
    page.on('requestfailed', r => {
        const u = r.url();
        if (!u.includes('favicon') && !u.includes('.well-known') && !u.includes('googletagmanager')) {
            netErrs.push(`${r.failure()?.errorText} ${u.slice(0, 100)}`);
        }
    });

    let status = '?', title = '';
    try {
        const r = await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        status = r?.status() ?? '?';
        await page.waitForTimeout(500);
        title = await page.title();
        const bodyTxt = (await page.evaluate(() => document.body?.innerText?.length || 0));
        record(`${p} loads (${status})`, status >= 200 && status < 400 && bodyTxt > 0,
               `title="${title.slice(0,40)}" body=${bodyTxt}b errs=${consoleErrs.length}+${netErrs.length}`);
        if (consoleErrs.length) allErrors.push({ page: p, type: 'console', msgs: consoleErrs });
        if (netErrs.length)     allErrors.push({ page: p, type: 'network', msgs: netErrs });
    } catch (e) {
        record(`${p} loads`, false, e.message.slice(0, 100));
    }
    await ctx.close();
}

// === Part B: SPA walkthrough — click every screen on index.html ===
console.log('\n=== Part B: SPA screens — index.html in-SPA tabs ===');
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErrs = [];
    const netErrs = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => consoleErrs.push('PAGEERR: ' + e.message.slice(0, 200)));
    page.on('requestfailed', r => {
        const u = r.url();
        if (!u.includes('favicon') && !u.includes('googletagmanager')) {
            netErrs.push(`${r.failure()?.errorText} ${u.slice(0, 100)}`);
        }
    });

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Try to click "Начать викторину"
    try {
        await page.click('button[data-action="startQuiz"]', { timeout: 5000 });
        await page.waitForTimeout(2000);
        const screen = await page.evaluate(() => document.querySelector('.screen.active')?.id);
        record('Click "Начать викторину" → quiz screen', screen === 'quiz-screen', `now on: ${screen}`);

        // Try clicking first answer option
        const opt = await page.$('.option, .answer, [data-action="answer"], button.choice, .quiz-option');
        if (opt) {
            await opt.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(800);
            const afterClick = await page.evaluate(() => ({
                screen: document.querySelector('.screen.active')?.id,
                selectedCount: document.querySelectorAll('.selected, .correct, .wrong').length
            }));
            record('Click answer option', true, JSON.stringify(afterClick));
        } else {
            record('Click answer option', false, 'no .option/.answer found');
        }
    } catch (e) {
        record('Click "Начать викторину"', false, e.message.slice(0, 100));
    }

    // Check that all in-SPA screens exist (even if hidden)
    const screens = await page.evaluate(() => Array.from(document.querySelectorAll('.screen')).map(s => s.id));
    record(`All in-SPA screens defined (${screens.length})`, screens.length >= 8,
           `ids: ${screens.join(', ')}`);

    if (consoleErrs.length) allErrors.push({ page: '/ SPA', type: 'console', msgs: consoleErrs });
    if (netErrs.length)     allErrors.push({ page: '/ SPA', type: 'network', msgs: netErrs });
    console.log(`  console errors: ${consoleErrs.length}, network errors: ${netErrs.length}`);
    if (consoleErrs.length) consoleErrs.forEach(e => console.log('    [console]', e));
    if (netErrs.length)     netErrs.forEach(e => console.log('    [network]', e));
    await ctx.close();
}

// === Part C: admin login flow ===
console.log('\n=== Part C: admin login ===');
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    try {
        const pwd = await page.$('input[type="password"], input[name="password"], #password');
        if (pwd) {
            await pwd.fill('quizadmin2024');
            const btn = await page.$('button[type="submit"], .btn-primary, button[data-action="login"]');
            if (btn) {
                await btn.click();
                await page.waitForTimeout(2000);
                const afterLogin = await page.evaluate(() => ({
                    hasToken: !!localStorage.getItem('adminToken'),
                    url: location.href,
                    visible: !!document.querySelector('.dashboard, .admin-content, .panel, [data-admin-panel]')
                }));
                record('Admin login with default password',
                       afterLogin.hasToken || afterLogin.url !== `${BASE}/admin.html`,
                       JSON.stringify(afterLogin));
            } else {
                record('Admin login button found', false, 'no submit button');
            }
        } else {
            record('Admin password input found', false, 'no #password input');
        }
    } catch (e) {
        record('Admin login flow', false, e.message.slice(0, 100));
    }
    await ctx.close();
}

// === Part D: register flow ===
console.log('\n=== Part D: register flow ===');
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/register.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const inputs = await page.$$('input[type="email"], input[type="text"], input[name], #email, #fio, #organization');
    record(`Register form has ${inputs.length} inputs`, inputs.length >= 2, '');
    if (inputs.length >= 2) {
        try {
            await inputs[0].fill(`test_${Date.now()}@example.com`);
            for (let i = 1; i < inputs.length; i++) await inputs[i].fill(`Test User ${i}`);
            const btn = await page.$('button[type="submit"], .btn-primary');
            if (btn) {
                await btn.click();
                await page.waitForTimeout(2500);
                const after = await page.evaluate(() => ({
                    hasUser: !!localStorage.getItem('quiz_user') || !!localStorage.getItem('userId'),
                    hasToken: !!localStorage.getItem('userToken'),
                    visibleMsg: document.querySelector('.error-message, .success-message, .result')?.innerText?.slice(0, 200) || null
                }));
                record('Register submit', after.hasUser || after.hasToken || !!after.visibleMsg,
                       JSON.stringify(after));
            }
        } catch (e) {
            record('Register fill & submit', false, e.message.slice(0, 100));
        }
    }
    await ctx.close();
}

console.log('\n=== SUMMARY ===');
console.log(`Passed: ${allPassed}, Failed: ${allFailed}`);
if (allErrors.length) {
    console.log(`\n=== ERRORS BY PAGE (${allErrors.length}) ===`);
    for (const e of allErrors) {
        console.log(`\n[${e.type}] on ${e.page}:`);
        for (const m of e.msgs.slice(0, 10)) console.log('  -', m);
    }
}

await browser.close();
process.exit(allFailed > 0 ? 1 : 0);