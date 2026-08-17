#!/usr/bin/env python3
"""
GLM Quiz WebSocket Audit Tool
=============================
Tests the WebSocket real-time functionality of glm-quiz:
  - Connection lifecycle
  - Application-level ping/pong
  - Event flow: create_game -> join_game -> start_game -> submit_answer -> answer_reveal -> game_ended
  - Reconnect (host + player) with tokens
  - Race conditions: simultaneous joins, simultaneous answers, late join after start, host hijack

Usage:
    python3 ws_audit.py smoke            # 1 host + 2 players, full happy path
    python3 ws_audit.py race             # race condition scenarios
    python3 ws_audit.py stress [N]       # N players concurrent (default 50)
    python3 ws_audit.py reconnect        # host + player disconnect/reconnect
    python3 ws_audit.py all              # everything
"""

import asyncio
import json
import sys
import time
import argparse
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

import websockets
from websockets.exceptions import ConnectionClosed

WS_URL = "ws://localhost:3002"
DEFAULT_STRESS_N = 50

# ---------- helpers ----------

def now_ts() -> float:
    return time.time()

def short_id(name: str) -> str:
    return f"{name}-{id(name) % 10000}"


@dataclass
class Log:
    events: list = field(default_factory=list)
    send_log: list = field(default_factory=list)
    recv_log: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    pings_sent: int = 0
    pongs_recv: int = 0

    def recv(self, msg: dict):
        self.events.append(("recv", now_ts(), msg))
        self.recv_log.append((now_ts(), msg))

    def sent(self, msg: dict):
        self.events.append(("sent", now_ts(), msg))
        self.send_log.append((now_ts(), msg))

    def err(self, e):
        self.errors.append((now_ts(), str(e)))

    def wait_for(self, type_name: str, timeout: float = 5.0) -> Optional[dict]:
        """Block until we see a message with this type or timeout."""
        deadline = now_ts() + timeout
        # First scan existing log
        for ts, m in self.recv_log:
            if m.get("type") == type_name:
                return m
        return None


async def wait_for_event(log: Log, type_name: str, timeout: float = 5.0) -> Optional[dict]:
    """Async wait: scan log first, then poll briefly for new messages."""
    deadline = now_ts() + timeout
    for ts, m in log.recv_log:
        if m.get("type") == type_name:
            return m
    while now_ts() < deadline:
        await asyncio.sleep(0.05)
        for ts, m in log.recv_log:
            if m.get("type") == type_name:
                return m
    return None


async def wait_for_count(log: Log, type_name: str, count: int, timeout: float = 10.0) -> list:
    deadline = now_ts() + timeout
    seen = []
    for ts, m in log.recv_log:
        if m.get("type") == type_name:
            seen.append(m)
    while len(seen) < count and now_ts() < deadline:
        await asyncio.sleep(0.05)
        seen = [m for ts, m in log.recv_log if m.get("type") == type_name]
    return seen


# ---------- client ----------

