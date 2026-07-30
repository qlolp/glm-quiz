import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryHistory {
    constructor(url) {
        this.url = url;
        this.state = {};
    }

    pushState(state, _title, url) {
        this.state = state;
        this.url = url;
    }

    replaceState(state, _title, url) {
        this.state = state;
        this.url = url;
    }
}

test('V2 router maps /v2 paths and supports silent navigate', async () => {
    const history = new MemoryHistory('/v2/');
    globalThis.window = {
        location: { pathname: '/v2/' },
        history,
        dispatchEvent(event) {
            this.lastEvent = event.type;
        }
    };
    globalThis.history = history;

    const router = await import(`../../frontend-v2/src/core/router.js?t=${Date.now()}`);

    window.location.pathname = '/v2/';
    assert.equal(router.currentRoute(), '/');

    window.location.pathname = '/v2/learn';
    assert.equal(router.currentRoute(), '/learn');

    window.location.pathname = '/v2/me';
    assert.equal(router.currentRoute(), '/me');

    window.location.pathname = '/v2/host';
    assert.equal(router.currentRoute(), '/host');

    window.lastEvent = null;
    router.navigate('/cases');
    assert.equal(history.url, '/v2/cases');
    assert.equal(window.lastEvent, 'glm:navigate');

    window.lastEvent = null;
    router.navigate('/learn/review', { silent: true });
    assert.equal(history.url, '/v2/learn/review');
    assert.equal(window.lastEvent, null);
});
