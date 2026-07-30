function register(context) {
    with (context) {
// ========== MODERATED LIVE Q&A ==========

function qaQuestionPayload(question) {
    return {
        id: question.id,
        text: question.text,
        status: question.status,
        votes: question.voters.size,
        highlighted: !!question.highlighted,
        created_at: question.created_at
    };
}

function qaSortedQuestions(session, includePending = false) {
    return session.questions
        .filter(q => includePending || q.status === 'approved')
        .sort((a, b) => (b.voters.size - a.voters.size) || (a.created_at - b.created_at))
        .map(qaQuestionPayload);
}

function qaSend(ws, payload) {
    pulseSend(ws, payload);
}

function qaBroadcastAudience(session) {
    const payload = JSON.stringify({
        type: 'qa_state',
        questions: qaSortedQuestions(session, false),
        highlighted_id: session.highlighted_id,
        closed: session.closed
    });
    session.players.forEach((_, playerWs) => {
        if (playerWs.readyState === WebSocket.OPEN) {
            try { playerWs.send(payload); } catch (e) { /* ignore */ }
        }
    });
}

function qaNotifyHost(session) {
    if (!session.hostDisconnected) {
        qaSend(session.host, {
            type: 'qa_host_state',
            qa_id: session.id,
            questions: qaSortedQuestions(session, true),
            player_count: session.players.size,
            highlighted_id: session.highlighted_id,
            closed: session.closed
        });
    }
}

function qaCreate(ws) {
    cleanupQaSessions();
    const qaId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const hostToken = crypto.randomBytes(16).toString('hex');
    const session = {
        id: qaId,
        host: ws,
        host_token: hostToken,
        hostDisconnected: false,
        hostDisconnectTimeout: null,
        players: new Map(),
        playersByToken: new Map(),
        questions: [],
        highlighted_id: null,
        closed: false,
        created_at: Date.now()
    };
    qaSessions.set(qaId, session);
    db.prepare('INSERT INTO qa_sessions (id) VALUES (?)').run(qaId);
    qaSend(ws, { type: 'qa_created', qa_id: qaId, host_token: hostToken });
}

function qaReconnectHost(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    if (!session) return qaSend(ws, { type: 'error', code: 'qa_not_found', message: 'Q&A session not found' });
    if (!data.host_token || data.host_token !== session.host_token) {
        return qaSend(ws, { type: 'error', code: 'qa_forbidden', message: 'Invalid Q&A host token' });
    }
    session.host = ws;
    session.hostDisconnected = false;
    if (session.hostDisconnectTimeout) clearTimeout(session.hostDisconnectTimeout);
    session.hostDisconnectTimeout = null;
    qaSend(ws, { type: 'qa_host_reconnected', qa_id: qaId, host_token: session.host_token });
    qaNotifyHost(session);
}

function qaJoin(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    if (!session) return qaSend(ws, { type: 'error', code: 'qa_not_found', message: 'Q&A session not found' });
    const requestedToken = normalizePlayerToken(data.player_token);
    let player = requestedToken ? session.playersByToken.get(requestedToken) : null;
    if (!player) {
        const token = requestedToken || crypto.randomBytes(16).toString('hex');
        player = { token, ws, submitTimes: [] };
        session.playersByToken.set(token, player);
    } else {
        if (player.ws && player.ws !== ws) session.players.delete(player.ws);
        player.ws = ws;
    }
    session.players.set(ws, player);
    qaSend(ws, { type: 'qa_joined', qa_id: qaId, player_token: player.token, closed: session.closed });
    qaSend(ws, { type: 'qa_state', questions: qaSortedQuestions(session, false), highlighted_id: session.highlighted_id, closed: session.closed });
    qaNotifyHost(session);
}

function qaSubmit(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    const player = session?.players.get(ws);
    if (!session || !player || session.closed) return;
    const now = Date.now();
    player.submitTimes = player.submitTimes.filter(ts => now - ts < 60000);
    if (player.submitTimes.length >= 3) {
        return qaSend(ws, { type: 'error', code: 'qa_rate_limited', message: 'Не более 3 вопросов в минуту' });
    }
    const rawText = String(data.text || '').trim();
    if (!rawText || rawText.length > 200) {
        return qaSend(ws, { type: 'error', code: 'qa_invalid_text', message: 'Вопрос должен содержать от 1 до 200 символов' });
    }
    player.submitTimes.push(now);
    const question = {
        id: crypto.randomBytes(8).toString('hex'),
        text: escapeHtml(rawText),
        status: 'pending',
        voters: new Set(),
        highlighted: false,
        created_at: now
    };
    session.questions.push(question);
    db.prepare('INSERT INTO qa_questions (id, session_id, text) VALUES (?, ?, ?)').run(question.id, qaId, question.text);
    qaSend(ws, { type: 'qa_submit_ack', question_id: question.id });
    qaNotifyHost(session);
}

function qaUpvote(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    const player = session?.players.get(ws);
    const question = session?.questions.find(q => q.id === data.question_id);
    if (!session || !player || !question || question.status !== 'approved' || session.closed) return;
    if (question.voters.has(player.token)) {
        return qaSend(ws, { type: 'qa_upvote_ack', question_id: question.id, votes: question.voters.size, already_voted: true });
    }
    question.voters.add(player.token);
    db.prepare('UPDATE qa_questions SET votes = ? WHERE id = ?').run(question.voters.size, question.id);
    qaSend(ws, { type: 'qa_upvote_ack', question_id: question.id, votes: question.voters.size });
    qaBroadcastAudience(session);
    qaNotifyHost(session);
}

function qaApprove(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    if (!session || session.host !== ws || session.closed) return;
    const question = session.questions.find(q => q.id === data.question_id);
    if (!question) return;
    question.status = data.approved === false ? 'pending' : 'approved';
    if (question.status !== 'approved' && session.highlighted_id === question.id) {
        session.highlighted_id = null;
        question.highlighted = false;
    }
    db.prepare('UPDATE qa_questions SET status = ?, highlighted = ? WHERE id = ?').run(question.status, question.highlighted ? 1 : 0, question.id);
    qaBroadcastAudience(session);
    qaNotifyHost(session);
}

function qaHighlight(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    if (!session || session.host !== ws || session.closed) return;
    const question = data.question_id ? session.questions.find(q => q.id === data.question_id && q.status === 'approved') : null;
    session.questions.forEach(q => { q.highlighted = !!question && q.id === question.id; });
    session.highlighted_id = question?.id || null;
    db.prepare('UPDATE qa_questions SET highlighted = 0 WHERE session_id = ?').run(qaId);
    if (question) db.prepare('UPDATE qa_questions SET highlighted = 1 WHERE id = ?').run(question.id);
    qaBroadcastAudience(session);
    qaNotifyHost(session);
}

function qaClose(ws, data) {
    const qaId = String(data.qa_id || '').trim().toUpperCase();
    const session = qaSessions.get(qaId);
    if (!session || session.host !== ws) return;
    endQaSession(qaId, 'closed');
}

function endQaSession(qaId, reason) {
    const session = qaSessions.get(qaId);
    if (!session) return;
    session.closed = true;
    const closedPayload = { type: 'qa_closed', reason: reason || 'closed' };
    const payload = JSON.stringify(closedPayload);
    qaSend(session.host, closedPayload);
    session.players.forEach((_, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(payload); } catch (e) { /* ignore */ }
        }
    });
    db.prepare('UPDATE qa_sessions SET closed_at = CURRENT_TIMESTAMP WHERE id = ?').run(qaId);
    if (session.hostDisconnectTimeout) clearTimeout(session.hostDisconnectTimeout);
    qaSessions.delete(qaId);
}

function handleQaDisconnect(ws) {
    for (const [qaId, session] of qaSessions) {
        const player = session.players.get(ws);
        if (player) {
            session.players.delete(ws);
            player.ws = null;
            qaNotifyHost(session);
        }
        if (session.host === ws) {
            session.host = null;
            session.hostDisconnected = true;
            if (session.hostDisconnectTimeout) clearTimeout(session.hostDisconnectTimeout);
            session.hostDisconnectTimeout = setTimeout(() => {
                if (session.hostDisconnected) endQaSession(qaId, 'host_left');
            }, QA_HOST_GRACE);
        }
    }
}

        Object.assign(context, { qaQuestionPayload, qaSortedQuestions, qaSend, qaBroadcastAudience, qaNotifyHost, qaCreate, qaReconnectHost, qaJoin, qaSubmit, qaUpvote, qaApprove, qaHighlight, qaClose, endQaSession, handleQaDisconnect });
    }
}

module.exports = register;
