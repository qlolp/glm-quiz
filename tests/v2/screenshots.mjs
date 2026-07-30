// Captures V2 screens at a phone viewport for visual review.
// Usage: node scripts/v2-screenshots.mjs <baseUrl> <outDir> [viewportWidth]
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const [baseUrl, outDir, widthArg] = process.argv.slice(2);
if (!baseUrl || !outDir) {
    console.error('Usage: node scripts/v2-screenshots.mjs <baseUrl> <outDir> [width]');
    process.exit(1);
}

const width = Number(widthArg) || 390;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
});
const page = await context.newPage();

const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
    console.log(`captured ${name}`);
};

const visit = async (path, name) => {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await shot(name);
};

try {
    await visit('/v2', '01-landing');
    await visit('/v2/learn', '02-learn');
    await visit('/v2/cases', '03-cases');
    await visit('/v2/me', '04-profile');
    await visit('/v2/host', '05-host');

    await page.goto(`${baseUrl}/v2`, { waitUntil: 'networkidle' });
    await page.locator('[data-goal="quick"]').click();
    await shot('06-identity');

    const skip = page.locator('[data-action="skip-name"]');
    if (await skip.count()) await skip.click();
    await page.locator('[data-answer="0"]').waitFor({ state: 'visible', timeout: 20000 });
    await shot('07-question');

    await page.locator('[data-answer="0"]').click();
    await shot('08-confidence');

    const confirm = page.locator('[data-action="confirm-answer"]').first();
    if (await confirm.count()) await confirm.click();
    await shot('09-feedback');

    // Answer through the remaining questions; the last "next" lands on the result screen.
    for (let step = 0; step < 40; step += 1) {
        const next = page.locator('[data-action="next-question"]');
        if (!(await next.count())) break;
        await next.click();
        await page.waitForTimeout(200);
        const answer = page.locator('[data-answer="0"]');
        if (!(await answer.count())) break;
        await answer.click();
        const confirmNext = page.locator('[data-action="confirm-answer"]').first();
        if (await confirmNext.count()) await confirmNext.click();
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
    await shot('10-result');
} finally {
    await browser.close();
}
