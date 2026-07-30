import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryStorage {
    #values = new Map();

    getItem(key) {
        return this.#values.has(key) ? this.#values.get(key) : null;
    }

    setItem(key, value) {
        this.#values.set(key, String(value));
    }

    removeItem(key) {
        this.#values.delete(key);
    }

    clear() {
        this.#values.clear();
    }
}

globalThis.localStorage = new MemoryStorage();

const storage = await import('../../frontend-v2/src/core/storage.js');

test('legacy identity migrates without deleting old values', () => {
    localStorage.clear();
    localStorage.setItem('quiz_user', JSON.stringify({
        id: 'legacy-id',
        username: 'legacy-user',
        display_name: 'Анна'
    }));
    localStorage.setItem('userToken', 'legacy-token');

    storage.migrateLegacyStorage();

    assert.equal(storage.getSession().userId, 'legacy-id');
    assert.equal(storage.getSession().token, 'legacy-token');
    assert.equal(storage.getProfile().displayName, 'Анна');
    assert.ok(localStorage.getItem('quiz_user'));
    assert.equal(localStorage.getItem('userToken'), 'legacy-token');
});

test('legacy preferences and progress receive glm.v2 keys', () => {
    localStorage.clear();
    localStorage.setItem('glm_quiz_sound', 'false');
    localStorage.setItem('glm_quiz_progress', JSON.stringify({ currentQuestion: 2 }));

    storage.migrateLegacyStorage();

    assert.equal(storage.read(storage.keys.preferences).sound, false);
    assert.equal(storage.read(storage.keys.progress).currentQuestion, 2);
    assert.equal(localStorage.getItem('glm_quiz_sound'), 'false');
});
