import type { RoomState } from '../../shared/types';
import { describeHand } from '../../shared/handOdds';
import type { useHeadsUpOdds } from '../hooks/useHeadsUpOdds';
import { getCharacter } from '../data/characters';
import { PlayingCard } from './PlayingCard';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ShowdownPanel({ room, odds, board, settled, now }: {
  room: RoomState;
  odds: ReturnType<typeof useHeadsUpOdds>;
  board: string[];
  settled: boolean;
  now: number;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const review = room.handReview;
  const reviewing = !!review && now >= review.startsAt;
  if (!odds && !reviewing && !settled) return null;
  const ids = new Set(odds?.players.map(p => p.playerId) || review?.playerIds || room.winners.map(w => w.playerId));
  if (reviewing) room.players.filter(p => p.disclosure === 'shown').forEach(p => ids.add(p.id));
  const participants = room.players.filter(p => ids.has(p.id));
  const multiPot = room.pots.length > 1 && room.pots.some(p => p.eligible.length < participants.length);
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth, behavior: 'smooth' });
  return <section className={`showdown-panel ${participants.length >= 3 ? 'multiway' : ''} ${settled ? 'settled' : ''}`} aria-label="Showdown" aria-live="polite">
    <header>
      <strong>{settled ? 'Hand complete' : odds ? 'All in' : 'Showdown'}</strong>
      <span>{multiPot ? 'Main + side pots' : 'Pot'} <b>{room.pot.toLocaleString('en-GB')}</b></span>
      {participants.length > 2 && <nav className="showdown-scroll" aria-label="Showdown players">
        <button aria-label="Previous showdown players" onClick={() => scroll(-1)}><ChevronLeft size={14} /></button>
        <small>{participants.length}</small>
        <button aria-label="Next showdown players" onClick={() => scroll(1)}><ChevronRight size={14} /></button>
      </nav>}
    </header>
    <div className="showdown-players" ref={rail}>
      {participants.map(player => {
        const index = odds?.players.findIndex(p => p.playerId === player.id) ?? -1;
        const publicCards = index >= 0 ? odds!.players[index].cards : player.disclosure === 'shown' ? player.holeCards : [];
        const award = settled ? room.winners.find(w => w.playerId === player.id) : undefined;
        const hidden = !publicCards.length;
        return <article className={`showdown-player ${award ? 'winner' : ''}`} key={player.id} aria-label={`${player.name}${award ? ', winner' : ''}`}>
          <div className="showdown-name"><img src={getCharacter(player.avatarId).portrait} alt="" /><strong>{player.name}</strong>{player.id === room.you && <small>you</small>}</div>
          <div className="showdown-hand">
            <div className="showdown-cards">{[0, 1].map(i => <PlayingCard key={i} card={publicCards[i]} />)}</div>
            {odds && !settled && index >= 0 && <div className="showdown-chance">
              <strong>{odds.result ? `${odds.result.exact ? '' : '≈'}${odds.result.wins[index].toFixed(1)}%` : '…'}</strong>
              <small>{multiPot ? 'main pot win' : 'win'}</small>
              <span className="odds-meter"><i style={{ width: `${odds.result?.wins[index] || 0}%` }} /></span>
            </div>}
            {award && <div className="showdown-award"><small>{room.winners.length > 1 ? 'Pot share' : 'Winner'}</small><strong>+{award.amount.toLocaleString('en-GB')}</strong></div>}
          </div>
          <p>{hidden ? player.disclosure === 'mucked' ? 'Mucked' : 'Cards hidden' : award?.hand === 'Everyone folded' ? 'Uncontested' : describeHand([...publicCards, ...board])}</p>
        </article>;
      })}
    </div>
    {odds && !settled && <footer>{odds.result ? `Split ${odds.result.tie.toFixed(1)}%${odds.result.exact ? '' : ' · estimated odds'}` : 'Calculating odds…'}</footer>}
  </section>;
}
