/**
 * GLM Quiz — Pulse mode WebSocket lifecycle test
 * Covers: host reconnect to the same code, player cleanup on disconnect,
 * no double votes after re-join, joining while results are shown.
 *
 * Usage: BASE_URL=http://147.45.174.206 node tests/pulse-ws.test.cjs
 * Requires Node 18+ (global WebSocket).
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WS_URL = BASE_URL.replace(/^http/, 'ws');
const TIMEOUT = 8000;

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.log(`  ❌ ${message}`);
    }
}

class Client {
    constructor(name) {
        this.name = name;
        this.messages = [];
        this.waiters = [];
        this.ws = new WebSocket(WS_URL);
        this.ready = new Promise((resolve, reject) => {
            this.ws.addEventListener('open', () => resolve(this));
            this.ws.addEventListener('error', (e) => reject(new Error(`${name} socket error`)));
        });
        this.ws.addEventListener('message', (ev) => {
            let data;
            try { data = JSON.parse(ev.data); } catch (e) { return; }
            this.messages.push(data);
            this.waiters = this.waiters.filter(w => {
                if (w.match(data)) {
                    w.resolve(data);
                    return false;
                }
                return true;
            });
        });
    }

    send(payload) {
        this.ws.send(JSON.stringify(payload));
    }

    waitFor(type, extraMatch = () => true) {
        const match = (m) => m.type === type && extraMatch(m);
        const existing = this.messages.find(match);
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            const waiter = { match, resolve };
            this.waiters.push(waiter);
            setTimeout(() => {
                this.waiters = this.waiters.filter(w => w !== waiter);
                reject(new Error(`${this.name}: timeout waiting for ${type}`));
            }, TIMEOUT);
        });
    }

    close() {
        try { this.ws.close(); } catch (e) { /* ignore */ }
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
    console.log(`\n🧪 GLM Quiz Pulse WS Tests\nBase: ${WS_URL}\n`);

    const host = new Client('host');
    await host.ready;
    host.send({ type: 'pulse_create' });
    const created = await host.waitFor('pulse_created');
    const pulseId = created.pulse_id;
    const hostToken = created.host_token;
    assert(!!pulseId && !!hostToken, 'Host receives pulse code and host_token');

    const player = new Client('player1');
    await player.ready;
    player.send({ type: 'pulse_join', pulse_id: pulseId });
    const joined = await player.waitFor('pulse_joined');
    const playerToken = joined.player_token;
    assert(!!playerToken && joined.player_count === 1, 'Player joins and receives identity token');

    host.send({ type: 'pulse_ask', pulse_id: pulseId, question_id: 1 });
    await host.waitFor('pulse_question');
    await player.waitFor('pulse_question');
    assert(true, 'Question broadcast to player');

    player.send({ type: 'pulse_answer', pulse_id: pulseId, answer: 1 });
    await player.waitFor('pulse_answer_ack');
    const count = await host.waitFor('pulse_answer_count');
    assert(count.answered === 1, `Host sees 1 answer (got ${count.answered})`);

    // Player disconnects: session must drop them from the active roster
    player.close();
    const left = await host.waitFor('pulse_player_left');
    assert(left.player_count === 0, `Player removed from pulse session on disconnect (count ${left.player_count})`);
    assert(left.answered === 1, 'Vote of the disconnected player is retained');

    // Re-join with the same identity must not allow a second vote
    const player1b = new Client('player1-rejoin');
    await player1b.ready;
    player1b.send({ type: 'pulse_join', pulse_id: pulseId, player_token: playerToken });
    const rejoined = await player1b.waitFor('pulse_joined');
    assert(rejoined.state === 'asking', 'Re-joined player gets current room state');
    const q = await player1b.waitFor('pulse_question');
    assert(q.already_answered === true, 'Re-joined player is marked as already answered');
    player1b.send({ type: 'pulse_answer', pulse_id: pulseId, answer: 2 });
    await sleep(600);

    host.send({ type: 'pulse_results', pulse_id: pulseId });
    const results = await host.waitFor('pulse_results');
    assert(results.total_answers === 1, `Double vote prevented after re-join (total ${results.total_answers})`);

    // Joining while results are shown must render results, not an empty wait screen
    const latecomer = new Client('latecomer');
    await latecomer.ready;
    latecomer.send({ type: 'pulse_join', pulse_id: pulseId });
    const lateJoined = await latecomer.waitFor('pulse_joined');
    assert(lateJoined.state === 'results', 'Late joiner is told the room is showing results');
    const lateResults = await latecomer.waitFor('pulse_results');
    assert(Array.isArray(lateResults.distribution) && lateResults.distribution.length === 4, 'Late joiner receives current distribution');

    // Host reconnect must reattach to the same code instead of orphaning the room
    host.close();
    await sleep(500);
    const hostB = new Client('host-reconnect');
    await hostB.ready;
    hostB.send({ type: 'pulse_reconnect_host', pulse_id: pulseId, host_token: hostToken });
    const reconnected = await hostB.waitFor('pulse_host_reconnected');
    assert(reconnected.pulse_id === pulseId, 'Host reconnects to the same pulse code');
    assert(reconnected.state === 'results' && Array.isArray(reconnected.distribution), 'Host reconnect restores room state');

    // Likert scale: player may overwrite a vote; aggregate exposes mean + histogram
    hostB.send({
        type: 'pulse_ask',
        pulse_id: pulseId,
        kind: 'scale',
        text: 'Насколько вы готовы?',
        scale_min: 1,
        scale_max: 5,
        label_min: 'Не готов',
        label_max: 'Готов'
    });
    const scaleQuestion = await player1b.waitFor('pulse_question', m => m.question?.kind === 'scale');
    assert(scaleQuestion.question.scale_min === 1 && scaleQuestion.question.scale_max === 5, 'Scale question includes range');
    player1b.send({ type: 'pulse_answer', pulse_id: pulseId, answer: 1 });
    await player1b.waitFor('pulse_answer_ack', m => m.answer === 1);
    player1b.send({ type: 'pulse_answer', pulse_id: pulseId, answer: 5 });
    await player1b.waitFor('pulse_answer_ack', m => m.answer === 5);
    hostB.send({ type: 'pulse_results', pulse_id: pulseId });
    const scaleResults = await hostB.waitFor('pulse_results', m => m.question?.kind === 'scale');
    assert(scaleResults.total_answers === 1, 'Scale overwrite retains one vote');
    assert(scaleResults.mean === 5 && scaleResults.distribution.length === 5, 'Scale returns mean and five-bin histogram');

    // Bad token must be rejected
    const impostor = new Client('impostor');
    await impostor.ready;
    impostor.send({ type: 'pulse_reconnect_host', pulse_id: pulseId, host_token: 'deadbeef' });
    const err = await impostor.waitFor('error');
    assert(err.code === 'pulse_forbidden', 'Host reconnect with wrong token rejected');

    const ghost = new Client('ghost');
    await ghost.ready;
    ghost.send({ type: 'pulse_join', pulse_id: 'ZZZZZZ' });
    const ghostErr = await ghost.waitFor('error');
    assert(ghostErr.code === 'pulse_not_found', 'Join of unknown pulse code rejected');

    [player1b, latecomer, hostB, impostor, ghost].forEach(c => c.close());

    console.log(`\n📊 Pulse WS results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Pulse WS test error:', err.message);
    process.exit(1);
});
