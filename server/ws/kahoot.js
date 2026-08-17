function register(context) {
    with (context) {
function createGame(ws, data) {
    cleanupGameSessions();
    const gameId = crypto.randomBytes(4).toString('hex').toUpperCase();
    const hostReconnectToken = crypto.randomBytes(16).toString('hex');
    const session = {
        id: gameId,
        host: ws,
        host_id: data.host_id,
        host_reconnect_token: hostReconnectToken,
        players: [],
        questions: [],
        currentQuestion: 0,
        state: 'waiting',
        created_at: Date.now(),
        questionStats: {}, // question_id -> { correct, total }
        scoring: data.scoring === 'accuracy' ? 'accuracy' : 'classic',
        teamsEnabled: true
    };

    gameSessions.set(gameId, session);
    playerConnections.set(ws, { game_id: gameId, is_host: true, reconnect_token: hostReconnectToken });

    ws.send(JSON.stringify({
        type: 'game_created',
        game_id: gameId,
        host_id: data.host_id,
        reconnect_token: hostReconnectToken,
        scoring: session.scoring
    }));
}

function reconnectHost(ws, data) {
    const { game_id, host_id, reconnect_token } = data;
    const session = gameSessions.get(game_id);

    if (!session) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Game session not found or expired'
        }));
        return;
    }

    // Verify host reconnect token to prevent session hijacking
    if (!host_id || !reconnect_token || session.host_id !== host_id || session.host_reconnect_token !== reconnect_token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid host reconnect credentials' }));
        return;
    }

    // Обновляем WebSocket подключение хоста
    const oldHostWs = session.host;
    session.host = ws;

    // Удаляем старое подключение из playerConnections если оно там было
    playerConnections.delete(oldHostWs);
    playerConnections.set(ws, { game_id, is_host: true, reconnect_token });

    ws.send(JSON.stringify({
        type: 'host_reconnected',
        game_id: game_id,
        state: session.state,
        current_question: session.currentQuestion,
        players: session.players.map(p => ({ name: p.name, score: p.score, team_name: p.team_name || '' })),
        scoring: session.scoring,
        question_count: session.questions.length
    }));

    // Уведомляем игроков о reconnect хоста
    broadcastToSession(game_id, {
        type: 'host_reconnected',
        message: 'Host reconnected'
    });
}

function joinGame(ws, data) {
    const { game_id, player_id: reconnect_id, reconnect_token } = data;
    let player_name = String(data.player_name || '').trim().replace(/<[^>]*>/g, '').slice(0, 30);
    if (!player_name) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid player name' }));
        return;
    }
    player_name = escapeHtml(player_name);
    let team_name = String(data.team_name || '').trim().replace(/<[^>]*>/g, '').slice(0, 40);
    team_name = team_name ? escapeHtml(team_name) : '';

    const session = gameSessions.get(game_id);

    if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
        return;
    }

    // Проверка на reconnect существующего игрока
    let player;
    if (reconnect_id) {
        player = session.players.find(p => p.id === reconnect_id && p.name === player_name);
        if (player) {
            // Verify reconnect token to prevent session hijacking
            if (!reconnect_token || player.reconnect_token !== reconnect_token) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid reconnect token' }));
                return;
            }

            // Обновляем WebSocket подключение
            const oldWs = player.ws;
            player.ws = ws;
            player.disconnected = false;
            if (player.disconnectTimeout) {
                clearTimeout(player.disconnectTimeout);
                player.disconnectTimeout = null;
            }
            if (team_name) player.team_name = team_name;
            playerConnections.delete(oldWs);
            playerConnections.set(ws, { game_id, player_id: player.id });

            ws.send(JSON.stringify({
                type: 'reconnected',
                game_id: game_id,
                player_id: player.id,
                score: player.score,
                answers: player.answers,
                team_name: player.team_name || '',
                current_question: session.currentQuestion,
                state: session.state
            }));

            // Если игра активна, отправляем текущий вопрос
            if (session.state === 'active' && session.questions[session.currentQuestion]) {
                const question = session.questions[session.currentQuestion];
                ws.send(JSON.stringify({
                    type: 'new_question',
                    question_number: session.currentQuestion + 1,
                    question: {
                        id: question.id,
                        text: question.question,
                        options: [question.option_a, question.option_b, question.option_c, question.option_d]
                    },
                    time_limit: 30,
                    is_reconnect: true
                }));
            }

            return;
        }
    }

    // Новые игроки могут присоединиться только в режиме waiting
    if (session.state !== 'waiting') {
        ws.send(JSON.stringify({ type: 'error', message: 'Game already started - cannot join' }));
        return;
    }

    // Создаем нового игрока
    player = {
        id: crypto.randomBytes(8).toString('hex'),
        reconnect_token: crypto.randomBytes(16).toString('hex'),
        name: player_name,
        team_name: team_name,
        ws: ws,
        score: 0,
        answers: []
    };

    session.players.push(player);
    playerConnections.set(ws, { game_id, player_id: player.id });

    ws.send(JSON.stringify({
        type: 'joined',
        game_id: game_id,
        player_id: player.id,
        reconnect_token: player.reconnect_token,
        team_name: team_name,
        player_count: session.players.length
    }));

    broadcastToSession(game_id, {
        type: 'player_joined',
        player: { name: player_name, team_name },
        player_count: session.players.length
    });
}

