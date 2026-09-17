import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, RoomState } from '../../shared/types';
import { readStored, removeStored, writeStored } from './storage';

const urlCode = () => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
const seatKey = (code: string) => `bigmoney:${code}`;
const invalidSeat = (error?: string) => /saved seat could not be restored|table is not here/i.test(error || '');
const noIdentity = (error?: string) => error === 'Join a table first.';
function updateUrl(code?: string) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code); else url.searchParams.delete('room');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
type Response = Ack & { timedOut?: boolean };
function emitAck(socket: Socket, event: string, payload: unknown): Promise<Response> {
  return new Promise(resolve => {
    socket.timeout(7000).emit(event, payload, (error: Error | null, ack?: Ack) => {
      if (error || typeof ack?.ok !== 'boolean') resolve({ ok: false, timedOut: true });
      else resolve(ack);
    });
  });
}
function saveSeat(ack: Ack) {
  if (ack.ok && ack.roomCode && ack.token) {
    writeStored(seatKey(ack.roomCode), ack.token);
    updateUrl(ack.roomCode);
  }
}

export function usePoker() {
  const socket = useRef<Socket | null>(null);
  const snapshot = useRef<RoomState | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const acceptSnapshots = useRef(true);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState(urlCode);

  const loseSeat = useCallback((code: string, message?: string) => {
    acceptSnapshots.current = false;
    snapshot.current = null;
    setRoom(null);
    setJoinCode(code);
    if (invalidSeat(message)) removeStored(seatKey(code));
  }, []);

  useEffect(() => {
    const s = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: true });
    let replaced = false;
    socket.current = s;
    s.on('connect', async () => {
      if (socket.current !== s) return;
      const code = urlCode();
      const token = code && readStored(seatKey(code));
      acceptSnapshots.current = true;
      if (!code || !token) { setConnected(true); return; }
      // A working transport is not yet a restored seat.
      setConnected(false);
      const attempt = ++generation.current;
      pending.current = true;
      setBusy(true);
      let ack = await emitAck(s, 'join-room', { roomCode: code, token });
      if (socket.current !== s || generation.current !== attempt) return;
      if (ack.timedOut && s.connected) ack = await emitAck(s, 'request-state', {});
      if (socket.current !== s || generation.current !== attempt) return;
      pending.current = false;
      setBusy(false);
      setConnected(s.connected);
      if (ack.ok) { saveSeat(ack); setJoinCode(''); setError(''); }
      else {
        loseSeat(code, ack.error);
        setError(ack.error || 'Could not confirm your saved seat. Your token is safe; try joining again when connected.');
      }
    });
    s.on('disconnect', (reason: string) => {
      ++generation.current;
      pending.current = false;
      setConnected(false);
      setBusy(false);
      // Remove stale betting controls immediately while retaining the scene and stacks.
      if (snapshot.current) {
        snapshot.current = { ...snapshot.current, actions: null, turnId: null };
        setRoom(snapshot.current);
      }
      // This tab can still host another table, without stealing the old seat back.
      if (replaced && reason === 'io server disconnect') { replaced = false; s.connect(); }
    });
    s.on('session-replaced', (payload?: { message?: string }) => {
      replaced = true;
      loseSeat('');
      updateUrl();
      // Do not remove localStorage: the replacement tab uses the same seat token.
      setError(payload?.message || 'Your seat was opened in another tab. This tab has left the table.');
    });
    s.on('room-state', (state: RoomState) => {
      if (!acceptSnapshots.current || socket.current !== s) return;
      snapshot.current = state;
      setRoom(state);
      setJoinCode('');
    });
    s.on('game-error', (payload?: { message?: string }) => {
      if (noIdentity(payload?.message)) loseSeat(snapshot.current?.code || urlCode());
      setError(payload?.message || 'The table could not complete that request.');
    });
    s.on('connect_error', () => setConnected(false));
    return () => {
      ++generation.current;
      pending.current = false;
      s.removeAllListeners();
      s.disconnect();
      if (socket.current === s) socket.current = null;
    };
  }, [loseSeat]);

  const send = useCallback(async (event: string, data: unknown = {}): Promise<Ack> => {
    const s = socket.current;
    if (!s?.connected) {
      const message = 'The table server is reconnecting. Give it a moment.';
      setError(message);
      return { ok: false, error: message };
    }
    // State updates are asynchronous; a ref closes the double-click window immediately.
    if (pending.current) return { ok: false, error: 'Wait for the current table request to finish.' };
    pending.current = true;
    setBusy(true);
    setError('');
    const attempt = ++generation.current;
    const oldCode = snapshot.current?.code;
    let payload = data;
    let requestedCode = '';
    if (event === 'action') payload = { ...(data as object), turnId: snapshot.current?.turnId };
    if (event === 'join-room') {
      const join = data as { roomCode?: string; token?: string };
      requestedCode = join.roomCode?.trim().toUpperCase() || '';
      const token = join.token || readStored(seatKey(requestedCode));
      payload = { ...join, roomCode: requestedCode, ...(token ? { token } : {}) };
    }
    if (event === 'create-room' || event === 'join-room') acceptSnapshots.current = true;
    let ack = await emitAck(s, event, payload);
    const current = () => socket.current === s && generation.current === attempt;
    if (!current()) return { ok: false, error: 'Your connection changed. Check the latest table before acting again.' };
    if (ack.timedOut && s.connected) {
      setError('Confirming the latest table state…');
      const recovered = await emitAck(s, 'request-state', {});
      if (!current()) return { ok: false, error: 'Your connection changed. Check the latest table before acting again.' };
      if (recovered.ok) saveSeat(recovered);
      if (event === 'create-room' && recovered.ok && recovered.roomCode && recovered.roomCode !== oldCode) ack = recovered;
      else if (event === 'join-room' && recovered.ok && recovered.roomCode === requestedCode) ack = recovered;
      else if (event === 'leave-room' && noIdentity(recovered.error)) ack = { ok: true };
      else if (noIdentity(recovered.error) && oldCode) loseSeat(oldCode);
    }
    pending.current = false;
    setBusy(false);
    if (ack.timedOut) {
      const message = 'Could not confirm that request. Check the latest table state before trying again.';
      setError(message);
      return { ok: false, error: message };
    }
    if (!ack.ok) {
      if (requestedCode && invalidSeat(ack.error)) removeStored(seatKey(requestedCode));
      if (noIdentity(ack.error)) loseSeat(oldCode || urlCode());
      setError(ack.error || 'That action could not be completed.');
    } else {
      saveSeat(ack);
      setError('');
      if (ack.roomCode) setJoinCode('');
    }
    return ack;
  }, [loseSeat]);

  const leave = useCallback(async () => {
    const state = snapshot.current;
    const code = state?.code;
    const keepSeat = state && ['preflop','flop','turn','river'].includes(state.stage) && (state.players.find(p=>p.id===state.you)?.seat ?? -1) >= 0;
    const ack = await send('leave-room');
    // Keep the table visible if the server has not confirmed releasing this seat.
    if (!ack.ok) return;
    loseSeat('');
    if (code && !keepSeat) removeStored(seatKey(code));
    updateUrl();
  }, [send, loseSeat]);
  return { room, connected, error, setError, busy, joinCode, setJoinCode, send, leave };
}
