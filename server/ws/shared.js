function register(context) {
    with (context) {
const wss = new WebSocket.Server({
    server,
    maxPayload: 65536,
    verifyClient: (info, cb) => {
        if (!isProductionVPS) return cb(true);
        const origin = info.origin || info.req.headers.origin;
        if (!origin || allowedOrigins.includes(origin)) return cb(true);
        cb(false, 403, 'Forbidden origin');
    }
});

// Store active game sessions
const gameSessions = new Map();
const playerConnections = new Map();
const pulseSessions = new Map(); // pulse_id -> pulse session
const qaSessions = new Map(); // qa_id -> moderated Q&A session
const MAX_GAME_SESSIONS = 100;
const GAME_SESSION_FINISHED_TTL = 2 * 60 * 1000; // 2 minutes
const GAME_SESSION_MAX_TTL = 3 * 60 * 60 * 1000; // 3 hours
const MAX_PULSE_SESSIONS = 50;
const PULSE_SESSION_MAX_TTL = 3 * 60 * 60 * 1000; // 3 hours
const PULSE_HOST_GRACE = 5 * 60 * 1000; // 5 minutes for host reconnect
const PULSE_PLAYER_RETENTION = 30 * 60 * 1000; // keep identity of left players 30 min
const MAX_QA_SESSIONS = 50;
const QA_SESSION_MAX_TTL = 3 * 60 * 60 * 1000;
const QA_HOST_GRACE = 5 * 60 * 1000;

function cleanupGameSessions() {
    const now = Date.now();
    // First pass: remove expired sessions
    for (const [gameId, session] of gameSessions) {
        if (session.state === 'finished' && (now - session.finished_at > GAME_SESSION_FINISHED_TTL)) {
            gameSessions.delete(gameId);
        } else if (now - session.created_at > GAME_SESSION_MAX_TTL) {
            gameSessions.delete(gameId);
        }
    }
    // Second pass: if still over limit, remove oldest by creation time
    if (gameSessions.size > MAX_GAME_SESSIONS) {
        const sessions = Array.from(gameSessions.entries()).sort((a, b) => a[1].created_at - b[1].created_at);
        const toRemove = gameSessions.size - MAX_GAME_SESSIONS;
        for (let i = 0; i < toRemove; i++) {
            gameSessions.delete(sessions[i][0]);
        }
    }
}

function cleanupPulseSessions() {
    const now = Date.now();
    for (const [pulseId, session] of pulseSessions) {
        if (now - session.created_at > PULSE_SESSION_MAX_TTL) {
            endPulseSession(pulseId, 'expired');
            continue;
        }
        // Drop identities of players who left long ago
        for (const [token, player] of session.playersByToken) {
            if (player.disconnected && player.disconnected_at && (now - player.disconnected_at > PULSE_PLAYER_RETENTION)) {
                session.playersByToken.delete(token);
            }
        }
    }
    if (pulseSessions.size > MAX_PULSE_SESSIONS) {
        const sessions = Array.from(pulseSessions.entries()).sort((a, b) => a[1].created_at - b[1].created_at);
        const toRemove = pulseSessions.size - MAX_PULSE_SESSIONS;
        for (let i = 0; i < toRemove; i++) {
            endPulseSession(sessions[i][0], 'evicted');
        }
    }
}

function cleanupQaSessions() {
    const now = Date.now();
    for (const [qaId, session] of qaSessions) {
        if (now - session.created_at > QA_SESSION_MAX_TTL) endQaSession(qaId, 'expired');
    }
    if (qaSessions.size > MAX_QA_SESSIONS) {
        const oldest = Array.from(qaSessions.entries()).sort((a, b) => a[1].created_at - b[1].created_at);
        oldest.slice(0, qaSessions.size - MAX_QA_SESSIONS).forEach(([qaId]) => endQaSession(qaId, 'evicted'));
    }
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!data || typeof data.type !== 'string') return;
            handleWebSocketMessage(ws, data);
        } catch (error) {
            // Silently ignore malformed messages in production
        }
    });

    ws.on('close', () => {
        // Handle disconnect with grace period for reconnect
        for (const [sessionId, session] of gameSessions) {
            const player = session.players.find(p => p.ws === ws);
            if (player) {
                player.disconnected = true;
                // Clear any existing timeout to avoid multiple timeouts on repeated disconnects
                if (player.disconnectTimeout) {
                    clearTimeout(player.disconnectTimeout);
                }
                player.disconnectTimeout = setTimeout(() => {
                    // Only remove if player didn't reconnect
                    if (player.disconnected) {
                        const playerIndex = session.players.indexOf(player);
                        if (playerIndex !== -1) {
                            session.players.splice(playerIndex, 1);
                            broadcastToSession(sessionId, {
                                type: 'player_left',
                                player_count: session.players.length
                            });
                        }
                    }
                    player.disconnectTimeout = null;
                }, 30000); // 30 seconds grace period
            }

            // Clean up host reference if host disconnects without reconnect
            if (session.host === ws) {
                session.hostDisconnected = true;
                if (session.hostDisconnectTimeout) {
                    clearTimeout(session.hostDisconnectTimeout);
                }
                session.hostDisconnectTimeout = setTimeout(() => {
                    if (session.hostDisconnected) {
                        gameSessions.delete(sessionId);
                    }
                    session.hostDisconnectTimeout = null;
                }, 300000); // 5 minutes grace period for host
            }
        }

        handlePulseDisconnect(ws);
        handleQaDisconnect(ws);
    });
});

