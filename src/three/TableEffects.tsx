import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, Vector3 } from "three";
import type { ScenePlayer } from "../components/PokerScene";
import type { TableMotion } from "../../shared/tableTimeline";
import { potStacks, POT_ORIGIN, POT_CHIP_SCALE } from "../../shared/potDisplay";
import { Card, ChipStack } from "./TablePieces";
import { BOARD_CARD_SCALE, BOARD_CARD_SPACING, BOARD_Z } from "./tableLayout";
import {
  DEAL,
  STREET,
  dealReleaseAt,
  holePickupAt,
} from "../../shared/dealTiming";
import {
  betChipCount,
  betChips,
  blendPose,
  CARD_SCALE,
  HOLE_CARD_SCALE,
  cardInHand,
  composePose,
  dealtCard,
  dealerRightHand,
  DEALER_ROOT,
  FELT_Y,
  pose,
  seatTransform,
  workZ,
} from "./contactMotion";

export function CommunityCard({
  card,
  index,
  motions,
  effectNow,
}: {
  card: string;
  index: number;
  motions: TableMotion[];
  effectNow?: number;
}) {
  const rig = useRef<Group>(null);
  const event = motions.find(
    (e) =>
      e.type === "street" &&
      (e.stage === "flop"
        ? index < 3
        : e.stage === "turn"
          ? index === 3
          : index === 4),
  );
  const start = event
    ? event.startAt + (index < 3 ? index : 0) * STREET.interval
    : 0;
  useFrame(() => {
    if (!rig.current) return;
    const t = effectNow ?? Date.now(),
      elapsed = t - start;
    const destination = pose([(index - 2) * BOARD_CARD_SPACING, FELT_Y + 0.012, BOARD_Z]);
    // Keep the dealer's exact card grip, then ease up to the readable public size.
    rig.current.scale.setScalar(MathUtils.lerp(1, BOARD_CARD_SCALE / CARD_SCALE,
      !start ? 1 : MathUtils.smoothstep(elapsed, STREET.release, STREET.release + STREET.flight)));
    rig.current.visible = !start || elapsed >= STREET.release - 180;
    if (!start || elapsed >= STREET.release + STREET.flight) {
      rig.current.position.copy(destination.position);
      rig.current.quaternion.copy(destination.quaternion);
      rig.current.userData.progress = 1;
      return;
    }
    const hand = dealerRightHand(
      MathUtils.clamp((elapsed - STREET.release + 180) / 180, 0, 1),
      true,
    );
    let transform = composePose(DEALER_ROOT, cardInHand(hand, 0));
    if (elapsed >= STREET.release) {
      const p = MathUtils.clamp(
        (elapsed - STREET.release) / STREET.flight,
        0,
        1,
      );
      const release = composePose(
        DEALER_ROOT,
        cardInHand(dealerRightHand(1, true), 0),
      );
      transform = blendPose(release, destination, 1 - (1 - p) ** 2);
      transform.position.y =
        MathUtils.lerp(release.position.y, destination.position.y, p) +
        0.1 * 4 * p * (1 - p);
    }
    rig.current.position.copy(transform.position);
    rig.current.quaternion.copy(transform.quaternion);
    rig.current.userData.progress = MathUtils.clamp(
      elapsed / (STREET.release + STREET.flight),
      0,
      1,
    );
  });
  return (
    <group ref={rig} name={`community-card-${index}`}>
      <Card card={card} position={[0, 0, 0]} scale={CARD_SCALE} />
    </group>
  );
}

function Deal({
  motion,
  players,
  effectNow,
}: {
  motion: TableMotion;
  players: ScenePlayer[];
  effectNow?: number;
}) {
  const rig = useRef<Group>(null);
  const order = motion.type === "hand-start" ? motion.playerIds : [];
  useFrame(() => {
    if (!rig.current) return;
    const elapsed = (effectNow ?? Date.now()) - motion.startAt;
    rig.current.children.forEach((card, i) => {
      const player = players.find((p) => p.id === order[i % order.length]);
      if (!player) {
        card.visible = false;
        return;
      }
      const cardSeat = player.seat ?? players.indexOf(player);
      const transform = dealtCard(
        elapsed,
        i,
        cardSeat,
        order.length,
        workZ(cardSeat),
      );
      card.visible =
        elapsed >= dealReleaseAt(i) - 180 &&
        elapsed < holePickupAt(order.length, i % order.length);
      card.position.copy(transform.position);
      card.quaternion.copy(transform.quaternion);
      card.scale.setScalar(MathUtils.lerp(1, HOLE_CARD_SCALE / CARD_SCALE,
        MathUtils.smoothstep(elapsed - dealReleaseAt(i), 0, DEAL.flight)));
    });
  });
  return (
    <group ref={rig} name="dealing-cards">
      {Array.from({ length: order.length * 2 }, (_, i) => (
        <group key={i}>
          <Card position={[0, 0, 0]} scale={CARD_SCALE} />
        </group>
      ))}
    </group>
  );
}
function Bet({
  motion,
  player,
  effectNow,
}: {
  motion: TableMotion;
  player: ScenePlayer;
  effectNow?: number;
}) {
  const rig = useRef<Group>(null);
  const seat = seatTransform(player.seat ?? 0),
    depth = workZ(player.seat ?? 0);
  useFrame(() => {
    if (!rig.current) return;
    const p = ((effectNow ?? Date.now()) - motion.startAt) / motion.duration;
    rig.current.visible = p >= 0 && p < 1;
    const contact = composePose(seat, pose(betChips(p, depth, motion.type === "bet" && motion.forced).toArray() as [number, number, number]));
    // Preserve the hand's contact phase, then slide the released chips into the pot.
    rig.current.position.copy(contact.position).lerp(
      new Vector3(...POT_ORIGIN), MathUtils.smoothstep(p, 0.74, 1),
    );
    rig.current.quaternion.copy(contact.quaternion);
    rig.current.userData.progress = p;
  });
  return (
      <group ref={rig} name={`bet-chips-${player.id}`}>
        <ChipStack
          count={betChipCount(motion.type === "bet" ? motion.amount : 0)}
          scale={0.44}
        />
      </group>
  );
}

