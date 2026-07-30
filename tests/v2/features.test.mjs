import assert from 'node:assert/strict';
import test from 'node:test';
import { hostView } from '../../frontend-v2/src/features/host.js';
import { learnView } from '../../frontend-v2/src/features/learn.js';
import { profileView } from '../../frontend-v2/src/features/profile.js';
import { quizView, selectAnswer, speakCurrentQuestion } from '../../frontend-v2/src/features/quiz.js';
import { state } from '../../frontend-v2/src/core/state.js';
import { setPreferences } from '../../frontend-v2/src/core/storage.js';

class MemoryStorage {
    #values = new Map();
    getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
    setItem(key, value) { this.#values.set(key, String(value)); }
    removeItem(key) { this.#values.delete(key); }
    clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
    location: { origin: 'http://localhost:3000' }
};

test('learn hub exposes review and category practice', () => {
    state.learn.stats = { due_today: 2, total_cards: 5, mature_cards: 1 };
    const html = learnView();
    assert.match(html, /Повторение на сегодня/);
    assert.match(html, /data-action="start-review"/);
    assert.match(html, /data-action="start-category"/);
    assert.match(html, /data-category="ethics"/);
});

test('profile includes settings and secondary links', () => {
    localStorage.clear();
    state.profileExtras.certificates = [];
    const html = profileView();
    assert.match(html, /data-form="profile-settings"/);
    assert.match(html, /data-form="action-plan"/);
    assert.match(html, /my-certificates\.html/);
    assert.match(html, /register\.html/);
    assert.match(html, /\/v2\/host/);
});

test('quiz applies confidence and TTS preferences without blocking', () => {
    localStorage.clear();
    state.questions = [{ id: 7, question: 'Тестовый вопрос?', category: 'ethics', options: ['А', 'Б', 'В', 'Г'] }];
    state.index = 0;
    state.pendingAnswer = null;
    state.feedback = null;
    state.busy = false;

    setPreferences({ confidencePrompt: true, tts: true, sound: false });
    assert.equal(selectAnswer(2), true);
    assert.match(quizView(), /data-action="confirm-answer"/);
    assert.match(quizView(), /data-confidence="high"/);

    const spoken = [];
    globalThis.SpeechSynthesisUtterance = class {
        constructor(text) { this.text = text; }
    };
    globalThis.speechSynthesis = {
        cancel() {},
        speak(utterance) { spoken.push(utterance.text); }
    };
    assert.doesNotThrow(() => speakCurrentQuestion({ force: true }));
    assert.match(spoken[0], /Тестовый вопрос/);

    state.pendingAnswer = null;
    setPreferences({ confidencePrompt: false, tts: false });
    assert.equal(selectAnswer(1), false);
});

test('host hub lists speaker tools without becoming home goals', () => {
    const html = hostView();
    assert.match(html, /Кабинет спикера/);
    assert.match(html, /realtime-host\.html/);
    assert.match(html, /pulse-host\.html/);
    assert.match(html, /qa-host\.html/);
    assert.match(html, /seminar-digest\.html/);
    assert.match(html, /stage-heatmap\.html/);
    assert.match(html, /admin\.html/);
    assert.match(html, /qr\.html/);
    assert.match(html, /status\.html/);
    assert.match(html, /guide\/speaker/);
    assert.match(html, /data-action="copy-link"/);
    assert.doesNotMatch(html, /data-goal=/);
});
