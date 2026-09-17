import type { RoomState } from '../../shared/types';

export function HandPositions({ room }: { room: RoomState }) {
  const positions = [
    { role: 'D', label: 'Dealer button', id: room.dealerId, amount: 0 },
    { role: 'SB', label: 'Small blind', id: room.smallBlindId, amount: room.currentLevel.small },
    { role: 'BB', label: 'Big blind', id: room.bigBlindId, amount: room.currentLevel.big },
  ];
  return <div className="hand-positions" aria-label="Dealer and blinds">
    {positions.map(position => {
      const player = room.players.find(p => p.id === position.id);
      return player && <div className="hand-position" key={position.role} title={`${position.label}: ${player.name}${position.amount ? ` · ${position.amount.toLocaleString('en-GB')}` : ''}`}>
        <b className={`position-token position-${position.role.toLowerCase()}`} aria-label={position.label}>{position.role}</b>
        <span>{player.id === room.you ? 'You' : player.name}</span>
        {!!position.amount && <small>{position.amount.toLocaleString('en-GB')}</small>}
      </div>;
    })}
  </div>;
}