function Collect({
  motion,
  players,
  effectNow,
}: {
  motion: TableMotion;
  players: ScenePlayer[];
  effectNow?: number;
}) {
  const rig = useRef<Group>(null),
    winners = motion.type === "award" ? motion.winners : [];
  const total = motion.type === 'award' ? motion.pot : 0;
  // Lift the actual pot in small cuts; tall centre stacks must not pass through a collecting hand.
  const piles = potStacks(total).flatMap(pile => Array.from({length: Math.ceil(pile.count / 4)}, (_, cut) => ({
    ...pile,
    count: Math.min(4, pile.count - cut * 4),
    position: [pile.position[0], pile.position[1] + cut * 4 * 0.05 * POT_CHIP_SCALE, pile.position[2]] as [number, number, number],
  })));
  const deliveries = piles.map((_, i) => {
    let cutoff = 0;
    return winners.find(w => {
      cutoff += w.amount;
      return (i + 0.5) / piles.length * total <= cutoff;
    }) || winners.at(-1);
  });
  useFrame(() => {
    if (!rig.current) return;
    const time = (effectNow ?? Date.now()) - motion.startAt;
    rig.current.children.forEach((pile, i) => {
      const winner = deliveries[i],
        player = players.find((p) => p.id === winner?.playerId);
      if (!player) {
        pile.visible = false;
        return;
      }
      const seatIndex = player.seat ?? players.indexOf(player),
        depth = workZ(seatIndex);
      const p = MathUtils.clamp(time / motion.duration, 0, 1);
      const contact = composePose(
        seatTransform(seatIndex),
        pose([0.34 + ((i % 4) - 1.5) * 0.13, FELT_Y + 0.002, depth + 0.3]),
      );
      const destination = composePose(
        seatTransform(seatIndex),
        pose([0.34 + ((i % 4) - 1.5) * 0.13, FELT_Y + 0.002, depth + 0.04]),
      );
      const origin = new Vector3(...piles[i].position);
      pile.visible = time >= 0 && p < 0.96;
      pile.position.copy(
        p < 0.45
          ? origin.lerp(contact.position, MathUtils.smoothstep(p, 0.05, 0.45))
          : contact.position.lerp(
              destination.position,
              MathUtils.smoothstep(p, 0.45, 0.83),
            ),
      );
      pile.quaternion.copy(destination.quaternion);
      pile.userData.progress = p;
    });
  });
  return (
    <group ref={rig} name="collecting-pot">
      {piles.map((pile, i) => (
          <group key={i}>
            <ChipStack
              count={pile.count}
              scale={POT_CHIP_SCALE}
              color={pile.color}
            />
          </group>
        ))}
    </group>
  );
}
export function TableEffects({
  motions,
  players,
  effectNow,
}: {
  motions: TableMotion[];
  players: ScenePlayer[];
  effectNow?: number;
}) {
  const now = effectNow ?? Date.now();
  return (
    <>
      {motions
        .filter(
          (m) => m.startAt <= now + 150 && m.startAt + m.duration >= now - 150,
        )
        .map((m) => {
          if (m.type === "hand-start")
            return (
              <Deal
                key={m.id}
                motion={m}
                players={players}
                effectNow={effectNow}
              />
            );
          if (m.type === "award")
            return (
              <Collect
                key={m.id}
                motion={m}
                players={players}
                effectNow={effectNow}
              />
            );
          const player =
            "playerId" in m
              ? players.find((p) => p.id === m.playerId)
              : undefined;
          if (m.type === "bet" && player)
            return (
              <Bet
                key={m.id}
                motion={m}
                player={player}
                effectNow={effectNow}
              />
            );
          return null;
        })}
    </>
  );
}