class WSClient:
    """A single WebSocket client with logging + send/recv helpers."""
    def __init__(self, name: str, log: Log, url: str = WS_URL):
        self.name = name
        self.url = url
        self.log = log
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.alive = False
        self.ping_task: Optional[asyncio.Task] = None
        self.recv_task: Optional[asyncio.Task] = None
        self.player_id: Optional[str] = None
        self.reconnect_token: Optional[str] = None
        self.game_id: Optional[str] = None

    async def connect(self):
        self.ws = await websockets.connect(self.url, ping_interval=None, max_size=10*1024*1024)
        self.alive = True
        self.recv_task = asyncio.create_task(self._recv_loop())
        self.ping_task = asyncio.create_task(self._ping_loop())
        return self.ws

    async def close(self):
        self.alive = False
        if self.ping_task:
            self.ping_task.cancel()
        if self.recv_task:
            self.recv_task.cancel()
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass

    async def send(self, msg: dict):
        if not self.ws:
            raise RuntimeError("not connected")
        self.log.sent(msg)
        await self.ws.send(json.dumps(msg))

    async def _recv_loop(self):
        try:
            async for raw in self.ws:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", errors="replace")
                try:
                    msg = json.loads(raw)
                except Exception as e:
                    self.log.err(f"json parse: {e}: {raw[:120]}")
                    continue
                self.log.recv(msg)
        except ConnectionClosed:
            self.alive = False
        except Exception as e:
            self.log.err(f"recv: {e}")
            self.alive = False

    async def _ping_loop(self):
        """Send application-level ping every 1s, count pong replies."""
        try:
            while self.alive:
                await asyncio.sleep(1.0)
                if not self.alive:
                    break
                # Don't send pings if we haven't been added to a session yet
                if not self.game_id:
                    continue
                self.log.pings_sent += 1
                try:
                    await self.ws.send(json.dumps({"type": "ping"}))
                except Exception:
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.log.err(f"ping_loop: {e}")


# ---------- smoke test ----------

