function register(context) {
    with (context) {
// ========== PULSE MODE (anonymous live poll) ==========

function pulseSend(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(payload)); } catch (e) { /* ignore dead socket */ }
    }
}

function pulseBroadcastToPlayers(session, payload) {
    const json = JSON.stringify(payload);
    session.players.forEach((_, pws) => {
        if (pws.readyState === WebSocket.OPEN) {
            try { pws.send(json); } catch (e) { /* ignore */ }
        }
    });
}

function pulseNotifyHost(session, payload) {
    if (!session.hostDisconnected) pulseSend(session.host, payload);
}

function pulseAnsweredCount(session) {
    let count = 0;
    session.playersByToken.forEach(p => { if (p.answered) count++; });
    return count;
}

function pulseDistribution(session) {
    const isScale = session.question?.kind === 'scale';
    const min = isScale ? session.question.scale_min : 0;
    const max = isScale ? session.question.scale_max : 3;
    const counts = Array.from({ length: max - min + 1 }, () => 0);
    let answered = 0;
    let sum = 0;
    session.playersByToken.forEach(p => {
        if (p.answered && p.answer >= min && p.answer <= max) {
            counts[p.answer - min]++;
            answered++;
            sum += p.answer;
        }
    });
    const total = answered || 1;
    return {
        distribution: counts.map((c, i) => ({
            index: min + i,
            count: c,
            percent: Math.round((c / total) * 100)
        })),
        total_answers: answered,
        mean: isScale && answered ? Math.round(sum * 100 / answered) / 100 : null
    };
}

function endPulseSession(pulseId, reason) {
    const session = pulseSessions.get(pulseId);
    if (!session) return;
    if (session.hostDisconnectTimeout) {
        clearTimeout(session.hostDisconnectTimeout);
        session.hostDisconnectTimeout = null;
    }
    pulseBroadcastToPlayers(session, { type: 'pulse_ended', reason: reason || 'ended' });
    pulseSessions.delete(pulseId);
}

function pulseCreate(ws, data) {
    cleanupPulseSessions();
    const pulseId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const hostToken = crypto.randomBytes(16).toString('hex');
    const session = {
        id: pulseId,
        host: ws,
        host_token: hostToken,
        hostDisconnected: false,
        hostDisconnectTimeout: null,
        players: new Map(),        // ws -> player (connected only)
        playersByToken: new Map(), // token -> player (survives reconnects)
        question: null,
        state: 'waiting',
        created_at: Date.now()
    };
    pulseSessions.set(pulseId, session);
    pulseSend(ws, { type: 'pulse_created', pulse_id: pulseId, host_token: hostToken });
}

function pulseReconnectHost(ws, data) {
    const pulse_id = String(data.pulse_id || '').toUpperCase();
    const session = pulseSessions.get(pulse_id);
    if (!session) {
        pulseSend(ws, { type: 'error', code: 'pulse_not_found', message: 'Pulse not found' });
        return;
    }
    if (!data.host_token || data.host_token !== session.host_token) {
        pulseSend(ws, { type: 'error', code: 'pulse_forbidden', message: 'Invalid pulse host token' });
        return;
    }

    session.host = ws;
    session.hostDisconnected = false;
    if (session.hostDisconnectTimeout) {
        clearTimeout(session.hostDisconnectTimeout);
        session.hostDisconnectTimeout = null;
    }

    pulseSend(ws, {
        type: 'pulse_host_reconnected',
        pulse_id,
        host_token: session.host_token,
        state: session.state,
        question: session.question,
        player_count: session.players.size,
        answered: pulseAnsweredCount(session),
        ...(session.state === 'results' ? pulseDistribution(session) : {})
    });
    pulseBroadcastToPlayers(session, { type: 'pulse_host_back' });
}

function normalizePlayerToken(token) {
    if (typeof token !== 'string') return null;
    return /^[a-f0-9]{8,64}$/i.test(token) ? token.toLowerCase() : null;
}

function pulseJoin(ws, data) {
    const pulse_id = String(data.pulse_id || '').toUpperCase();
    const session = pulseSessions.get(pulse_id);
    if (!session) {
        pulseSend(ws, { type: 'error', code: 'pulse_not_found', message: 'Pulse not found' });
        return;
    }

    // Reuse identity on re-join so a reconnecting player cannot vote twice
    const requestedToken = normalizePlayerToken(data.player_token);
    let player = requestedToken ? session.playersByToken.get(requestedToken) : null;

    if (player) {
        if (player.ws && player.ws !== ws) session.players.delete(player.ws);
        player.ws = ws;
        player.disconnected = false;
        player.disconnected_at = null;
    } else {
        const token = requestedToken || crypto.randomBytes(16).toString('hex');
        player = { id: crypto.randomBytes(4).toString('hex'), token, ws, answered: false, answer: null, disconnected: false };
        session.playersByToken.set(token, player);
    }
    session.players.set(ws, player);

    pulseSend(ws, {
        type: 'pulse_joined',
        pulse_id,
        player_token: player.token,
        player_count: session.players.size,
        state: session.state,
        has_question: !!session.question
    });

    pulseNotifyHost(session, {
        type: 'pulse_player_joined',
        player_count: session.players.size,
        answered: pulseAnsweredCount(session)
    });

    // Bring the joining player to the current state of the room
    if (session.state === 'asking' && session.question) {
        pulseSend(ws, {
            type: 'pulse_question',
            question: session.question,
            already_answered: !!player.answered,
            answer: player.answer
        });
    } else if (session.state === 'results' && session.question) {
        pulseSend(ws, {
            type: 'pulse_results',
            question: session.question,
            ...pulseDistribution(session)
        });
    }
}

