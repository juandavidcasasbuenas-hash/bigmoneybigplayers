import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Group, MathUtils } from 'three';
import { Card } from './TablePieces';
import { FELT_Y } from './contactMotion';
import { seatPosition } from './seating';
import type { RevealedSeat, ShowdownPresentation } from './showdownPresentation';

function TabledHand({ seat, presentation, index, portrait }: { seat: RevealedSeat; presentation: ShowdownPresentation; index: number; portrait: boolean }) {
  const { size } = useThree();
  const rig = useRef<Group>(null);
  const mounted = useRef(Date.now());
  const revealed = useRef(seat.cards.length === 2 ? Date.now() : 0);
  if (seat.cards.length === 2 && !revealed.current) revealed.current = Date.now();
  const position = useMemo(() => {
    const p = seatPosition(seat.seat, 12).position;
    // Slide into the open felt, clear of the player's stack, drink and button.
    return [p[0] * (portrait ? 0.69 : 0.56), FELT_Y + 0.035, (portrait ? p[2] * 0.61 : p[2] < -0.6 ? Math.min(-1.5, p[2] * 0.52) : p[2] * 0.43)] as [number, number, number];
  }, [seat.seat, portrait]);
  const compact = size.height < 420;
  const neighbours = presentation.seats.some(other => other.id !== seat.id && [1, 11].includes(Math.abs(other.seat - seat.seat)));
  const dense = presentation.seats.length > 6 || neighbours || compact;
  const sideLabel = dense && !portrait && Math.abs(position[0]) > 2 && Math.abs(position[2]) < 1.2;
  const scale = portrait ? dense ? 0.9 : 1.02 : dense ? 0.76 : 1.02;
  useFrame(() => {
    if (!rig.current) return;
    const progress = MathUtils.smoothstep(Date.now() - (revealed.current || mounted.current) - index * 55, 100, 780);
    rig.current.rotation.x = seat.cards.length ? Math.PI * (1 - progress) : 0;
    rig.current.position.y = Math.sin(progress * Math.PI) * 0.37 * scale;
  });
  const chance = seat.chance === null ? '…' : `${presentation.estimated ? '≈' : ''}${seat.chance.toFixed(1)}%`;
  return <group position={position} rotation={[0, portrait ? Math.PI / 2 : 0, 0]}>
    {seat.award > 0 && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} scale={[1.38 * scale, 1.03 * scale, 1]}>
      <ringGeometry args={[0.45, 0.475, 64]} />
      <meshBasicMaterial color="#f5cf78" transparent opacity={0.9} toneMapped={false}/>
    </mesh>}
    {seat.disclosure !== 'mucked' && <group ref={rig}>
      {[0, 1].map(i => <Card key={i} card={seat.cards[i]} position={[(i - 0.5) * 0.51 * scale, i * 0.003, 0]} rotation={[0, (i ? -1 : 1) * 0.035, 0]} scale={scale}/>)}
    </group>}
    <Html center position={[sideLabel ? Math.sign(position[0]) * 1.1 * scale : 0, 0.04, sideLabel ? 0 : (!portrait && position[2] < -0.6 ? (dense ? -0.78 : -0.56) : dense && !portrait ? 0.65 : 0.47) * scale]} zIndexRange={[4, 1]} style={{pointerEvents:'none'}}>
      <article className={`table-reveal-seat ${dense ? 'dense' : ''} ${compact ? 'compact' : ''} ${seat.award ? 'winner' : ''}`} style={portrait ? { transform: `translateX(${-Math.sign(position[2]) * (dense ? 24 : 34)}px)` } : undefined} aria-label={`${seat.name}: ${seat.cards.join(', ')} ${seat.hand}${seat.chance !== null ? `, ${chance} to win` : ''}${seat.award ? `, wins ${seat.award} chips` : ''}`}>
        <div className="table-reveal-name"><strong title={seat.name}>{compact ? seat.name.replace(' · you', '') : seat.name}</strong>{presentation.allIn && <b title={presentation.sidePots ? 'Chance to win the main pot outright' : 'Chance to win outright'}>{chance}</b>}{seat.award > 0 && <b>+{seat.award.toLocaleString('en-GB')}</b>}</div>
        <small>{seat.award && seat.hand === 'Not shown' ? 'Wins without showing' : seat.hand}{presentation.allIn && presentation.sidePots ? ' · main pot win' : ''}</small>
      </article>
    </Html>
  </group>;
}

/** Small labels stay attached to real face-up cards on the felt, not a results panel. */
export function ShowdownReveal({ presentation, portrait }: { presentation: ShowdownPresentation; portrait: boolean }) {
  return <group name="tabled-showdown">
    {presentation.seats.map((seat, index) => <TabledHand key={`${presentation.key}:${seat.id}`} seat={seat} presentation={presentation} index={index} portrait={portrait}/>)}
  </group>;
}