async def smoke_test():
    """1 host + 2 players, full happy path through 2 questions."""
    print("\n" + "="*70)
    print("SMOKE TEST: 1 host + 2 players, full happy path")
    print("="*70)

    log_host = Log()
    log_p1 = Log()
    log_p2 = Log()
    host = WSClient("host", log_host)
    p1 = WSClient("p1", log_p1)
    p2 = WSClient("p2", log_p2)

    await asyncio.gather(host.connect(), p1.connect(), p2.connect())
    print(f"[+] 3 clients connected: wss.clients={await get_wss_count()}")

    # Host creates game
    await host.send({"type": "create_game", "host_id": "host-A"})
    ev = await wait_for_event(log_host, "game_created", timeout=3)
    assert ev, "host did not receive game_created"
    host.game_id = ev["game_id"]
    host.reconnect_token = ev["reconnect_token"]
    print(f"[+] Game created: {host.game_id}, reconnect_token len={len(host.reconnect_token)}")

    # Two players join
    await p1.send({"type": "join_game", "game_id": host.game_id, "player_name": "Alice"})
    await p2.send({"type": "join_game", "game_id": host.game_id, "player_name": "Bob"})
    ev1 = await wait_for_event(log_p1, "joined", timeout=3)
    ev2 = await wait_for_event(log_p2, "joined", timeout=3)
    assert ev1 and ev2, f"join failed: {ev1} {ev2}"
    p1.player_id = ev1["player_id"]
    p1.reconnect_token = ev1["reconnect_token"]
    p1.game_id = host.game_id
    p2.player_id = ev2["player_id"]
    p2.reconnect_token = ev2["reconnect_token"]
    p2.game_id = host.game_id
    print(f"[+] Players joined: Alice={p1.player_id[:6]}.., Bob={p2.player_id[:6]}..")

    # Host sees both joins
    pj = await wait_for_count(log_host, "player_joined", 2, timeout=3)
    assert len(pj) >= 2, f"host did not see both player_joined: {pj}"
    last = pj[-1]
    assert last.get("player_count") == 2, f"player_count != 2: {last}"
    print(f"[+] Host saw both player_joined, player_count={last.get('player_count')}")

    # Host starts the game
    await host.send({"type": "start_game", "game_id": host.game_id})
    gs = await wait_for_event(log_host, "game_starting", timeout=3)
    assert gs, "no game_starting event"
    print(f"[+] game_starting received: question_count={gs.get('question_count')}")

    # Wait for first new_question (3s delay + jitter)
    nq = await wait_for_event(log_p1, "new_question", timeout=8)
    assert nq, "no new_question within 8s"
    print(f"[+] new_question #{nq.get('question_number')}: {nq['question']['text'][:60]}...")

    # Both players submit an answer. Client sends numeric index 0-3 (per realtime-player.html:450).
    # Server comparison `answer === question.correct_answer` works correctly only if both are numbers.
    # We don't know correct yet — but the server only accepts ONE answer per player per question
    # (duplicate submits are silently dropped). So we look up the correct answer in the DB
    # via the question_id we just received.
    import sqlite3
    question_id = nq.get("question", {}).get("id")
    if question_id is not None:
        try:
            con = sqlite3.connect("/root/glm-quiz/server/quiz.db")
            cur = con.execute("SELECT correct_answer FROM default_questions WHERE id = ?", (question_id,))
            row = cur.fetchone()
            con.close()
            correct_answer_int = row[0] if row else None
        except Exception as e:
            correct_answer_int = None
            print(f"[!] DB lookup failed: {e}")
    else:
        correct_answer_int = None

    # p1=0, p2=correct_answer_int (so p2 always wins)
    p1_ans = 0
    p2_ans = correct_answer_int if correct_answer_int is not None else 1
    await p1.send({"type": "submit_answer", "game_id": host.game_id, "player_id": p1.player_id, "answer": p1_ans})
    await p2.send({"type": "submit_answer", "game_id": host.game_id, "player_id": p2.player_id, "answer": p2_ans})
    await asyncio.sleep(0.2)
    ar_check = next((m for _, m in log_host.recv_log if m.get("type") == "answer_reveal"), None)
    correct = (ar_check or {}).get("correct_answer") if ar_check else None

    # Wait for answer_reveal (server triggers it once both players have answered)
    ar = await wait_for_event(log_host, "answer_reveal", timeout=5)
    if not ar:
        ar = next((m for _, m in log_host.recv_log if m.get("type") == "answer_reveal"), None)
    assert ar, "no answer_reveal"
    correct = ar.get("correct_answer")
    print(f"[+] answer_reveal: correct={correct}, leaderboard={ar.get('leaderboard')}")
    assert ar.get("leaderboard"), "no leaderboard in answer_reveal"
    # Verify scoring: player with correct answer must have score > 0
    scores = {p["name"]: p["score"] for p in ar["leaderboard"]}
    # At least one of Alice/Bob should have scored
    print(f"[i] Scores after one question: {scores}")
    if correct in (0, 1, 2, 3):
        expected_winner = "Alice" if correct % 2 == 0 else "Bob"
        # We can't be 100% sure who got it (race), but the server should award points
        # to whoever's answer === correct
        max_score = max(scores.values()) if scores else 0
        assert max_score > 0, f"no one scored for correct={correct}: {scores}"

    # Wait for next new_question or game_ended
    nq2 = await wait_for_event(log_p1, "new_question", timeout=8)
    if nq2:
        print(f"[+] Next question #{nq2.get('question_number')} arrived after reveal")
    else:
        print(f"[!] No next question — checking if game_ended...")
        ge = await wait_for_event(log_host, "game_ended", timeout=3)
        if ge:
            print(f"[+] game_ended received: leaderboard entries={len(ge.get('leaderboard', []))}")

    # Verify ping/pong counters
    pongs = sum(1 for _, m in log_host.recv_log if m.get("type") == "pong")
    print(f"[i] Host: pings_sent={log_host.pings_sent}, pongs_received={pongs}")

    await asyncio.gather(host.close(), p1.close(), p2.close())
    total_errors = len(log_host.errors) + len(log_p1.errors) + len(log_p2.errors)
    print(f"[+] All clients closed cleanly. errors={total_errors}\n")
    return {"errors": total_errors, "events": len(log_host.events) + len(log_p1.events) + len(log_p2.events)}


async def get_wss_count() -> int:
    """Read /api/health to get current websocket_sessions count."""
    import urllib.request
    try:
        with urllib.request.urlopen("http://localhost:3002/api/health", timeout=2) as r:
            data = json.loads(r.read().decode())
            return data.get("websocket_sessions", -1)
    except Exception:
        return -1


# ---------- race condition test ----------