function pulseAsk(ws, data) {
    const pulse_id = String(data.pulse_id || '').toUpperCase();
    const session = pulseSessions.get(pulse_id);
    if (!session || session.host !== ws) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not the pulse host' }));
        return;
    }
    const kind = data.kind === 'scale' ? 'scale' : 'mc';
    if (kind === 'scale') {
        const text = String(data.text || '').trim().slice(0, 200);
        const scaleMin = Number.isInteger(data.scale_min) ? data.scale_min : 1;
        const scaleMax = Number.isInteger(data.scale_max) ? data.scale_max : 5;
        if (!text || scaleMin < 0 || scaleMax > 10 || scaleMax <= scaleMin || scaleMax - scaleMin > 9) {
            pulseSend(ws, { type: 'error', message: 'Invalid scale question' });
            return;
        }
        session.question = {
            id: `scale_${Date.now()}`,
            kind: 'scale',
            text: escapeHtml(text),
            scale_min: scaleMin,
            scale_max: scaleMax,
            label_min: escapeHtml(String(data.label_min || '').trim().slice(0, 40)),
            label_max: escapeHtml(String(data.label_max || '').trim().slice(0, 40))
        };
    } else {
        const questionId = typeof data.question_id === 'number' ? data.question_id : null;
    let question;
    if (questionId) {
        question = db.prepare(`
            SELECT id, question_text as text, option_a, option_b, option_c, option_d
            FROM default_questions WHERE id = ?
        `).get(questionId);
    } else {
        question = db.prepare(`
            SELECT id, question_text as text, option_a, option_b, option_c, option_d
            FROM default_questions ORDER BY RANDOM() LIMIT 1
        `).get();
    }
    if (!question) {
        ws.send(JSON.stringify({ type: 'error', message: 'Question not found' }));
        return;
    }
    session.question = {
        id: question.id,
        kind: 'mc',
        text: question.text,
        options: [question.option_a, question.option_b, question.option_c, question.option_d]
    };
    }
    // New round: everyone (including players who left) may answer again
    session.playersByToken.forEach(p => { p.answered = false; p.answer = null; });
    session.state = 'asking';
    pulseBroadcastToPlayers(session, { type: 'pulse_question', question: session.question });
    pulseSend(ws, { type: 'pulse_question', question: session.question, is_host: true });
}

function pulseAnswer(ws, data) {
    const pulse_id = String(data.pulse_id || '').toUpperCase();
    const session = pulseSessions.get(pulse_id);
    if (!session || session.state !== 'asking') return;
    const player = session.players.get(ws);
    if (!player) return;
    const answer = typeof data.answer === 'number' ? data.answer : -1;
    const isScale = session.question?.kind === 'scale';
    if (player.answered && !isScale) return;
    const min = isScale ? session.question.scale_min : 0;
    const max = isScale ? session.question.scale_max : 3;
    if (!Number.isInteger(answer) || answer < min || answer > max) return;
    player.answered = true;
    player.answer = answer;
    pulseSend(ws, { type: 'pulse_answer_ack', answer, overwritten: isScale });
    pulseNotifyHost(session, {
        type: 'pulse_answer_count',
        answered: pulseAnsweredCount(session),
        player_count: session.players.size
    });
}

function pulseSendResults(ws, data) {
    const pulse_id = String(data.pulse_id || '').toUpperCase();
    const session = pulseSessions.get(pulse_id);
    if (!session || session.host !== ws) {
        pulseSend(ws, { type: 'error', message: 'Not the pulse host' });
        return;
    }
    session.state = 'results';
    const payload = {
        type: 'pulse_results',
        question: session.question,
        ...pulseDistribution(session)
    };
    pulseBroadcastToPlayers(session, payload);
    pulseSend(ws, { ...payload, is_host: true });
}


        Object.assign(context, { pulseSend, pulseBroadcastToPlayers, pulseNotifyHost, pulseAnsweredCount, pulseDistribution, endPulseSession, pulseCreate, pulseReconnectHost, normalizePlayerToken, pulseJoin, pulseAsk, pulseAnswer, pulseSendResults });
    }
}

module.exports = register;
