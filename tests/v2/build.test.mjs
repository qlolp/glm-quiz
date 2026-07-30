import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const buildRoot = new URL('../../public/v2/', import.meta.url);

test('V2 build has hashed assets and no inline application code', async () => {
    const html = await readFile(new URL('index.html', buildRoot), 'utf8');
    const assets = await readdir(new URL('assets/', buildRoot));

    assert.match(html, /\/v2\/assets\/index-[\w-]+\.js/);
    assert.match(html, /\/v2\/assets\/index-[\w-]+\.css/);
    assert.ok(assets.some((name) => /^index-[\w-]+\.js$/.test(name)));
    assert.ok(assets.some((name) => /^index-[\w-]+\.css$/.test(name)));
    assert.doesNotMatch(html, /<style[\s>]/i);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
});

test('V2 source files stay reviewable', async () => {
    const sourceRoot = new URL('../../frontend-v2/src/', import.meta.url);
    const directories = ['', 'core/', 'features/', 'ui/', 'styles/'];

    for (const directory of directories) {
        const url = new URL(directory, sourceRoot);
        const entries = await readdir(url, { withFileTypes: true });
        for (const entry of entries.filter((item) => item.isFile())) {
            const source = await readFile(new URL(entry.name, url), 'utf8');
            assert.ok(source.split('\n').length < 400, `${directory}${entry.name} exceeds 400 lines`);
        }
    }
});

test('V2 phase routes exist in source modules', async () => {
    const main = await readFile(new URL('../../frontend-v2/src/main.js', import.meta.url), 'utf8');
    assert.match(main, /route === '\/learn'/);
    assert.match(main, /route === '\/learn\/review'/);
    assert.match(main, /route === '\/cases'/);
    assert.match(main, /route === '\/profile' \|\| route === '\/me'/);
    assert.match(main, /route === '\/host'/);
});