function startGame(ws, data) {
    const { game_id } = data;
    const session = gameSessions.get(game_id);

    if (!session) return;
    if (session.host !== ws) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not the host' }));
        return;
    }

    const { getPack, kahootRowsFromPack, seminarCategoryFilter } = require('../seminar-packs');
    let questions = [];
    const pack = getPack(data.pack_id);
    const requestedIds = Array.isArray(data.question_ids)
        ? data.question_ids.filter((id) => Number.isInteger(id)).slice(0, 20)
        : [];

    if (pack && pack.kahoot && pack.kahoot.length) {
        questions = kahootRowsFromPack(pack);
    } else if (requestedIds.length) {
        const placeholders = requestedIds.map(() => '?').join(',');
        const rows = db.prepare(`
            SELECT id, question_text as question, option_a, option_b, option_c, option_d,
                   correct_answer, category
            FROM default_questions
            WHERE id IN (${placeholders})
        `).all(...requestedIds);
        const byId = new Map(rows.map((row) => [row.id, row]));
        questions = requestedIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
        // Load questions (BUG-11 fix: honour requested question_count, clamped 1-84)
        const requestedCount = Number(data.question_count);
        const questionCount = Number.isInteger(requestedCount) && requestedCount > 0
            ? Math.min(requestedCount, 84)
            : 10;
        const core = seminarCategoryFilter();
        questions = db.prepare(`
            SELECT id, question_text as question, option_a, option_b, option_c, option_d,
                   correct_answer, category
            FROM default_questions
            WHERE ${core.sql}
            ORDER BY RANDOM()
            LIMIT ?
        `).all(...core.params, questionCount);
    }

    if (!questions.length) {
        ws.send(JSON.stringify({ type: 'error', message: 'No questions for this game' }));
        return;
    }

    session.questions = questions;
    session.currentQuestion = 0;
    session.state = 'active';
    session.pack_id = pack ? pack.id : null;

    broadcastToSession(game_id, {
        type: 'game_starting',
        question_count: questions.length,
        pack_id: session.pack_id
    });

    // Send first question after delay
    setTimeout(() => sendQuestion(game_id), 3000);
}

function sendQuestion(game_id) {
    const session = gameSessions.get(game_id);
    if (!session || session.currentQuestion >= session.questions.length) {
        endGame(game_id);
        return;
    }

    const question = session.questions[session.currentQuestion];
    const timeLimit = 30; // 30 seconds per question

    broadcastToSession(game_id, {
        type: 'new_question',
        question_number: session.currentQuestion + 1,
        question: {
            id: question.id,
            text: question.question,
            options: [question.option_a, question.option_b, question.option_c, question.option_d]
        },
        time_limit: timeLimit
    });

    // Timer for question end
    session.questionTimer = setTimeout(() => {
        revealAnswer(game_id);
    }, timeLimit * 1000);

    session.questionStartTime = Date.now();
}

function submitAnswer(ws, data) {
    const { game_id, player_id, answer } = data;
    const session = gameSessions.get(game_id);
    if (!session) return;

    const player = session.players.find(p => p.id === player_id);
    if (!player) return;

    // Защита от дублей - проверяем, отвечал ли уже игрок на этот вопрос
    if (player.answers.length > session.currentQuestion) {
        return; // Игрок уже ответил, игнорируем повторный ответ
    }

    const question = session.questions[session.currentQuestion];
    const isCorrect = answer === question.correct_answer;
    const timeTaken = (Date.now() - session.questionStartTime) / 1000;
    const timeBonus = Math.max(0, Math.round((30 - timeTaken) * 10));
    const points = isCorrect ? (session.scoring === 'accuracy' ? 1000 : 1000 + timeBonus) : 0;

    player.score += points;
    player.answers.push({
        question_id: question.id,
        answer,
        is_correct: isCorrect,
        time_taken: timeTaken,
        points
    });

    // Track session question difficulty for host panel
    if (!session.questionStats) session.questionStats = {};
    if (!session.questionStats[question.id]) {
        session.questionStats[question.id] = { correct: 0, total: 0, text: question.question };
    }
    session.questionStats[question.id].total++;
    if (isCorrect) session.questionStats[question.id].correct++;

    ws.send(JSON.stringify({
        type: 'answer_result',
        is_correct: isCorrect,
        points: points
    }));

    // Check if all players answered
    const answeredCount = session.players.filter(p =>
        p.answers.length > session.currentQuestion
    ).length;

    if (answeredCount === session.players.length) {
        clearTimeout(session.questionTimer);
        revealAnswer(game_id);
    }
}

