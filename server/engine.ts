import { clockwiseDistance, nextFreeSeat } from "../shared/seats.js";
import { randomInt, randomUUID, randomBytes } from 'node:crypto';
import solver from 'pokersolver';
import { burstDuration, motionDuration } from '../shared/tableTimeline.js';
import { actionSpeech, PLAYER_EMOTES as emotes, type SpokenAction } from '../shared/playerDialogue.js';
import { DealerDialogue } from './dealerDialogue.js';
import { PLAIN_HAND_START, PLAIN_HAND_END, SIDE_POT_END, RESULT_LINES } from './voiceCatalog.js';
import type { Hand as SolvedHand } from 'pokersolver';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import type { AvailableActions, BlindLevel, Card, ChatMessage, DealerMessage, Emote, GameSettings, PokerAction, Pot, PublicPlayer, RoomState, Stage, Winner, TableEvent, TableEventData } from '../shared/types.js';

export interface Player extends PublicPlayer { token: string }
const playingStages: Stage[] = ['preflop', 'flop', 'turn', 'river'];
const { Hand } = solver;
const integer = (v: unknown, label: string, min: number, max: number): number => {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return v as number;
};
const safeText = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

export function validateSettings(input: Partial<GameSettings> = {}, base = DEFAULT_SETTINGS): GameSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid table settings.');
  const s = structuredClone(base);
  const fields: [keyof GameSettings, number, number][] = [
    ['startingStack',100,1000000], ['maxPlayers',2,12], ['turnSeconds',10,180],
    ['rebuyUntilLevel',1,100], ['maxRebuys',1,10], ['lateRegistrationUntilLevel',1,100],
    ['nextHandSeconds',3,60], ['breakEveryLevels',0,100], ['breakMinutes',1,60],
  ];
  for (const [key,min,max] of fields) if (key in input) (s as unknown as Record<string, unknown>)[key] = integer(input[key], key, min, max);
  const booleans: (keyof GameSettings)[] = ['rebuys','lateRegistration','allowSpectators','autoNextHand','dealerVoice','banter'];
  for (const key of booleans) if (key in input) {
    if (typeof input[key] !== 'boolean') throw new Error(`Invalid ${key} setting.`);
    (s as unknown as Record<string, unknown>)[key] = input[key];
  }
  if ('name' in input) { s.name = safeText(input.name, 48); if (!s.name) throw new Error('Give your table a name.'); }
  if ('roomTheme' in input) {
    if (!['turf','penthouse','basement'].includes(input.roomTheme!)) throw new Error('Unknown room.');
    s.roomTheme = input.roomTheme!;
  }
  if ('spectatorChat' in input) {
    if (!['separate','table'].includes(input.spectatorChat!)) throw new Error('Unknown spectator chat mode.');
    s.spectatorChat = input.spectatorChat!;
  }
  if ('levels' in input) {
    if (!Array.isArray(input.levels) || input.levels.length < 1 || input.levels.length > 100) throw new Error('Use between 1 and 100 blind levels.');
    s.levels = input.levels.map((l, i) => {
      if (!l || typeof l !== 'object') throw new Error('Invalid blind level.');
      const small = integer(l.small, `Level ${i+1} small blind`, 1, 1000000);
      const big = integer(l.big, `Level ${i+1} big blind`, small + 1, 2000000);
      const ante = integer(l.ante, `Level ${i+1} ante`, 0, big);
      const minutes = integer(l.minutes, `Level ${i+1} duration`, 1, 180);
      return { small, big, ante, minutes };
    });
  }
  return s;
}

export function shuffledDeck(): Card[] {
  const deck = [...'23456789TJQKA'].flatMap(rank => [...'cdhs'].map(suit => rank + suit));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}


const cardWords = (card: Card) => {
  const rank: Record<string,string> = {T:'ten',J:'jack',Q:'queen',K:'king',A:'ace'};
  const suit: Record<string,string> = {s:'spades',h:'hearts',d:'diamonds',c:'clubs'};
  return `${rank[card[0]] ?? card[0]} of ${suit[card[1]]}`;
};

/** All mutating methods run synchronously on the server. No private engine fields are broadcast. */
export class PokerRoom {
  readonly code: string;
  settings: GameSettings;
  hostId = '';
  players: Player[] = [];
  stage: Stage = 'lobby';
  board: Card[] = [];
  deck: Card[] = [];
  handNumber = 0;
  dealerId: string | null = null;
  smallBlindId: string | null = null;
  bigBlindId: string | null = null;
  turnPlayerId: string | null = null;
  turnId: string | null = null;
  turnEndsAt: number | null = null;
  turnStartsAt: number | null = null;
  private presentationReadyAt = 0;
  private turnPending = false;
  private readonly paced: boolean;
  currentBet = 0;
  lastFullRaise = 50;
  pending = new Set<string>();
  acted = new Map<string, { bet: number; raiseSize: number }>();
  levelIndex = 0;
  levelEndsAt: number | null = null;
  startedAt: number | null = null;
  paused = false;
  pauseStartedAt: number | null = null;
  breakEndsAt: number | null = null;
  nextHandAt: number | null = null;
  winners: Winner[] = [];
  settledPots: Pot[] = [];
  dealerMessages: DealerMessage[] = [];
  tableEvents: TableEvent[] = [];
  private eventSequence = 0;
  private allInAnnounced = false;
  private readonly dialogue = new DealerDialogue();
  chat: ChatMessage[] = [];
  lastActivity = Date.now();
  private reveal = new Set<string>();
  private mucked = new Set<string>();
  handReview: RoomState['handReview'] = null;
  private reviewOpened = false;
  private reviewClosed = false;
  private handBigBlind = 50;
  private dealerSeat = -1;
  private botActAt: number | null = null;
  private readonly clock: () => number;
  private readonly makeDeck: () => Card[];

