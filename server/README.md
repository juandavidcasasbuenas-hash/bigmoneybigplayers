# Authoritative poker server

`npm run dev` runs Vite and this Socket.IO server together. The development proxy forwards `/socket.io` and `/api` to port 3001. `npm run build && npm start` serves the compiled frontend and realtime endpoint together from one Node process. `PORT` defaults to 3001. If hosting behind another origin, `ALLOWED_ORIGINS` accepts a comma-separated browser-origin allowlist.

No Supabase account is required. The host shares the web app URL with `?room=ABC123`; the invite code identifies the room. Node with WebSocket support is required for online multiplayer. A static-only frontend deployment cannot host this server. Rooms exist in memory, survive browser refresh/reconnect, and disappear if the server restarts. Run one process/replica; moving to multiple replicas requires a shared authoritative room service and durable persistence, not only a Socket.IO adapter.

## Engine choice

The free [GoldFire pokersolver](https://github.com/goldfire/pokersolver) package is reused under its MIT license to evaluate seven-card hands and compare tied winners. Its repository documents production use in CasinoRPG. It is an evaluator, not a complete betting engine: `engine.ts` supplies our 2–12 seat no-limit Hold’em rules, tournament lifecycle, secure shuffle, side pots, timers, bots and privacy.

[PokerTH](https://github.com/pokerth/pokerth) is a mature alternative, but its official README describes a C++/Qt application with 2–10 seats under AGPLv3. Its architecture and seat limit did not fit this browser experience. No code from PokerTH is copied.

## Rules implemented

- Standard 52-card deck, cryptographic Fisher–Yates shuffle using Node `crypto.randomInt`, two private cards, three burn cards and five community cards.
- No-limit betting with server-owned turns and stacks. A raise amount is the **total street bet**, including chips already committed on that street. Minimum full raises, short all-in calls/raises, cumulative short-all-in reopening, and the big blind's option are enforced.
- A short opening all-in is a call-able wager; a subsequent raise adds a full minimum bet instead of merely completing the wager to one blind. This follows the [Poker TDA's explanation of short opening all-ins](https://www.pokertda.com/forum/index.php?topic=1456.0) and [reopening rule 47](https://www.pokertda.com/view-poker-tda-rules/).
- Heads-up button posts the small blind and acts first preflop, last postflop. The button moves clockwise to the next occupied funded seat each hand (moving-button convention).
- Individual antes precede blinds; exhausted stacks become all-in. Uncalled bets are returned, side pots are evaluated separately, ties split, and odd chips go clockwise from the button.
- Street completion automatically runs out the board when no further side betting is possible. Uncontested winners do not reveal their hand. Showdown contenders are revealed; folded hands stay private.
- Integer play chips only, no cash buy-ins, rake, payments or withdrawal mechanism.
- Tournament rules lock on first deal. Blinds advance between hands; scheduled breaks also begin between hands. Pause freezes action, level, break and next-hand clocks. The final configured blind level remains in use.
- Late players wait for the next deal. Rebuys require a busted seated player, a hand boundary, an open configured rebuy window, and a remaining rebuy allowance. Busted players stay at their seat on the rail.
- Disconnecting retains the seat, stack and token. The action clock checks if possible or folds on expiry. Explicit departure transfers host controls to a connected human when available.
- House bots act from their own hole cards plus public board/pot information. They cannot inspect opponents' cards or the undealt deck. They are casual demo opponents, not a strategic AI solver.

## Wire contract

Shared data and defaults are in `shared/types.ts`. Server broadcasts a separately constructed `room-state` to each socket. The browser never receives the room object. `you` is the viewer's player ID, `actions` are the currently permitted actions or null, and `holeCards` is empty for every unrevealed opponent. `cardCount` lets the 3D table display card backs.

| Event | Payload | Access |
|---|---|---|
| `create-room` | `{name, avatarId, settings?}` | Anyone |
| `join-room` | `{roomCode, name?, avatarId?, token?, spectator?}` | Anyone with invite |
| `action` | `{type: 'fold' \| 'check' \| 'call' \| 'all-in', turnId}` or `{type:'raise', amount, turnId}` | Current actor |
| `update-settings` | Partial `GameSettings` | Host |
| `start-game` | None | Host |
| `next-hand` | None | Host, after showdown |
| `add-bot` | `{name?, avatarId?}` | Host |
| `pause-game` | `{paused: boolean}` | Host |
| `emote` | `{type: 'bluff' \| 'laugh' \| 'stand' \| 'cry' \| 'cheers' \| 'shush'}` | Participants |
| `chat` | `{text}` | Participants |
| `rebuy` | None | Eligible busted player |
| `request-state` | None | Participants |
| `leave-room` | None | Participants |

Every event supports an acknowledgement `{ok, error?, roomCode?, token?, playerId?}`. Create and join return a 256-bit random bearer token: save it locally keyed by room code and use it for reconnect. Display names are not authentication. Opening the same token in a second tab replaces the first connection and emits `session-replaced`. Every betting action must include the current snapshot's opaque `turnId`, which changes on every actor/street transition; delayed duplicates cannot act on a later turn. The client should disable actions while disconnected, never retry a wager automatically after an acknowledgement timeout, and request a fresh snapshot to determine its result. `request-state` returns the session credentials to its already authenticated socket in the private acknowledgement, allowing recovery if the original create/join acknowledgement was lost; credentials never appear in `room-state`.

Spectators, eliminated players, and seated late players waiting for their first hand see no live opponent cards. The default separate rail chat is removed from seated viewers' snapshots; rail emotes are also hidden from seated viewers. Table chat is visible to everyone. A host can choose shared spectator chat before the tournament. Outside communication and someone joining multiple identities cannot be prevented by an invite-only social game without stronger account moderation.

`npm test` covers deterministic hand results, side pots and tied odd chips, short all-in reopening, 12-seat card/chip conservation, heads-up and short-blind cases, timers, pauses and breaks, registration/rebuys, randomized legal hands, actual multi-socket authorization, reconnects and private payloads.

## Operational scope

This is a recreational single-table prototype designed for trusted friends. Deploy behind HTTPS for remote play. The server limits payload size, event rate, room creation, seated players and spectators. Reconnect tokens remain server-side except in the joining player's acknowledgement. Do not expose debug serialization of engine objects, persist raw bearer tokens in analytics, or add a spectator 'see all cards' client toggle. Durable recovery, account moderation and a production soak test are further work before operating a public service.