function revealAnswer(game_id) {
    const session = gameSessions.get(game_id);
    if (!session) return;

    const question = session.questions[session.currentQuestion];
    const leaderboard = session.players
        .map(p => ({ name: p.name, score: p.score, team_name: p.team_name || '' }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    // Team leaderboard: sum scores by team_name
    const teamMap = {};
    session.players.forEach(p => {
        const team = p.team_name || 'Без команды';
        if (!teamMap[team]) teamMap[team] = 0;
        teamMap[team] += p.score;
    });
    const team_leaderboard = Object.entries(teamMap)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score);

    // Hard questions in this session (lowest accuracy with answers)
    const hard_questions = Object.entries(session.questionStats || {})
        .map(([id, s]) => ({
            question_id: Number(id),
            text: s.text,
            accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
            total: s.total
        }))
        .filter(q => q.total > 0)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5);

    // Players: reveal leaderboard only — never expose the correct answer
    const playerPayload = JSON.stringify({ type: 'answer_reveal', leaderboard, team_leaderboard });
    session.players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(playerPayload);
            } catch (e) {
                // Ignore send errors for dead sockets
            }
        }
    });

    // Host: reveal correct answer alongside leaderboard + hard questions
    if (session.host && session.host.readyState === WebSocket.OPEN) {
        try {
            session.host.send(JSON.stringify({
                type: 'answer_reveal',
                correct_answer: question.correct_answer,
                leaderboard,
                team_leaderboard,
                hard_questions,
                is_host: true
            }));
        } catch (e) {
            // Ignore send errors for dead sockets
        }
    }

    // Next question after delay
    setTimeout(() => {
        session.currentQuestion++;
        sendQuestion(game_id);
    }, 5000);
}

function nextQuestion(ws, data) {
    const { game_id } = data;
    const session = gameSessions.get(game_id);
    if (!session) return;
    if (session.host !== ws) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Only the host can advance questions' }));
    }

    if (session.currentQuestion >= session.questions.length - 1) {
        endGame(game_id);
    } else {
        session.currentQuestion++;
        sendQuestion(game_id);
    }
}

function endGame(game_id) {
    const session = gameSessions.get(game_id);
    if (!session) return;

    session.state = 'finished';
    session.finished_at = Date.now();

    const leaderboard = session.players
        .map(p => ({ name: p.name, score: p.score, team_name: p.team_name || '' }))
        .sort((a, b) => b.score - a.score);

    const teamMap = {};
    session.players.forEach(p => {
        const team = p.team_name || 'Без команды';
        if (!teamMap[team]) teamMap[team] = 0;
        teamMap[team] += p.score;
    });
    const team_leaderboard = Object.entries(teamMap)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score);

    const hard_questions = Object.entries(session.questionStats || {})
        .map(([id, s]) => ({
            question_id: Number(id),
            text: s.text,
            accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
            total: s.total
        }))
        .filter(q => q.total > 0)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5);

    broadcastToSession(game_id, {
        type: 'game_ended',
        leaderboard,
        team_leaderboard,
        hard_questions
    });

    // Note: Kahoot mode uses anonymous players (WebSocket IDs), not registered users.
    // Certificates are intentionally NOT generated here to avoid broken certificate records.
    // Players can earn certificates through the main quiz flow at index.html.
    // Finished sessions are cleaned up periodically by cleanupGameSessions().
}

function getResults(ws, data) {
    const { game_id } = data;
    const session = gameSessions.get(game_id);
    if (!session) return;

    ws.send(JSON.stringify({
        type: 'results',
        leaderboard: session.players.map(p => ({ name: p.name, score: p.score, team_name: p.team_name || '', correct: p.answers.filter(a => a.is_correct).length }))
    }));
}

function broadcastToSession(gameId, message) {
    const session = gameSessions.get(gameId);
    if (!session) return;

    const payload = JSON.stringify(message);
    session.players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(payload);
            } catch (e) {
                // Ignore send errors for dead sockets
            }
        }
    });

    if (session.host && session.host.readyState === WebSocket.OPEN) {
        try {
            session.host.send(JSON.stringify({ ...message, is_host: true }));
        } catch (e) {
            // Ignore send errors for dead sockets
        }
    }
}


        Object.assign(context, { createGame, reconnectHost, joinGame, startGame, sendQuestion, submitAnswer, revealAnswer, nextQuestion, endGame, getResults, broadcastToSession });
    }
}

module.exports = register;