async def race_test():
    """Concurrent joins, simultaneous answers, late join attempts, host hijack."""
    print("\n" + "="*70)
    print("RACE CONDITION TEST: 1 host + 10 concurrent joiners + burst answers")
    print("="*70)

    log_host = Log()
    host = WSClient("host", log_host)
    await host.connect()
    await host.send({"type": "create_game", "host_id": "host-RACE"})
    ev = await wait_for_event(log_host, "game_created", timeout=3)
    host.game_id = ev["game_id"]
    host.reconnect_token = ev["reconnect_token"]
    print(f"[+] Race game created: {host.game_id}")

    # 10 players join concurrently
    N = 10
    players = []
    player_logs = []
    for i in range(N):
        pl = Log()
        player_logs.append(pl)
        players.append(WSClient(f"p{i}", pl))
    await asyncio.gather(*(p.connect() for p in players))
    print(f"[+] {N} players connected: wss.clients={await get_wss_count()}")

    join_tasks = [
        p.send({"type": "join_game", "game_id": host.game_id, "player_name": f"Player{i}"})
        for i, p in enumerate(players)
    ]
    # Fire all 10 join requests at once
    await asyncio.gather(*join_tasks)
    print(f"[+] All 10 join_game messages sent in burst")

    # Wait for all players to receive 'joined' events
    joined_oks = 0
    seen_player_ids = set()
    counts_seen = []
    for i, p in enumerate(players):
        ev = await wait_for_event(player_logs[i], "joined", timeout=5)
        if ev:
            joined_oks += 1
            p.player_id = ev["player_id"]
            p.game_id = host.game_id
            seen_player_ids.add(ev["player_id"])
            counts_seen.append(ev.get("player_count"))
    print(f"[+] {joined_oks}/{N} players got 'joined' "
          f"(all player_ids unique: {len(seen_player_ids) == joined_oks}, "
          f"player_counts seen: {sorted(set(counts_seen))})")
    assert joined_oks == N, f"Only {joined_oks}/{N} players got joined"
    assert len(seen_player_ids) == N, "duplicate player_ids assigned — race condition!"

    # Host should see all 10 player_joined events with non-decreasing count
    host_joins = await wait_for_count(log_host, "player_joined", N, timeout=3)
    host_counts = [j.get("player_count") for j in host_joins]
    final_count = host_counts[-1] if host_counts else 0
    print(f"[+] Host saw {len(host_joins)} player_joined events, "
          f"counts: {host_counts}, final={final_count}")
    assert final_count == N, f"player_count mismatch: {final_count} != {N}"
    # Verify monotonic non-decreasing on host side
    for i in range(1, len(host_counts)):
        assert host_counts[i] >= host_counts[i-1], \
            f"player_count went backwards on host: {host_counts[i-1]} -> {host_counts[i]}"

    # Start the game
    await host.send({"type": "start_game", "game_id": host.game_id})
    print(f"[+] Game started, waiting for new_question...")
    nq = await wait_for_event(log_host, "new_question", timeout=8)
    assert nq, "no new_question"
    print(f"[+] new_question #{nq.get('question_number')}")

    # RACE: all 10 players submit their answer in the same tick
    # Client sends numeric index 0-3 (per realtime-player.html)
    burst = [
        p.send({"type": "submit_answer",
                "game_id": host.game_id,
                "player_id": p.player_id,
                "answer": 0 if i % 2 == 0 else 1})
        for i, p in enumerate(players)
    ]
    await asyncio.gather(*burst)
    print(f"[+] 10 submit_answer messages sent simultaneously")

    # Wait for answer_reveal (should trigger once all 10 answered)
    ar = await wait_for_event(log_host, "answer_reveal", timeout=5)
    assert ar, "no answer_reveal after burst"
    lb = ar.get("leaderboard", [])
    # Server truncates answer_reveal leaderboard to top 5 (server.js: .slice(0, 5))
    # Full leaderboard is delivered on game_ended
    print(f"[+] answer_reveal: correct={ar.get('correct_answer')}, "
          f"leaderboard entries (top 5)={len(lb)}")
    assert 1 <= len(lb) <= 5, f"unexpected leaderboard size: {len(lb)}"

    # To get full leaderboard we use get_results
    await host.send({"type": "get_results", "game_id": host.game_id})
    res = await wait_for_event(log_host, "results", timeout=3)
    assert res and len(res.get("leaderboard", [])) == N, \
        f"get_results leaderboard mismatch: {res}"
    print(f"[+] get_results: full leaderboard has {len(res.get('leaderboard', []))} players (=={N})")

    # Verify duplicate-submit is rejected: try sending the same answer twice
    await players[0].send({"type": "submit_answer", "game_id": host.game_id,
                            "player_id": players[0].player_id, "answer": 0})
    # Server should silently ignore (no second answer_result)
    pre_count = sum(1 for _, m in player_logs[0].recv_log if m.get("type") == "answer_result")
    await asyncio.sleep(0.5)
    post_count = sum(1 for _, m in player_logs[0].recv_log if m.get("type") == "answer_result")
    print(f"[i] Duplicate-submit: answer_result count {pre_count} -> {post_count} (should be unchanged)")

    # LATE JOIN ATTEMPT: a new player tries to join after game has started
    log_late = Log()
    late = WSClient("late", log_late)
    await late.connect()
    await late.send({"type": "join_game", "game_id": host.game_id, "player_name": "Latecomer"})
    err = await wait_for_event(log_late, "error", timeout=2)
    if err and "already started" in err.get("message", ""):
        print(f"[+] Late join correctly rejected: {err['message']}")
    else:
        print(f"[!] Late join result: {err}")

    # HOST HIJACK: another client tries to call start_game
    log_fake = Log()
    fake = WSClient("fake", log_fake)
    await fake.connect()
    await fake.send({"type": "start_game", "game_id": host.game_id})
    err = await wait_for_event(log_fake, "error", timeout=2)
    if err and "Not the host" in err.get("message", ""):
        print(f"[+] Host hijack correctly rejected: {err['message']}")
    else:
        print(f"[!] Hijack response: {err}")
    await fake.close()
    await late.close()

    # Bad reconnect token test
    await players[0].send({"type": "join_game", "game_id": host.game_id,
                           "player_name": "Player0", "player_id": players[0].player_id,
                           "reconnect_token": "deadbeef" * 4})
    badtok = await wait_for_event(player_logs[0], "error", timeout=2)
    if badtok and "Invalid reconnect token" in badtok.get("message", ""):
        print(f"[+] Invalid reconnect token correctly rejected")
    else:
        print(f"[!] Bad token response: {badtok}")

    await asyncio.gather(host.close(), *(p.close() for p in players))
    total_errors = sum(len(l.errors) for l in [log_host, *player_logs, log_late, log_fake])
    print(f"[+] Race test cleanup done. Total errors: {total_errors}\n")
    return {"errors": total_errors}