function handlePulseDisconnect(ws) {
    for (const [pulseId, session] of pulseSessions) {
        const player = session.players.get(ws);
        if (player) {
            session.players.delete(ws);
            // Keep the token identity so a re-join cannot vote twice in this round
            player.ws = null;
            player.disconnected = true;
            player.disconnected_at = Date.now();
            pulseNotifyHost(session, {
                type: 'pulse_player_left',
                player_count: session.players.size,
                answered: pulseAnsweredCount(session)
            });
        }

        if (session.host === ws) {
            session.hostDisconnected = true;
            session.host = null;
            pulseBroadcastToPlayers(session, { type: 'pulse_host_disconnected' });
            if (session.hostDisconnectTimeout) {
                clearTimeout(session.hostDisconnectTimeout);
            }
            session.hostDisconnectTimeout = setTimeout(() => {
                session.hostDisconnectTimeout = null;
                if (session.hostDisconnected) {
                    endPulseSession(pulseId, 'host_left');
                }
            }, PULSE_HOST_GRACE);
        }
    }
}

// Heartbeat: terminate dead connections
const HEARTBEAT_INTERVAL = 30000;
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });

    // Clean up expired game sessions
    cleanupGameSessions();
    cleanupPulseSessions();
    cleanupQaSessions();
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

function handleWebSocketMessage(ws, data) {
    switch (data.type) {
        case 'create_game':
            createGame(ws, data);
            break;
        case 'reconnect_host':
            reconnectHost(ws, data);
            break;
        case 'join_game':
            joinGame(ws, data);
            break;
        case 'start_game':
            startGame(ws, data);
            break;
        case 'submit_answer':
            submitAnswer(ws, data);
            break;
        case 'next_question':
            nextQuestion(ws, data);
            break;
        case 'get_results':
            getResults(ws, data);
            break;
        case 'pulse_create':
            pulseCreate(ws, data);
            break;
        case 'pulse_reconnect_host':
            pulseReconnectHost(ws, data);
            break;
        case 'pulse_join':
            pulseJoin(ws, data);
            break;
        case 'pulse_ask':
            pulseAsk(ws, data);
            break;
        case 'pulse_answer':
            pulseAnswer(ws, data);
            break;
        case 'pulse_results':
            pulseSendResults(ws, data);
            break;
        case 'qa_create':
            qaCreate(ws);
            break;
        case 'qa_reconnect_host':
            qaReconnectHost(ws, data);
            break;
        case 'qa_join':
            qaJoin(ws, data);
            break;
        case 'qa_submit':
            qaSubmit(ws, data);
            break;
        case 'qa_upvote':
            qaUpvote(ws, data);
            break;
        case 'qa_approve':
            qaApprove(ws, data);
            break;
        case 'qa_highlight':
            qaHighlight(ws, data);
            break;
        case 'qa_close':
            qaClose(ws, data);
            break;
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
    }
}


        Object.assign(context, { wss, gameSessions, playerConnections, pulseSessions, qaSessions, MAX_GAME_SESSIONS, GAME_SESSION_FINISHED_TTL, GAME_SESSION_MAX_TTL, MAX_PULSE_SESSIONS, PULSE_SESSION_MAX_TTL, PULSE_HOST_GRACE, PULSE_PLAYER_RETENTION, MAX_QA_SESSIONS, QA_SESSION_MAX_TTL, QA_HOST_GRACE, HEARTBEAT_INTERVAL, heartbeatInterval, cleanupGameSessions, cleanupPulseSessions, cleanupQaSessions, handlePulseDisconnect, handleWebSocketMessage });
    }
}

module.exports = register;