  constructor(code: string, settings: Partial<GameSettings> = {}, options: { clock?: () => number; makeDeck?: () => Card[]; paced?: boolean } = {}) {
    this.code = code;
    this.paced = options.paced ?? false;
    this.settings = validateSettings(settings);
    this.clock = options.clock ?? Date.now;
    this.makeDeck = options.makeDeck ?? shuffledDeck;
    this.say('Welcome to the table. Big money. Big players. Entirely imaginary chips.');
  }
  get isPlaying() { return playingStages.includes(this.stage); }
  get currentLevel(): BlindLevel { return this.settings.levels[this.levelIndex]; }
  get pot() { return this.players.reduce((sum,p) => sum + p.totalBet, 0); }
  get contenders() { return this.players.filter(p => p.status === 'active' || p.status === 'all-in'); }
  get actors() { return this.players.filter(p => p.status === 'active' && p.chips > 0); }

  say(text: string, details: Pick<DealerMessage,'kind'|'speech'|'segments'|'afterAward'> = {}) {
    this.dealerMessages.push({ id: randomUUID(), text, at: this.clock(), handNumber: this.handNumber, stage:this.stage, kind:'log', ...details });
    this.dealerMessages = this.dealerMessages.slice(-24);
  }
  private event(data: TableEventData) {
    const now=this.clock();
    const event:TableEvent={...data,id:randomUUID(),sequence:++this.eventSequence,at:now,handNumber:this.handNumber};
    if(this.paced){
      if(data.type==='hand-start')this.presentationReadyAt=now;
      event.presentAt=data.type==='bet'&&data.forced?now+250:Math.max(now,this.presentationReadyAt);
      if(!(data.type==='bet'&&data.forced))this.presentationReadyAt=event.presentAt+motionDuration(event);
    }
    if(data.type==='check'||data.type==='fold')event.speech=actionSpeech(data.type,randomInt(2));
    if(data.type==='bet'&&data.action)event.speech=actionSpeech(data.action,randomInt(2));
    this.tableEvents.push(event);
    this.tableEvents=this.tableEvents.slice(-96);
  }
  player(id: string): Player {
    const p = this.players.find(p => p.id === id);
    if (!p) throw new Error('You are not at this table.');
    return p;
  }
  assertHost(id: string) { if (id !== this.hostId) throw new Error('Only the host can do that.'); }

