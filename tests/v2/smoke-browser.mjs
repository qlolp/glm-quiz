import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:3112';
const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const legacy = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(legacy.status(), 200);
    // `/` must keep serving the legacy interface, never the V2 bundle.
    assert.equal(await page.locator('[data-goal]').count(), 0);
    assert.equal(await page.locator('.bottom-nav-inner').count(), 0);

    const v2 = await page.goto(`${baseUrl}/v2`, { waitUntil: 'networkidle' });
    assert.equal(v2.status(), 200);
    assert.equal(await page.locator('[data-goal]').count(), 3);

    for (const path of ['/v2/learn', '/v2/cases', '/v2/me', '/v2/host']) {
        const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, path);
        await page.locator('h1').waitFor({ state: 'visible' });
        assert.match(await page.locator('h1').textContent(), /\S+/);
    }

    assert.match(await page.locator('h1').textContent(), /Инструменты ведущего|Кабинет/);
    assert.ok(await page.locator('a[href="/realtime-host.html"]').count());

    await page.goto(`${baseUrl}/v2/learn`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('[data-action="start-review"]').count());
    assert.ok(await page.locator('[data-action="start-category"]').count());

    await page.goto(`${baseUrl}/v2/cases`, { waitUntil: 'networkidle' });
    await page.locator('[data-action="open-case"]').first().waitFor({ state: 'visible', timeout: 15000 });

    await page.goto(`${baseUrl}/v2`, { waitUntil: 'networkidle' });
    await page.locator('[data-goal="quick"]').click();
    await page.locator('[data-action="skip-name"]').click();
    await page.locator('[data-answer="0"]').waitFor({ state: 'visible' });
    // Category labels must be resolved to Russian, never rendered as raw keys.
    const category = await page.locator('.question-head .badge').first().textContent();
    assert.doesNotMatch(category, /^[a-z_]+$/);

    await page.locator('[data-answer="0"]').click();
    // Answers are graded only after the confidence step is confirmed.
    await page.locator('.confidence-prompt').waitFor({ state: 'visible' });
    await page.locator('[data-action="confirm-answer"][data-confidence="high"]').click();

    const verdict = page.locator('.feedback:not(.confidence-prompt) .verdict');
    await verdict.waitFor({ state: 'visible' });
    assert.match(await verdict.textContent(), /Верно|Неверно/);
    // Grading must reveal which option was correct.
    assert.equal(await page.locator('.answer.is-correct').count(), 1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal overflow at 390px (got ${overflow}px)`);

    assert.deepEqual(
        consoleErrors.filter((text) => !/favicon|Cross-Origin-Opener-Policy/i.test(text)),
        []
    );
    console.log('V2 mobile smoke passed');
} finally {
    await browser.close();
}
