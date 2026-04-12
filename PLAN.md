# PLAN.md — Decentralized P2P Multiplayer for Liero26

## Goal
Add serverless peer-to-peer multiplayer so that game data never touches the
server. One browser acts as **host** (runs the `GameEngine`), others are
**peers** that send inputs and receive state — exactly like the existing
server/client split, but the "server" lives inside the host browser.

The existing Node.js server is kept only as a **WebRTC signaling relay**
(a few KB per session, negligible cost) and for serving static files.

## Technology
- **WebRTC DataChannels** — native browser API, no extra npm dependency.
- **STUN**: Google's free `stun:stun.l.google.com:19302` for NAT traversal.
- **Signaling**: Existing WebSocket server gains 5 new message types.
- **Game simulation**: `GameEngine` from `src/shared/engine.js` runs in the
  host browser (it is already dual-environment compatible).

## Architecture

```
Browser A (host)
  ├─ P2PHost (runs GameEngine, broadcast state)
  └─ RTCDataChannel ──┐
                       ├─── WebRTC (direct, no relay)
Browser B (peer)       │
  └─ P2PPeer ──────────┘

Server (signaling only, ~KB per session)
  └─ WS signaling: p2p_host / p2p_join / p2p_offer / p2p_answer / p2p_ice
```

## Phases & Tasks

### Phase 1 — Documentation & Plan
- [x] PLAN.md created
- [x] CONTEXT.md created

### Phase 2 — Server Signaling Relay
File: `src/server/index.js`
- [ ] Add `p2pRooms` map (roomCode → { hostWs, peers })
- [ ] Handle `p2p_host` — create a 6-char room code, store hostWs
- [ ] Handle `p2p_join` — forward join request to host
- [ ] Handle `p2p_offer` — relay SDP offer from host to a specific peer
- [ ] Handle `p2p_answer` — relay SDP answer from peer to host
- [ ] Handle `p2p_ice` — relay ICE candidates bidirectionally
- [ ] Clean up p2pRooms on WebSocket close

### Phase 3 — P2P Engine (src/client/p2p.js, new file)
- [ ] `P2PHost` class
  - `constructor(gameClient)` — stores reference to LieroClient
  - `create(settings)` — sends `p2p_host` to signaling server, returns room code
  - `acceptPeer(peerId, sdp)` — create RTCPeerConnection, answer offer
  - `onPeerData(peerId, msg)` — handle input / chat / weapons from peer
  - `_gameLoop()` — setInterval at TICK_RATE, identical to server Room.start()
  - `_broadcastToPeers(data)` — JSON → all open DataChannels
  - `destroy()` — stop loop, close all connections
- [ ] `P2PPeer` class
  - `constructor(gameClient)` — stores reference to LieroClient
  - `join(roomCode)` — sends `p2p_join` to signaling server
  - `handleOffer(sdp, peerId)` — create RTCPeerConnection, setRemoteDescription, createAnswer
  - `sendToHost(msg)` — send via DataChannel
  - `onHostData(msg)` — same as LieroClient.handleMessage (reuses existing handler)
  - `destroy()` — close connection

### Phase 4 — Client Integration (src/client/game.js)
- [ ] Add `this.p2pMode = null` (null | 'host' | 'peer') to constructor
- [ ] Add `this.p2pHost = null` / `this.p2pPeer = null`
- [ ] `hostP2PGame(settings)` — create P2PHost, connect to signaling WS, show code
- [ ] `joinP2PGame(code)` — create P2PPeer, connect to signaling WS, join room
- [ ] Modify `send(msg)` — route to P2PHost or P2PPeer when in P2P mode
- [ ] New screen `'p2p-host-lobby'` — show room code + player list while waiting
- [ ] Hook `p2p_room_code` server message to show code in UI

### Phase 5 — UI (public/index.html + public/style.css)
- [ ] Add P2P section to menu: "HOST P2P GAME" / "JOIN P2P GAME" buttons
- [ ] Add `#p2p-host-screen` — shows room code, connected peers, Start button
- [ ] Add `#p2p-join-screen` — text input for 6-char room code + Connect button
- [ ] CSS for new screens (reuse existing class conventions)

### Phase 6 — Testing & Validation
- [ ] Existing 54 unit tests still pass (`npm test`)
- [ ] Manual test: open two browser tabs, host + peer can play together
- [ ] Signaling cleanup: closing tab removes p2pRoom entry

## Risks
- **NAT traversal failure**: Without TURN server, ~15-20% of connections may
  fail behind symmetric NAT. Documented in README. (TURN servers cost money.)
- **Host advantage**: Host runs simulation; peers have ~0ms latency, host
  input also ~0ms. Acceptable for a casual game.
- **Tab close**: If host closes tab, all peers lose the game. Peer reconnect
  is not implemented (acceptable for v1).

## Testing Strategy
- Unit: `npm test` (existing 54 tests) — must all pass after changes.
- Integration: signaling message routing tested manually in browser devtools.
- E2E: Two browser tabs on localhost; host creates game, peer joins with code.
