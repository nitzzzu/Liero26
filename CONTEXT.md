# CONTEXT.md — Library Versions & API Reference

## Stack
| Dependency | Version | Source |
|------------|---------|--------|
| express    | ^4.21.2 | package.json |
| ws         | ^8.18.0 | package.json |
| WebRTC     | native browser API | no npm |
| STUN       | stun:stun.l.google.com:19302 | Google (free) |

No new npm dependencies are introduced.

---

## WebRTC DataChannel API (browser native)

### RTCPeerConnection
```js
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
});
```

### Creating a DataChannel (host side)
```js
// unreliable for game state (low-latency, drop-OK)
const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
// reliable for control messages
const ctrl = pc.createDataChannel('ctrl', { ordered: true });
```

### Receiving a DataChannel (peer side)
```js
pc.ondatachannel = (e) => {
  const dc = e.channel;
  dc.onmessage = (ev) => { /* handle JSON */ };
  dc.onopen = () => { /* channel ready */ };
};
```

### Offer / Answer exchange
```js
// Host creates offer
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
// → send offer.sdp to peer via signaling

// Peer receives offer, creates answer
await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);
// → send answer.sdp back to host via signaling

// Host receives answer
await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
```

### ICE candidates
```js
pc.onicecandidate = (e) => {
  if (e.candidate) {
    // send e.candidate to remote peer via signaling
    signalingWs.send(JSON.stringify({ type: 'p2p_ice', candidate: e.candidate, ... }));
  }
};

// Receiving side
await pc.addIceCandidate(candidate);
```

---

## ws package (Node.js server)

### Send to a specific WebSocket
```js
ws.send(JSON.stringify(msg));   // ws.readyState === ws.OPEN check recommended
```

### Broadcast to a set
```js
for (const peer of setOfWs) {
  if (peer.readyState === 1) peer.send(msg);
}
```

---

## Signaling Protocol (new message types added to server)

| Direction        | Message type  | Fields                                   |
|------------------|---------------|------------------------------------------|
| client → server  | `p2p_host`    | `settings`                               |
| server → client  | `p2p_room_code` | `code`                                 |
| client → server  | `p2p_join`    | `code`                                   |
| server → host    | `p2p_peer_request` | `peerId`, `name`, `character`       |
| host → server    | `p2p_offer`   | `peerId`, `sdp`                          |
| server → peer    | `p2p_offer`   | `peerId`, `sdp`                          |
| peer → server    | `p2p_answer`  | `peerId`, `sdp`                          |
| server → host    | `p2p_answer`  | `peerId`, `sdp`                          |
| either → server  | `p2p_ice`     | `peerId`, `candidate`, `fromHost`        |
| server → other   | `p2p_ice`     | `peerId`, `candidate`, `fromHost`        |

---

## GameEngine interface (src/shared/engine.js)

```js
const engine = new GameEngine();
engine.generateMap();
engine.gameMode = CONSTANTS.MODE.DEATHMATCH;
engine.scoreLimit = 15;
engine.timeLimit = 300;
engine.timeLeft = 300 * CONSTANTS.TICK_RATE;
engine.goriness = 2;

const worm = engine.addWorm(id, name);   // returns Worm
engine.removeWorm(id);
engine.update(inputsMap);                // Map<id, {left,right,up,down,fire,jump,change,dig}>
const state = engine.getState();         // serialisable snapshot
engine.changedCells                      // array of changed cell indices (cleared after each update)
engine.events                            // array of events (cleared after each update)
engine.gameOver                          // boolean
engine.winner                            // worm id
engine.tick                              // current tick number
```

---

## Room code generation
6 uppercase alphanumeric characters: `Math.random()` based.
```js
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
```