  addPlayer(name: unknown, avatarId: unknown, options: { spectator?: boolean; bot?: boolean } = {}): Player {
    const cleanName = safeText(name, 24);
    if (!cleanName) throw new Error('Enter your name to take a seat.');
    if (this.players.length >= 64) throw new Error('The table and rail are full.');
    const seats = new Set(this.players.filter(p => p.seat >= 0).map(p => p.seat));
    const registrationOpen = this.stage === 'lobby' || (this.stage !== 'finished' && this.settings.lateRegistration && this.levelIndex + 1 <= this.settings.lateRegistrationUntilLevel);
    const spectator = !!options.spectator || !registrationOpen || seats.size >= this.settings.maxPlayers;
    if (spectator && !this.settings.allowSpectators) throw new Error('This table is full or registration is closed. Spectators are disabled.');
    if (options.bot && spectator) throw new Error('There is no available player seat.');
    const seat = spectator ? -1 : nextFreeSeat(seats);
    const p: Player = {
      id: randomUUID(), token: randomBytes(32).toString('hex'), name: cleanName,
      avatarId: safeText(avatarId, 40).toLowerCase() || 'juan', seat,
      chips: spectator ? 0 : this.settings.startingStack, status: spectator ? 'spectator' : 'waiting',
      connected: true, isBot: !!options.bot, isHost: this.players.length === 0,
      bet: 0, totalBet: 0, holeCards: [], cardCount: 0, lastAction: '', rebuyCount: 0, emote: null,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.say(`${p.name} ${spectator ? 'joined the rail.' : 'took a seat.'}`);
    this.lastActivity = this.clock();
    return p;
  }
  reconnect(token: unknown): Player | null {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const p = this.players.find(p => p.token === token && !p.isBot);
    if (p) { p.connected = true; this.lastActivity = this.clock(); }
    return p ?? null;
  }
  disconnect(id: string) { this.player(id).connected = false; }
  leave(id: string) {
    const p = this.player(id);
    if (this.isPlaying && p.seat >= 0) {
      p.connected = false;
      // Keep the seat and token valid. The hand cannot be escaped to reclaim a stack.
      if (this.turnPlayerId === id && this.availableActions(id)) this.act(id, { type: this.availableActions(id)?.canCheck ? 'check' : 'fold' });
    } else {
      this.players = this.players.filter(other => other.id !== id);
    }
    if (id === this.hostId) {
      const next = this.players.find(other => !other.isBot && other.connected && other.id !== id);
      if (next) { this.hostId = next.id; this.players.forEach(other => { other.isHost = other.id === next.id; }); }
    }
  }
  updateSettings(id: string, input: Partial<GameSettings>) {
    this.assertHost(id);
    if (this.stage !== 'lobby') {
      const allowed = ['roomTheme','dealerVoice','banter','autoNextHand'];
      if (Object.keys(input).some(k => !allowed.includes(k))) throw new Error('Tournament rules are locked after the first deal. Room, voice and banter can still change.');
    }
    const next = validateSettings(input, this.settings);
    const seated = this.players.filter(p => p.seat >= 0);
    if (next.maxPlayers < seated.length) throw new Error('The player limit cannot be lower than the number already seated.');
    this.settings = next;
    if (this.stage === 'lobby') {
      seated.forEach(p => { p.chips = next.startingStack; });
    }
    if (this.stage === 'showdown' && !this.breakEndsAt && 'autoNextHand' in input) {
      this.nextHandAt = next.autoNextHand ? Math.max(this.handReview?.endsAt ?? 0, this.clock()+next.nextHandSeconds*1000) : null;
    }
  }
  start(id: string) {
    this.assertHost(id);
    if (this.stage !== 'lobby') throw new Error('The tournament has already started.');
    if (this.players.filter(p => p.seat >= 0 && p.chips > 0).length < 2) throw new Error('You need at least two players. Invite a friend or add a house bot.');
    this.startedAt = this.clock();
    this.levelEndsAt = this.startedAt + this.currentLevel.minutes * 60000;
    this.startHand();
  }
  nextHand(id: string) {
    this.assertHost(id);
    if (this.paused) throw new Error('Resume the tournament first.');
    if (this.stage !== 'showdown') throw new Error('The current hand has not finished.');
    this.startHand();
  }
  private nextSeat(after: number, candidates: Player[]): Player | undefined {
    return [...candidates].sort((a,b) => clockwiseDistance(after, a.seat) - clockwiseDistance(after, b.seat))[0];
  }
  private post(p: Player, amount: number, streetBet = true, forced = false, spokenAction?: SpokenAction) {
    const paid = Math.min(p.chips, amount);
    p.chips -= paid;
    p.totalBet += paid;
    if (streetBet) p.bet += paid;
    if (p.chips === 0) p.status = 'all-in';
    if(paid>0)this.event({type:'bet',playerId:p.id,amount:paid,to:p.bet,forced,...(!forced&&spokenAction?{action:p.status==='all-in'?'all-in':spokenAction}:{})});
    return paid;
  }
  private advanceLevels(now: number) {
    if (this.breakEndsAt && now < this.breakEndsAt) throw new Error('The table is on a scheduled break.');
    if (this.breakEndsAt) { this.breakEndsAt = null; this.say('Break’s over. Return to your questionable decisions.'); }
    while (this.levelEndsAt && now >= this.levelEndsAt && this.levelIndex < this.settings.levels.length - 1) {
      this.levelIndex++;
      if (this.settings.breakEveryLevels > 0 && this.levelIndex % this.settings.breakEveryLevels === 0) {
        this.breakEndsAt = now + this.settings.breakMinutes * 60000;
        this.levelEndsAt = this.breakEndsAt + this.currentLevel.minutes * 60000;
        this.nextHandAt = this.breakEndsAt;
        this.say(`A ${this.settings.breakMinutes} minute break. Stretch your legs. Protect your crisps.`);
        return false;
      }
      this.levelEndsAt += this.currentLevel.minutes * 60000;
      this.say(`Blinds are now ${this.currentLevel.small} and ${this.currentLevel.big}${this.currentLevel.ante ? `, with an ante of ${this.currentLevel.ante}` : ''}.`);
    }
    if (this.levelIndex === this.settings.levels.length - 1 && this.levelEndsAt && now >= this.levelEndsAt) this.levelEndsAt = null;
    return true;
  }
  startHand() {
    if (this.isPlaying || this.stage === 'finished') throw new Error('Cannot deal a new hand right now.');
    if (this.paused) throw new Error('The tournament is paused.');
    if (this.paced && this.clock()<this.presentationReadyAt) throw new Error('Let the chips settle before the next hand.');
    if (this.paced && this.handReview && this.clock()<this.handReview.endsAt) throw new Error('Give the table a moment to show or muck.');
    if (!this.advanceLevels(this.clock())) return;
    const playing = this.players.filter(p => p.seat >= 0 && p.chips > 0 && p.status !== 'spectator');
    if (playing.length < 2) {
      this.nextHandAt = null;
      if (this.players.some(p => this.canRebuy(p.id))) this.say('Waiting for a rebuy. The rail has one last chance.');
      else this.finishTournament();
      return;
    }
    this.stage = 'preflop';
    this.handNumber++;
    this.allInAnnounced = false;
    this.board = [];
    this.deck = this.makeDeck();
    if (this.deck.length !== 52 || new Set(this.deck).size !== 52) throw new Error('The deck is invalid.');
    this.winners = [];
    this.settledPots = [];
    this.reveal.clear();
    this.mucked.clear();
    this.handReview = null;
    this.reviewOpened = false;
    this.reviewClosed = false;
    this.nextHandAt = null;
    this.currentBet = this.currentLevel.big;
    this.handBigBlind = this.currentLevel.big;
    this.lastFullRaise = this.handBigBlind;
    this.acted.clear();
    for (const p of this.players) {
      p.holeCards = []; p.cardCount = 0; p.bet = 0; p.totalBet = 0; p.lastAction = ''; p.emote = null;
      if (playing.includes(p)) p.status = 'active';
      else if (p.seat >= 0 && p.chips === 0) p.status = 'out';
    }
    // Moving button: the next occupied seat gets the button. Heads-up button is the small blind.
    const dealer = this.dealerSeat < 0 ? playing[0] : this.nextSeat(this.dealerSeat, playing)!;
    this.dealerSeat = dealer.seat;
    this.dealerId = dealer.id;
    const small = playing.length === 2 ? dealer : this.nextSeat(dealer.seat, playing)!;
    const big = this.nextSeat(small.seat, playing)!;
    this.smallBlindId = small.id;
    this.bigBlindId = big.id;
    const dealOrder = [...playing].sort((a,b) => clockwiseDistance(dealer.seat, a.seat) - clockwiseDistance(dealer.seat, b.seat));
    for (let round=0;round<2;round++) for (const p of dealOrder) p.holeCards.push(this.deck.pop()!);
    this.event({type:'hand-start',playerIds:dealOrder.map(p=>p.id)});
    for (const p of playing) {
      p.cardCount = 2;
      if (this.currentLevel.ante) this.post(p, this.currentLevel.ante, false, true);
    }
    this.post(small, this.currentLevel.small, true, true);
    this.post(big, this.currentLevel.big, true, true);
    small.lastAction = 'Small blind'; big.lastAction = 'Big blind';
    this.pending = new Set(this.actors.map(p => p.id));
    this.say(`Hand ${this.handNumber} · ${dealer.name} has the button. ${small.name}: small blind. ${big.name}: big blind.`, {kind:'hand-start',speech:this.settings.banter?this.dialogue.pick('newHand'):PLAIN_HAND_START});
    this.advanceAction(big.seat);
  }
  availableActions(id: string): AvailableActions | null {
    if (!this.isPlaying || this.paused || this.turnPlayerId !== id || (this.turnStartsAt !== null && this.clock() < this.turnStartsAt)) return null;
    const p = this.player(id);
    if (p.status !== 'active') return null;
    const prior = this.acted.get(id);
    const rightsOpen = !prior || this.currentBet - prior.bet >= prior.raiseSize;
    const anotherCanCall = this.actors.some(other => other.id !== id);
    const maxRaiseTo = p.chips + p.bet;
    // A short opening all-in is not "completed" in no-limit: a raise adds a full minimum bet.
    const minRaiseTo = this.currentBet + this.lastFullRaise;
    const callAmount = Math.max(0, Math.min(p.chips, this.currentBet - p.bet));
    return {
      canFold: true, canCheck: p.bet >= this.currentBet, canCall: callAmount > 0,
      canRaise: rightsOpen && anotherCanCall && maxRaiseTo > this.currentBet,
      callAmount, minRaiseTo, maxRaiseTo,
    };
  }
  act(id: string, action: PokerAction) {
    if (!action || typeof action !== 'object') throw new Error('Invalid action.');
    const choices = this.availableActions(id);
    if (!choices) throw new Error(this.paused ? 'The tournament is paused.' : 'It is not your turn.');
    const p = this.player(id);
    const kind = action.type;
    if (kind === 'fold') {
      p.status = 'folded'; p.lastAction = 'Fold';
      this.event({type:'fold',playerId:id});
    } else if (kind === 'check') {
      if (!choices.canCheck) throw new Error('There is a bet to call.');
      p.lastAction = 'Check';
      this.event({type:'check',playerId:id});
    } else if (kind === 'call' || (kind === 'all-in' && choices.maxRaiseTo <= this.currentBet)) {
      if (!choices.canCall) throw new Error('There is no bet to call.');
      const paid = this.post(p, choices.callAmount, true, false, 'call');
      p.lastAction = p.status === 'all-in' ? `All in · ${paid}` : `Call · ${paid}`;
    } else if (kind === 'raise' || kind === 'all-in') {
      if (!choices.canRaise) throw new Error('Raising is not available. A short all-in does not reopen a completed action.');
      const to = kind === 'all-in' ? choices.maxRaiseTo : integer((action as {amount:number}).amount, 'Raise total', 1, choices.maxRaiseTo);
      if (to <= this.currentBet) throw new Error('A raise must exceed the current bet.');
      if (to < choices.minRaiseTo && to !== choices.maxRaiseTo) throw new Error(`Minimum raise is to ${choices.minRaiseTo}, or move all in.`);
      const fullRaise = to >= choices.minRaiseTo;
      const previousBet = this.currentBet;
      if (fullRaise) this.lastFullRaise = to - previousBet;
      this.post(p, to - p.bet, true, false, previousBet === 0 ? 'bet' : 'raise');
      this.currentBet = to;
      p.lastAction = p.status === 'all-in' ? `All in · ${to}` : `${previousBet === 0 ? 'Bet' : 'Raise to'} · ${to}`;
      for (const other of this.actors) if (other.id !== id && other.bet < to) this.pending.add(other.id);
    } else throw new Error('Unknown poker action.');
    this.acted.set(id, { bet: this.currentBet, raiseSize: this.lastFullRaise });
    this.pending.delete(id);
    this.lastActivity = this.clock();
    if (p.status === 'all-in' && !this.allInAnnounced) { this.allInAnnounced=true; this.say(`${p.name} is all in.`); }
    this.advanceAction(p.seat);
  }
  private setTurn(p: Player | undefined) {
    this.turnPlayerId = p?.id ?? null;
    this.turnId = p ? randomUUID() : null;
    this.turnStartsAt = p ? Math.max(this.clock(),this.paced?this.presentationReadyAt:0) : null;
    this.turnPending = !!p && this.turnStartsAt!>this.clock();
    this.turnEndsAt = p ? this.turnStartsAt! + this.settings.turnSeconds * 1000 : null;
    this.botActAt = p?.isBot ? this.turnStartsAt! + 1700 + randomInt(1600) : null;
  }
  private advanceAction(afterSeat: number) {
    if (this.contenders.length === 1) { this.settleHand(false); return; }
    for (const id of this.pending) if (this.player(id).status !== 'active') this.pending.delete(id);
    const actors = this.actors;
    // With no possible side betting, only an outstanding call/fold decision remains.
    if (actors.length <= 1) {
      // A short big blind does not require the lone remaining player to call a fictional full blind.
      this.currentBet = Math.max(0,...this.contenders.map(p => p.bet));
      for (const p of actors) if (p.bet >= this.currentBet) this.pending.delete(p.id);
    }
    const next = this.nextSeat(afterSeat, actors.filter(p => this.pending.has(p.id)));
    if (next) { this.setTurn(next); return; }
    this.setTurn(undefined);
    this.refundUncalled();
    if(this.contenders.length>=2 && this.actors.length<=1 && !this.tableEvents.some(e=>e.handNumber===this.handNumber&&e.type==='all-in')) {
      this.event({type:'all-in',players:this.contenders.map(p=>({playerId:p.id,cards:[...p.holeCards]})),board:[...this.board]});
      for(const p of this.contenders)this.reveal.add(p.id);
    }
    if (this.stage === 'river') { this.settleHand(true); return; }
    this.advanceStreet();
  }
  private refundUncalled() {
    const ordered = [...this.players].filter(p => p.holeCards.length).sort((a,b) => b.bet-a.bet);
    const highest = ordered[0];
    if (!highest || highest.status === 'folded') return;
    const unmatched = highest.bet - (ordered[1]?.bet ?? 0);
    if (unmatched > 0) {
      highest.bet -= unmatched; highest.totalBet -= unmatched; highest.chips += unmatched;
      if (highest.status === 'all-in') highest.status = 'active';
    }
  }
  private advanceStreet() {
    this.deck.pop(); // Burn one before every community-card street.
    if (this.stage === 'preflop') {
      this.stage = 'flop'; this.board.push(this.deck.pop()!,this.deck.pop()!,this.deck.pop()!);
      const intro=this.dialogue.pick('flop');this.say(`${intro} ${this.board.map(cardWords).join(', ')}.`,{kind:'street',segments:[intro,...this.board.map(c=>cardWords(c)+'.')]});
    } else if (this.stage === 'flop') {
      this.stage = 'turn'; this.board.push(this.deck.pop()!);
      const intro=this.dialogue.pick('turn');this.say(`${intro} ${cardWords(this.board[3])}.`,{kind:'street',segments:[intro,cardWords(this.board[3])+'.']});
    } else if (this.stage === 'turn') {
      this.stage = 'river'; this.board.push(this.deck.pop()!);
      const intro=this.dialogue.pick('river');this.say(`${intro} ${cardWords(this.board[4])}.`,{kind:'street',segments:[intro,cardWords(this.board[4])+'.']});
    }
    this.event({type:'street',stage:this.stage as 'flop'|'turn'|'river',board:[...this.board],runout:this.actors.length<=1});
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.lastFullRaise = this.handBigBlind;
    this.acted.clear();
    this.pending = new Set(this.actors.map(p => p.id));
    this.advanceAction(this.dealerSeat);
  }
  buildPots(): Pot[] {
    const thresholds = [...new Set(this.players.map(p => p.totalBet).filter(n => n > 0))].sort((a,b) => a-b);
    let previous = 0;
    const pots: Pot[] = [];
    for (const threshold of thresholds) {
      const contributors = this.players.filter(p => p.totalBet >= threshold);
      const eligible = contributors.filter(p => p.status !== 'folded' && p.holeCards.length === 2).map(p => p.id);
      const amount = (threshold-previous) * contributors.length;
      if (amount) pots.push({ amount, eligible });
      previous = threshold;
    }
    return pots;
  }
  private settleHand(showdown: boolean) {
    this.setTurn(undefined);
    this.refundUncalled();
    const contenders = this.contenders;
    const pots = this.buildPots();
    this.settledPots = pots;
    const solutions = new Map<string,SolvedHand>();
    if (showdown) for (const p of contenders) {
      solutions.set(p.id, Hand.solve([...p.holeCards,...this.board]));
    }
    const awards = new Map<string,Winner>();
    for (const pot of pots) {
      let eligible = contenders.filter(p => pot.eligible.includes(p.id));
      if (!eligible.length) eligible = contenders; // Dead chips belong to the remaining live hand(s).
      const best = showdown ? Hand.winners(eligible.map(p => solutions.get(p.id)!)) : [];
      const winning = showdown ? eligible.filter(p => best.includes(solutions.get(p.id)!)) : eligible;
      // Tied odd chips are awarded clockwise from the button, not by insertion order.
      winning.sort((a,b) => clockwiseDistance(this.dealerSeat, a.seat) - clockwiseDistance(this.dealerSeat, b.seat));
      winning.forEach((p,index) => {
        const amount = Math.floor(pot.amount / winning.length) + (index < pot.amount % winning.length ? 1 : 0);
        p.chips += amount;
        const previous = awards.get(p.id);
        awards.set(p.id, { playerId:p.id, amount:(previous?.amount ?? 0)+amount, hand: showdown ? solutions.get(p.id)!.descr : 'Everyone folded' });
      });
    }
    this.winners = [...awards.values()];
    // A winning contested hand must be tabled. Other hidden hands remain a choice.
    if (showdown) {
      for (const winner of this.winners) this.reveal.add(winner.playerId);
      this.event({type:'showdown',playerIds:contenders.map(p=>p.id)});
    }
    this.event({type:'award',winners:this.winners.map(w=>({...w})),pot:pots.reduce((sum,p)=>sum+p.amount,0)});
    const ending=this.winners.length>1&&pots.length===1?'split':showdown?'handEnd':'uncontested';
    this.say(`Hand ${this.handNumber} complete.`,{kind:'hand-end',speech:this.winners.length>1&&pots.length>1?SIDE_POT_END:this.settings.banter?this.dialogue.pick(ending):PLAIN_HAND_END});
    const result=this.winners.map(award=>`${this.player(award.playerId).name} wins ${award.amount.toLocaleString('en-GB')} chips${showdown ? ` with ${award.hand}` : ', without showing a card'}.`).join(' ');
    // One combined result, with occasional dry wit; no separate speech for every elimination.
    const quip=this.settings.banter&&this.handNumber%3===0?this.dialogue.pick('resultQuips'):'';
    const winningRank=showdown ? Math.max(...this.winners.map(w=>{
      const hand=solutions.get(w.playerId)!;
      return hand.descr === 'Royal Flush' ? 10 : hand.rank;
    })) : 0;
    this.say(result,{kind:'result',segments:[RESULT_LINES[winningRank] || RESULT_LINES[0],...(quip?[quip]:[])]});
    for (const p of this.players) {
      if (p.seat >= 0 && p.chips === 0) {
        p.status = 'out';
        this.say(`${p.name} is on the rail. The banter lives on.`,{afterAward:true});
      }
    }
    this.stage = 'showdown';
    const settledAt = this.paced ? this.presentationReadyAt : this.clock() + burstDuration(this.tableEvents,this.handNumber,this.clock()) + 2200;
    const revealEvent = this.tableEvents.find(e=>e.handNumber===this.handNumber && e.type==='showdown');
    const awardEvent = this.tableEvents.at(-1)!;
    this.handReview = {
      startsAt: this.paced ? (revealEvent?.presentAt ?? awardEvent.presentAt ?? settledAt) : this.clock(),
      endsAt: settledAt + Math.max(8, this.settings.nextHandSeconds) * 1000,
      playerIds: contenders.map(p=>p.id), contested: showdown,
    };
    this.nextHandAt = this.settings.autoNextHand ? this.handReview.endsAt : null;
    const remaining = this.players.filter(p => p.seat >= 0 && p.chips > 0);
    if (remaining.length === 1 && !this.players.some(p => this.canRebuy(p.id))) this.finishTournament();
  }
  private finishTournament() {
    this.stage = 'finished'; this.nextHandAt = null; this.setTurn(undefined); this.levelEndsAt = null;
    const champion = this.players.filter(p => p.seat >= 0).sort((a,b) => b.chips-a.chips)[0];
    if (champion) this.say(`${champion.name} takes the tournament!`,{kind:'champion',speech:this.dialogue.pick('champion')});
  }
  chooseCards(id: string, choice: unknown, handNumber: unknown) {
    if (handNumber !== this.handNumber) throw new Error('Those cards belong to an earlier hand.');
    if (choice !== 'show' && choice !== 'muck') throw new Error('Choose show or muck.');
    const p = this.player(id), review = this.handReview, now = this.clock();
    if (this.paused || !review || now<review.startsAt || now>=review.endsAt || !['showdown','finished'].includes(this.stage)) throw new Error('The show or muck window is closed.');
    if (p.seat<0 || p.holeCards.length!==2 || this.reveal.has(id) || this.mucked.has(id)) throw new Error('These cards have already been shown or mucked.');
    if (choice==='show') this.reveal.add(id); else this.mucked.add(id);
    this.say(`${p.name} ${choice==='show'?'shows their cards.':'mucks their cards.'}`);
    this.lastActivity = now;
  }
  canRebuy(id: string): boolean {
    const p = this.player(id);
    return this.settings.rebuys && !this.isPlaying && this.stage !== 'finished' && p.seat >= 0 && p.chips === 0 && p.rebuyCount < this.settings.maxRebuys && this.levelIndex+1 <= this.settings.rebuyUntilLevel;
  }
  rebuy(id: string) {
    if (!this.canRebuy(id)) throw new Error('Rebuys are not available. They must be enabled, within the rebuy levels, and between hands.');
    const p = this.player(id);
    p.chips = this.settings.startingStack; p.rebuyCount++; p.status = 'waiting';
    this.say(`${p.name} is back with ${p.chips.toLocaleString('en-GB')} more imaginary chips. A bold sequel.`);
    if (this.stage === 'showdown' && !this.nextHandAt && this.settings.autoNextHand) this.nextHandAt = Math.max(this.handReview?.endsAt ?? 0, this.clock()+this.settings.nextHandSeconds*1000);
  }
  pause(id: string, value: boolean) {
    this.assertHost(id);
    if (typeof value !== 'boolean') throw new Error('Invalid pause state.');
    if (value === this.paused) return;
    const now = this.clock();
    if (value) { this.pauseStartedAt = now; this.paused = true; this.say('Table paused. Hands off the crisps.'); }
    else {
      const delay = now-(this.pauseStartedAt ?? now);
      if (this.turnEndsAt) this.turnEndsAt += delay;
      if (this.turnStartsAt) this.turnStartsAt += delay;
      this.presentationReadyAt += delay;
      for(const event of this.tableEvents)if(event.presentAt && event.presentAt+motionDuration(event)>this.pauseStartedAt!)event.presentAt+=delay;
      if (this.levelEndsAt) this.levelEndsAt += delay;
      if (this.nextHandAt) this.nextHandAt += delay;
      if (this.handReview) { this.handReview.startsAt += delay; this.handReview.endsAt += delay; }
      if (this.breakEndsAt) this.breakEndsAt += delay;
      if (this.botActAt) this.botActAt += delay;
      this.paused = false; this.pauseStartedAt = null;
      this.say('We’re back. Put your poker face on.');
    }
  }
  emote(id: string, type: Emote) {
    if (!this.settings.banter) throw new Error('Banter is disabled at this table.');
    if (!Object.prototype.hasOwnProperty.call(emotes,type)) throw new Error('Unknown reaction.');
    const p = this.player(id);
    if (p.emote && this.clock()-p.emote.at < 2000) throw new Error('Give your audience a moment.');
    p.emote = {type,at:this.clock(),text:emotes[type][randomInt(emotes[type].length)]};
  }
  sendChat(id: string, value: unknown) {
    const p = this.player(id);
    const text = safeText(value,280);
    if (!text) throw new Error('Write something first.');
    const isRail = p.status === 'out' || p.status === 'spectator' || p.status === 'waiting' && this.isPlaying;
    this.chat.push({id:randomUUID(),playerId:id,name:p.name,text,channel:isRail && this.settings.spectatorChat === 'separate' ? 'spectators' : 'table',at:this.clock()});
    this.chat = this.chat.slice(-100);
  }
  tick(): boolean {
    const now = this.clock();
    if (this.paused) return false;
    if (this.handReview && !this.reviewClosed) {
      if (now>=this.handReview.endsAt) {
        this.reviewClosed=true;
        for (const p of this.players) if (p.holeCards.length && !this.reveal.has(p.id)) this.mucked.add(p.id);
        if (this.stage === 'showdown' && this.nextHandAt && now>=this.nextHandAt) this.startHand();
        return true;
      }
      if (!this.reviewOpened && now>=this.handReview.startsAt) { this.reviewOpened=true; return true; }
    }
    if (this.isPlaying && this.turnPlayerId) {
      const id = this.turnPlayerId;
      if (this.turnPending && now>=this.turnStartsAt!) { this.turnPending=false; return true; }
      if (this.turnStartsAt && now<this.turnStartsAt) return false;
      if (this.botActAt && now >= this.botActAt) { this.act(id,this.botAction(id)); return true; }
      if (this.turnEndsAt && now >= this.turnEndsAt) {
        this.act(id,{type:this.availableActions(id)?.canCheck ? 'check' : 'fold'});
        this.say(`${this.player(id).name} ran out of time. The dealer ${this.player(id).lastAction === 'Check' ? 'checks' : 'folds'} for them.`);
        return true;
      }
    }
    if (this.stage === 'showdown' && this.nextHandAt && now >= this.nextHandAt) { this.startHand(); return true; }
    return false;
  }
  botAction(id: string): PokerAction {
    const p = this.player(id);
    const actions = this.availableActions(id)!;
    // House bots see only their own cards and the public board. They never inspect the deck or another hand.
    const ranks = p.holeCards.map(c => '23456789TJQKA'.indexOf(c[0])+2);
    const pair = ranks[0] === ranks[1];
    const strength = this.board.length >= 3 ? Hand.solve([...p.holeCards,...this.board]).rank / 9 : (pair ? 0.7 : Math.max(...ranks)/22);
    const roll = randomInt(100)/100;
    if (actions.canRaise && (roll < 0.1 || strength > 0.65 && roll < 0.35)) {
      const to = Math.min(actions.maxRaiseTo, Math.max(actions.minRaiseTo, this.currentBet + Math.max(this.handBigBlind,Math.floor(this.pot*0.45))));
      return {type:'raise',amount:to};
    }
    if (actions.canCheck) return {type:'check'};
    if (actions.callAmount > Math.max(this.handBigBlind*3,p.chips*0.22) && strength < 0.45 && roll < 0.72) return {type:'fold'};
    return {type:'call'};
  }
  viewFor(id: string): RoomState {
    const viewer = this.player(id);
    const isRail = viewer.status === 'out' || viewer.status === 'spectator' || viewer.status === 'waiting' && this.isPlaying;
    const reviewOpen = !!this.handReview && this.clock()>=this.handReview.startsAt && this.clock()<this.handReview.endsAt;
    const canChoose = reviewOpen && !this.paused && viewer.seat>=0 && viewer.holeCards.length===2 && !this.reveal.has(id) && !this.mucked.has(id);
    const players: PublicPlayer[] = this.players.map(p => ({
      id:p.id,name:p.name,avatarId:p.avatarId,seat:p.seat,chips:p.chips,status:p.status,connected:p.connected,
      isBot:p.isBot,isHost:p.id === this.hostId,bet:p.bet,totalBet:p.totalBet,
      holeCards:p.id === id || this.reveal.has(p.id) ? [...p.holeCards] : [],cardCount:p.cardCount,
      disclosure:this.reveal.has(p.id)?'shown':this.mucked.has(p.id)?'mucked':'hidden',
      lastAction:p.lastAction,rebuyCount:p.rebuyCount,
      // Rail gestures cannot communicate live-hand information to seated opponents.
      emote:!isRail && this.settings.spectatorChat === 'separate' && (p.status === 'out' && !(reviewOpen && p.holeCards.length===2) || p.status === 'spectator' || p.status === 'waiting') ? null : p.emote ? {...p.emote} : null,
    }));
    return {
      code:this.code,settings:structuredClone(this.settings),hostId:this.hostId,you:id,stage:this.stage,players,
      board:[...this.board],pot:this.pot,pots:this.isPlaying ? this.buildPots() : structuredClone(this.settledPots),currentBet:this.currentBet,
      dealerId:this.dealerId,smallBlindId:this.smallBlindId,bigBlindId:this.bigBlindId,
      turnPlayerId:this.turnPlayerId,turnId:this.turnId,turnStartsAt:this.paced?this.turnStartsAt:null,turnEndsAt:this.turnEndsAt,handNumber:this.handNumber,
      levelIndex:this.levelIndex,currentLevel:{...this.currentLevel},levelEndsAt:this.levelEndsAt,
      paused:this.paused,pausedAt:this.pauseStartedAt,breakEndsAt:this.breakEndsAt,nextHandAt:this.nextHandAt,
      handReview:this.handReview ? structuredClone(this.handReview) : null, canShowCards:canChoose, canMuckCards:canChoose,
      tableEvents:structuredClone(this.tableEvents),
      winners:this.winners.map(w => ({...w})),dealerMessages:this.dealerMessages.map(m => ({...m})),
      chat:this.chat.filter(m => m.channel === 'table' || isRail).map(m => ({...m})),
      actions:this.availableActions(id),canRebuy:this.canRebuy(id),startedAt:this.startedAt,
    };
  }
}
