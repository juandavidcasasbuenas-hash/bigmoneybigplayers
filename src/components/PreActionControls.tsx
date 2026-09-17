import { Check, X } from 'lucide-react';
import type { Ack, PreAction, RoomState } from '../../shared/types';

export function PreActionControls({ room, busy, connected, send }: {
  room: RoomState; busy: boolean; connected: boolean;
  send: (event: string, data?: unknown) => Promise<Ack>;
}) {
  const me = room.players.find(p => p.id === room.you)!;
  const call = Math.max(0, Math.min(me.chips, room.currentBet - me.bet));
  const selected = room.preAction?.type;
  const choose = (type: PreAction['type'] | null) => void send('pre-action', {
    type, handNumber: room.handNumber, stage: room.stage, currentBet: room.currentBet,
  });
  return <div className="pre-action-controls" aria-label="Preselect your next action">
    <div className="pre-action-heading"><span>{selected ? 'Ready for your turn' : 'Next turn'}</span><small>Clears if the bet changes</small></div>
    <div className="pre-action-buttons">
      {(['fold', call ? 'call' : 'check'] as const).map(type => <button key={type} disabled={busy || !connected || room.paused} aria-pressed={selected === type} className={selected === type ? 'queued' : ''} onClick={() => choose(selected === type ? null : type)}>
        <span className="pre-action-check">{selected === type && <Check size={13}/>}</span>
        {type === 'call' ? `Call ${call.toLocaleString('en-GB')}${call === me.chips ? ' · all in' : ''}` : type === 'fold' ? 'Fold' : 'Check'}
      </button>)}
      {selected && <button className="cancel-pre-action" aria-label="Cancel preselected action" disabled={busy || !connected} onClick={() => choose(null)}><X size={16}/></button>}
    </div>
  </div>;
}
