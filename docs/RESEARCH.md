# Big Money, Big Players — research and design notes

Research checked 11 September 2026. This document records references and intended product decisions; it is not a claim that every checklist item is implemented. Hosting allowances can change. All chips are recreational points with no monetary value.

## The PKR ingredients worth bringing back

PKR founder Jez San described television-inspired camera angles, customizable faces, taunts, body language and chip tricks. Crucially, emotes were deliberately chosen by players rather than automatic reactions that leaked hand strength. The contemporary [founder interview](https://www.techdigest.tv/2007/04/interview_pkrs.html) is a first-person historical source, published in 2007. A [2013 promotional video description](https://vimeo.com/68718583) also lists stand-up celebrations, animated emotes, character moods, dynamic cameras while out of a hand, guest table viewing, four-colour cards and separate dealer/player audio controls. That upload is a historical promotional reference, not current product documentation.

Design decisions:

- Keep a one-click banter tray: bluff lean, slow clap, chip shuffle, facepalm, toast, and a theatrical stand-up with “Well, this has been lovely.” Standing up is an emote; folding and leaving require their own explicit game actions.
- Give every emote a matching animation, short spoken line and caption. Keep voice optional and rate-limit emotes so one person cannot drown out the table.
- Animate neutral idle movements independently of hole cards. Avoid automatic nervousness, excitement, camera cuts or voice choices based on a private hand.
- Offer table, overhead, seated and cinematic cameras. Cinematic changes should yield to the player's action and avoid motion when reduced motion is enabled.
- Dealer calls public community cards, betting milestones and the winning hand at showdown. It must never announce anyone's live hole cards. Device speech voices vary; captions are the dependable fallback.

## Visual direction

This should feel like an eccentric miniature pub theatre: chunky heads, clean silhouettes, recognizable hair/beards/glasses and photo-derived face details, tactile felt and chips, warm practical lights, and exaggerated poses. Keep faces readable above the table. Use the user's photos as character references; these are not inferred identities.

The [official Poker Night at the Inventory store page](https://store.steampowered.com/app/3897800/Poker_Night_at_the_Inventory/) shows how distinct cartoon characters, warm club lighting and dialogue can carry a poker game's personality. Its publisher describes table talk as a central feature. The useful reference is the relationship between expressive characters and a readable table, not its licensed characters or dialogue.

The [Poker Club environment artist interview](https://www.pokerclubgame.com/news-updates/gunung-casino-access-all-areas/) describes deliberately contrasting locations, from penthouse to pizzeria basement, with coherent material and lighting choices. Our room choices should change the surrounding architecture and props as well as the colour palette. [Prominence Poker's official release notes](https://store.steampowered.com/news/posts/?appids=384180&enddate=1663799323&feed=steam_community_announcements) record emote throttling and separate avatar voice settings: useful precedents for keeping banter enjoyable.

Room concepts:

| Room | Visual cues | Original joke |
| --- | --- | --- |
| Turf-inspired Oxford pub | Honey stone, dark timber, low beams, hanging plants, courtyard bulbs, chalkboards | “An education in poor decisions.” |
| Absurdly grand club | Oxblood upholstery, brass, chandelier, marble, oversized portraits | The chips are plastic; the dress code isn't. |
| Very basic home game | Folding table, mismatched chairs, crates, bare bulb, takeaway boxes | “Five-star hospitality. One working chair.” |

The Turf reference comes from [its official Greene King page and gallery](https://www.greeneking.co.uk/pubs/oxfordshire/turf-tavern): narrow passages, small connected rooms, a low doorway, courtyard gardens and the medieval city wall. Build an affectionate stylized interpretation; do not imply affiliation. Game assets should be original rather than copied from reference titles. Put the requested **BIG MONEY BIG PLAYERS** text on the chip texture itself.

## Home tournament setup checklist

The following is our product checklist, informed by [PokerStars' tournament rules](https://www.pokerstars.com/poker/tournaments/rules/), its [tournament format guide](https://www.pokerstars.com/poker/tournaments/types/), and [PokerTH's configurable home games](https://github.com/pokerth/pokerth). Items that are not supported should be omitted or clearly described rather than exposed as decorative controls.

| Setting | Recommended behaviour |
| --- | --- |
| Format | No-limit Texas Hold'em only; single table, 2–12 seated players |
| Name and invite | Named room, share link, display name and avatar on entry; no account required |
| Starting chips | Equal positive integer stacks; recreational points only |
| Blind schedule | Presets plus editable small blind / big blind / ante rows |
| Level duration | Minutes per level; changed blinds apply to the next hand |
| Antes | Explicit off / per-player / big-blind choice if supported; never ambiguous |
| Turn clock | Visible seconds and optional time bank; timeout checks if free, otherwise folds |
| Breaks | Cadence and duration; finish the current hand before break starts |
| Tournament entry | Freezeout by default; optional late-entry/re-entry cutoff and count cap |
| Start / pause | Host start; pause timing clearly stated; announce next level and breaks |
| Seats | Seat capacity, random or fixed assignment policy; wait until hand boundary to join play |
| Away / disconnect | Retain seat and stack; reconnect via private session token; blinds continue |
| Spectators | Host permission; public information only; separate rail conversation |
| Showdown | Side pots, tied hands and odd chips; show only entitled revealed cards |
| Audio / comfort | Dealer voice, banter, sound level, captions, reduced motion, readable suits |
| End | Winner, finishing order and a restart/rematch path; no cash payouts or payment fields |

No-limit details need engine tests, not settings: heads-up button/small-blind order, the big blind's option, minimum full raises, short all-ins and cumulative reopening, uncalled bet returns, folded contributions in side pots, all-in runouts, ties and odd chips. The [2024 Poker TDA rules and examples](https://www.pokertda.com/view-poker-tda-rules/) are the primary reference. A 12-seat Hold'em hand is feasible with a standard deck, though less common than 6–10 seats; the table and labels must accommodate all 12 without covering the board.

## Spectators are part of the evening

These are design requirements derived from hidden-information gameplay, not claims about a particular commercial platform:

- A bust-out becomes a rail guest automatically and keeps their name, avatar, finishing position and invitation session. Explain this transition instead of leaving a disabled betting panel on screen.
- Send spectators only board, pot, stacks, public actions and legally revealed showdown cards. Remove live hole cards and deck order from payloads entirely; hiding them in CSS is insufficient.
- The host has the same card visibility as any player. Admin rights must not grant a live peek.
- Separate spectator conversation from seated-player chat during a hand. Otherwise a folded or eliminated player can influence action with remembered card information. Limited neutral reactions can remain available.
- Camera controls should still work from the rail. An observer camera changes perspective, never permission to see hidden cards.
- Late arrival and re-entry should be explicit policies. A spectator cannot regain chips or a seat just by refreshing, changing name or switching role. Re-entry, when allowed, occurs only between hands.
- Keep reconnect identity separate from a public room code and display name. Snapshot each reconnect from authoritative state and validate host rights on the server.

## Poker library choice

[GoldFire's pokersolver](https://github.com/goldfire/pokersolver) is the selected MIT-licensed JavaScript evaluator. Its README documents up to seven-card evaluation, detailed hand names, winning-card identification and tied winners, with Node.js support. It is a hand evaluator, **not a complete tournament engine**. We use it behind our own authoritative table state machine for 12 players, betting, pots, timers and room permissions. Preserve its license notice when distributing.

[PokerTH](https://github.com/pokerth/pokerth) is a useful full-game reference. Its official repository describes C++/Qt, AGPLv3 licensing and 2–10 players. That makes it a poor direct embedding choice for this 12-player browser application. This comparison is a fit assessment rather than a claim that one implementation is more correct; the custom betting layer still requires meaningful tests.

## Realtime: Supabase is optional

| Option | Fit and caveat | Primary source |
| --- | --- | --- |
| Node + Socket.IO | Straightforward authoritative room server; run locally or on a host with long-lived connections. Transport itself has no service fee. Hosting and persistence are separate. | [Rooms](https://socket.io/docs/v4/rooms/) |
| Render free Node web service | A practical hobby deployment of the same server. Currently 750 instance hours per workspace/month, spin-down after 15 minutes with no incoming HTTP or WebSocket messages, and roughly one-minute cold start. Free services can restart and local files are ephemeral. | [Free services](https://render.com/docs/free), [2026 WebSocket update](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages) |
| Supabase free | Currently 200 peak realtime connections and 2 million messages/month, 500 MB database, two active free projects; free projects pause after one week inactive. Plenty of connection capacity for one small table, but broadcast fan-out counts toward usage. It still needs secure server-side poker logic. | [Pricing](https://supabase.com/pricing), [billing details](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| Cloudflare Durable Objects | An alternative architecture with one authoritative object per room, WebSockets and persistent SQLite. Available on Workers Free; quotas currently include 100,000 requests/day and 13,000 GB-s/day. Adapting the server is additional work, not a drop-in Socket.IO hosting change. | [Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) |

Recommended initial path: a single Node process serving the built client and authoritative Socket.IO game. A publicly reachable host produces the shareable internet URL; `localhost` links work only on the same computer. Keep the initial deployment simple, and add durable storage before relying on games surviving host restarts. Supabase can provide that persistence later without being required for basic realtime play.

Socket.IO preserves message ordering but [defaults to at-most-once delivery](https://socket.io/docs/v4/delivery-guarantees/). Betting commands need acknowledgements, action/hand identifiers and duplicate/stale-action rejection. [Connection recovery](https://socket.io/docs/v4/connection-state-recovery/) can help temporary disconnects but is not guaranteed, so clients must be able to request a fresh redacted snapshot. Neither reconnection nor an in-memory room store is a substitute for durable recovery after the host process is lost.
