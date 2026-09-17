import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Server, type Socket } from 'socket.io';
import { PokerRoom } from './engine.js';
import { registerVoiceRoutes } from './voice.js';
import type { Ack, CreateRoomRequest, Emote, GameSettings, JoinRoomRequest, PokerAction } from '../shared/types.js';

interface Identity { roomCode: string; playerId: string }
type Reply = (response: Ack) => void;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const avatarIds = ['juan','tian','humfrey','diego','jack','clive','doug','nat'];
const botNames = ['Sir Bluffington','The River Rat','Foldemort','Chip Happens','Lady Luckless','All-in Alan','Count Callula','The Limp Biscuit','Betty Bet','Professor Tilt','Check Norris'];

export function createPokerServer(options: { tickMs?: number; serveStatic?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
  const io = new Server(http, {
    cors: { origin: allowedOrigins?.length ? allowedOrigins : true, methods:['GET','POST'] },
    maxHttpBufferSize: 16_384, pingTimeout: 20_000, pingInterval:25_000,
  });
  const rooms = new Map<string,PokerRoom>();
  const identities = new Map<string,Identity>();
  const connections = new Map<string,string>();
  const createCounts = new Map<string,{ count: number; until: number }>();

  registerVoiceRoutes(app,rooms);
  app.get('/api/health', (_req,res) => res.json({ok:true,game:'Big Money Big Players',mode:'play-money'}));
  if (options.serveStatic !== false) {
    const dist = resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
    if (existsSync(dist)) {
      app.use(express.static(dist));
      // Express 4/5-compatible SPA fallback; never let a missing API masquerade as HTML.
      app.use((req,res,next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')) res.sendFile(resolve(dist,'index.html'));
        else next();
      });
    }
  }
  function broadcast(room: PokerRoom) {
    for (const [socketId, identity] of identities) if (identity.roomCode === room.code) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && room.players.some(p => p.id === identity.playerId)) socket.emit('room-state',room.viewFor(identity.playerId));
    }
  }
  function identify(socket: Socket): { room: PokerRoom; playerId: string } {
    const identity = identities.get(socket.id);
    const room = identity && rooms.get(identity.roomCode);
    if (!identity || !room) throw new Error('Join a table first.');
    return {room,playerId:identity.playerId};
  }
  function disconnectIdentity(socket: Socket, explicit: boolean) {
    const identity = identities.get(socket.id);
    if (!identity) return;
    const key = `${identity.roomCode}:${identity.playerId}`;
    const room = rooms.get(identity.roomCode);
    identities.delete(socket.id);
    // A stale socket must not disconnect its replacement after token-based reconnect.
    if (connections.get(key) !== socket.id) return;
    connections.delete(key);
    if (room && room.players.some(p => p.id === identity.playerId)) {
      if (explicit) room.leave(identity.playerId); else room.disconnect(identity.playerId);
      broadcast(room);
    }
  }
  function attach(socket: Socket, room: PokerRoom, playerId: string) {
    const current = identities.get(socket.id);
    if (current && (current.roomCode !== room.code || current.playerId !== playerId)) disconnectIdentity(socket,false);
    const key = `${room.code}:${playerId}`;
    const previousId = connections.get(key);
    if (previousId && previousId !== socket.id) {
      const previous = io.sockets.sockets.get(previousId);
      identities.delete(previousId);
      previous?.emit('session-replaced',{message:'Your seat was opened in another tab.'});
      previous?.disconnect(true);
    }
    identities.set(socket.id,{roomCode:room.code,playerId});
    connections.set(key,socket.id);
    room.player(playerId).connected = true;
  }
  function code() {
    let result: string;
    do { result = Array.from({length:6},() => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(result));
    return result;
  }
  io.on('connection', socket => {
    let recentEvents: number[] = [];
    let lastChatAt = 0;
    const handle = (event: string, callback: (payload: any) => Ack | void) => {
      socket.on(event,(payload: unknown, reply?: Reply) => {
        // Support both emit(event, payload, ack) and emit(event, ack).
        const ack = typeof payload === 'function' ? payload as Reply : typeof reply === 'function' ? reply : undefined;
        try {
          const now = Date.now();
          recentEvents = recentEvents.filter(at => now-at < 1000);
          if (recentEvents.length >= 20) throw new Error('Too many requests. Give the table a second.');
          recentEvents.push(now);
          const result = callback(typeof payload === 'function' ? undefined : payload);
          ack?.(result ?? {ok:true});
          const identity = identities.get(socket.id);
          const room = identity && rooms.get(identity.roomCode);
          if (room) broadcast(room);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'That action could not be completed.';
          ack?.({ok:false,error:message});
          if (!ack) socket.emit('game-error',{message});
        }
      });
    };
    handle('create-room',(payload: CreateRoomRequest) => {
      if (!payload || typeof payload !== 'object') throw new Error('Enter your name and choose a character.');
      const ip = socket.handshake.address;
      const count = createCounts.get(ip);
      const now = Date.now();
      if (count && now < count.until && count.count >= 20) throw new Error('You have made quite a few tables. Please use one you already created.');
      if (rooms.size >= 200) throw new Error('The clubhouse is full. Try again shortly.');
      const room = new PokerRoom(code(),payload.settings,{paced:true});
      const player = room.addPlayer(payload.name,payload.avatarId);
      rooms.set(room.code,room);
      createCounts.set(ip,{count:count && now < count.until ? count.count+1 : 1,until:count && now < count.until ? count.until : now+600000});
      attach(socket,room,player.id);
      return {ok:true,roomCode:room.code,token:player.token,playerId:player.id};
    });
    handle('join-room',(payload: JoinRoomRequest) => {
      if (!payload || typeof payload.roomCode !== 'string') throw new Error('Enter a valid invite code.');
      const roomCode = payload.roomCode.trim().toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) throw new Error('That table is not here. Check the invite code, or ask the host to create a new table.');
      let player = payload.token ? room.reconnect(payload.token) : null;
      if (payload.token && !player) throw new Error('Your saved seat could not be restored. Join again with your name.');
      if (!player) player = room.addPlayer(payload.name,payload.avatarId,{spectator:payload.spectator});
      attach(socket,room,player.id);
      return {ok:true,roomCode:room.code,token:player.token,playerId:player.id};
    });
    handle('action',(payload: PokerAction) => {
      const {room,playerId} = identify(socket);
      if (!payload?.turnId || payload.turnId !== room.turnId) throw new Error('That turn has already moved on. Refresh the table state before acting.');
      room.act(playerId,payload);
    });
    handle('update-settings',(payload: Partial<GameSettings>) => { const {room,playerId} = identify(socket); room.updateSettings(playerId,payload); });
    handle('start-game',() => { const {room,playerId} = identify(socket); room.start(playerId); });
    handle('next-hand',() => { const {room,playerId} = identify(socket); room.nextHand(playerId); });
    handle('pause-game',(payload: {paused:boolean}) => { const {room,playerId} = identify(socket); room.pause(playerId,payload?.paused); });
    handle('add-bot',(payload?: {name?:string;avatarId?:string}) => {
      const {room,playerId} = identify(socket);
      room.assertHost(playerId);
      const index = room.players.filter(p => p.isBot).length;
      room.addPlayer(payload?.name || botNames[index%botNames.length],payload?.avatarId || avatarIds[(index+1)%avatarIds.length],{bot:true});
    });
    handle('emote',(payload: {type:Emote}) => { const {room,playerId} = identify(socket); room.emote(playerId,payload?.type); });
    handle('chat',(payload: {text:string}) => {
      if (Date.now()-lastChatAt < 700) throw new Error('One message at a time, Shakespeare.');
      const {room,playerId} = identify(socket); room.sendChat(playerId,payload?.text); lastChatAt = Date.now();
    });
    handle('rebuy',() => { const {room,playerId} = identify(socket); room.rebuy(playerId); });
    handle('leave-room',() => { disconnectIdentity(socket,true); });
    handle('request-state',() => {
      const {room,playerId} = identify(socket);
      return {ok:true,roomCode:room.code,playerId,token:room.player(playerId).token};
    });
    socket.on('disconnect',() => disconnectIdentity(socket,false));
  });
  const interval = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      // Empty rooms are transient by design. No name, token or hole card is written to logs.
      const hasHumans = room.players.some(p => !p.isBot && p.connected);
      if (!hasHumans && now-room.lastActivity > 6*60*60*1000) { rooms.delete(room.code); continue; }
      try { if (room.tick()) broadcast(room); }
      catch (error) { console.error(`Table ${room.code} tick error:`,error instanceof Error ? error.message : 'Unknown engine failure'); room.paused = true; room.say('The table is paused while the host checks the game.'); broadcast(room); }
    }
    for (const [ip,value] of createCounts) if (now > value.until) createCounts.delete(ip);
  },options.tickMs ?? 250);
  interval.unref();
  return {
    app,http,io,rooms,broadcast,
    async close() { clearInterval(interval); await new Promise<void>(resolveClose => io.close(() => resolveClose())); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPokerServer();
  const port = Number(process.env.PORT) || 3001;
  server.http.listen(port,'0.0.0.0',() => console.log(`Big Money Big Players is dealing on http://localhost:${port}`));
  const shutdown = async () => { await server.close(); process.exit(0); };
  process.on('SIGTERM',shutdown);
  process.on('SIGINT',shutdown);
}