# ---------- reconnect test ----------

async def reconnect_test():
    """Disconnect/reconnect for both host and player with proper tokens."""
    print("\n" + "="*70)
    print("RECONNECT TEST: host and player disconnect/reconnect with tokens")
    print("="*70)

    log_host1 = Log()
    log_p1 = Log()
    host1 = WSClient("host1", log_host1)
    p1 = WSClient("p1", log_p1)
    await asyncio.gather(host1.connect(), p1.connect())
    await host1.send({"type": "create_game", "host_id": "host-RC"})
    ev = await wait_for_event(log_host1, "game_created", timeout=3)
    host1.game_id = ev["game_id"]
    host1.reconnect_token = ev["reconnect_token"]
    await p1.send({"type": "join_game", "game_id": host1.game_id, "player_name": "Reconnector"})
    jev = await wait_for_event(log_p1, "joined", timeout=3)
    p1.player_id = jev["player_id"]
    p1.reconnect_token = jev["reconnect_token"]
    p1.game_id = host1.game_id
    print(f"[+] Game {host1.game_id} created, player {p1.player_id[:6]} joined")

    # Disconnect host abruptly
    await host1.close()
    print(f"[+] Host disconnected")

    # Wait for grace period
    await asyncio.sleep(1)

    # New host connection with reconnect token
    log_host2 = Log()
    host2 = WSClient("host2", log_host2)
    await host2.connect()
    await host2.send({"type": "reconnect_host", "game_id": host1.game_id,
                       "host_id": "host-RC", "reconnect_token": host1.reconnect_token})
    rc = await wait_for_event(log_host2, "host_reconnected", timeout=3)
    assert rc, "host reconnect failed"
    host2.game_id = host1.game_id
    print(f"[+] Host reconnected: state={rc.get('state')}, players={len(rc.get('players', []))}")

    # Players should be notified
    hr = await wait_for_event(log_p1, "host_reconnected", timeout=3)
    print(f"[+] Player saw host_reconnected: {hr.get('message') if hr else 'NO'}")

    # Bad reconnect token
    log_host3 = Log()
    host3 = WSClient("host3", log_host3)
    await host3.connect()
    await host3.send({"type": "reconnect_host", "game_id": host1.game_id,
                       "host_id": "host-RC", "reconnect_token": "wrong" + "0" * 60})
    err = await wait_for_event(log_host3, "error", timeout=2)
    if err and "Invalid host reconnect" in err.get("message", ""):
        print(f"[+] Bad host token rejected: {err['message']}")
    else:
        print(f"[!] Bad host token response: {err}")
    await host3.close()

    # Player reconnect — first disconnect
    await p1.close()
    await asyncio.sleep(0.5)
    log_p2 = Log()
    p2 = WSClient("p1-new", log_p2)
    await p2.connect()
    await p2.send({"type": "join_game", "game_id": host1.game_id,
                    "player_name": "Reconnector", "player_id": p1.player_id,
                    "reconnect_token": p1.reconnect_token})
    rec = await wait_for_event(log_p2, "reconnected", timeout=3)
    assert rec, "player reconnect failed"
    p2.player_id = rec["player_id"]
    p2.game_id = host1.game_id
    print(f"[+] Player reconnected: score={rec.get('score')}, state={rec.get('state')}")

    await asyncio.gather(host2.close(), p2.close())
    total_errors = sum(len(l.errors) for l in [log_host1, log_p1, log_host2, log_host3, log_p2])
    print(f"[+] Reconnect test done. errors={total_errors}\n")
    return {"errors": total_errors}


# ---------- stress test ----------

async def stress_test(n: int):
    """N players all join the same host's game, verify no lost updates."""
    print("\n" + "="*70)
    print(f"STRESS TEST: 1 host + {n} concurrent players, all answer")
    print("="*70)

    log_host = Log()
    host = WSClient("host", log_host)
    await host.connect()
    await host.send({"type": "create_game", "host_id": "host-STRESS"})
    ev = await wait_for_event(log_host, "game_created", timeout=3)
    host.game_id = ev["game_id"]
    print(f"[+] Stress game created: {host.game_id}")

    t0 = time.time()
    players = []
    player_logs = []
    for i in range(n):
        pl = Log()
        player_logs.append(pl)
        players.append(WSClient(f"p{i}", pl))

    # Connect all in parallel
    await asyncio.gather(*(p.connect() for p in players))
    t_connect = time.time() - t0
    print(f"[+] {n} clients connected in {t_connect:.2f}s "
          f"(wss.clients={await get_wss_count()})")

    # All join in parallel
    t1 = time.time()
    await asyncio.gather(*(p.send({"type": "join_game", "game_id": host.game_id,
                                    "player_name": f"S{i}"}) for i, p in enumerate(players)))
    # Wait for all 'joined' events
    for i, p in enumerate(players):
        ev = await wait_for_event(player_logs[i], "joined", timeout=10)
        if ev:
            p.player_id = ev["player_id"]
            p.game_id = host.game_id
    t_join = time.time() - t1
    print(f"[+] {n} players joined in {t_join:.2f}s")

    joined_count = sum(1 for p in players if p.player_id)
    print(f"[i] {joined_count}/{n} players got 'joined'")

    # Host sees all player_joined
    pj = await wait_for_count(log_host, "player_joined", n, timeout=10)
    print(f"[i] Host saw {len(pj)} player_joined (expected {n})")

    # Start and answer burst
    await host.send({"type": "start_game", "game_id": host.game_id})
    nq = await wait_for_event(log_host, "new_question", timeout=8)
    if not nq:
        print(f"[!] No new_question — aborting stress")
        return {"errors": len(log_host.errors)}
    print(f"[+] Game started, new_question #{nq.get('question_number')}")

    t2 = time.time()
    await asyncio.gather(*(p.send({"type": "submit_answer", "game_id": host.game_id,
                                    "player_id": p.player_id, "answer": 0})
                            for p in players if p.player_id))
    ar = await wait_for_event(log_host, "answer_reveal", timeout=15)
    t_ans = time.time() - t2
    if ar:
        print(f"[+] answer_reveal in {t_ans:.2f}s, "
              f"correct={ar.get('correct_answer')}, "
              f"leaderboard_entries={len(ar.get('leaderboard', []))}")
    else:
        print(f"[!] No answer_reveal within 15s")

    # Verify every player got answer_result
    got_result = sum(
        1 for pl in player_logs
        if any(m.get("type") == "answer_result" for _, m in pl.recv_log)
    )
    print(f"[i] {got_result}/{n} players got answer_result")

    # Throughput stats
    total_msgs = sum(len(pl.events) for pl in player_logs) + len(log_host.events)
    elapsed = max(time.time() - t0, 0.001)
    print(f"[i] Total messages: {total_msgs} in {elapsed:.2f}s "
          f"({total_msgs/elapsed:.0f} msg/s)")

    await asyncio.gather(host.close(), *(p.close() for p in players))
    total_errors = sum(len(l.errors) for l in [log_host, *player_logs])
    print(f"[+] Stress test done. Errors: {total_errors}\n")
    return {
        "n": n, "connected": n, "joined": joined_count, "got_result": got_result,
        "errors": total_errors, "msg_per_sec": total_msgs / elapsed,
        "join_seconds": t_join, "answer_seconds": t_ans
    }


# ---------- main ----------

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", nargs="?", default="all",
                        choices=["smoke", "race", "reconnect", "stress", "all"])
    parser.add_argument("-n", "--count", type=int, default=DEFAULT_STRESS_N,
                        help=f"Player count for stress (default {DEFAULT_STRESS_N})")
    args = parser.parse_args()

    print(f"Target: {WS_URL}")
    try:
        import urllib.request
        with urllib.request.urlopen("http://localhost:3002/api/health", timeout=2) as r:
            data = json.loads(r.read().decode())
            print(f"Server health: status={data.get('status')}, "
                  f"uptime={data.get('uptime_seconds')}s, "
                  f"db={data.get('database')}, "
                  f"current_ws={data.get('websocket_sessions')}")
    except Exception as e:
        print(f"!! Could not reach server: {e}")
        sys.exit(1)

    results = {}
    if args.mode in ("smoke", "all"):
        results["smoke"] = await smoke_test()
    if args.mode in ("race", "all"):
        results["race"] = await race_test()
    if args.mode in ("reconnect", "all"):
        results["reconnect"] = await reconnect_test()
    if args.mode in ("stress", "all"):
        results["stress"] = await stress_test(args.count)

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    for k, v in results.items():
        print(f"  {k}: {v}")
    print()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Interrupted")
        sys.exit(130)
