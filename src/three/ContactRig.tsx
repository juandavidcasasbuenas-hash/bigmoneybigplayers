import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, MathUtils, Quaternion, Vector3 } from "three";
import type { CharacterDefinition } from "../data/characters";
import type { TableMotion } from "../../shared/tableTimeline";
import { DEAL, STREET } from "../../shared/dealTiming";
import { playTableSound } from "../audio/tableAudio";
import { Card, ChipStack } from "./TablePieces";
import { cardPeekProgress, type CardPeek } from '../../shared/cardPeek';
import { PeekCard } from './PeekCard';
import { foldTableCard, foldTableHand, restingCardHand, tablePeekHand } from './cardPeek';
import {
  actorContact,
  blendPose,
  BODY,
  CARD_SCALE,
  dealerHandAt,
  dealerLeftHand,
  FELT_Y,
  holeCardRest,
  relaxContact,
  seatedStance,
  smooth,
  solveArm,
  wristJoint,
  type ContactPose,
  type HandMode,
  type XYZ,
} from "./contactMotion";
import { contactPhysicsReady, loadContactPhysics } from "./contactPhysics";
import {
  chipRest,
  chipTrick,
  TRICK_CHIP_SCALE,
  TRICK_MS,
} from "./contactTricks";

import { BlenderBody, type BlenderPose } from "./BlenderCharacter";

function applyPose(group: Group | null, value: ContactPose) {
  if (!group) return;
  group.position.copy(value.position);
  group.quaternion.copy(value.quaternion);
}
export function useStanding(
  emote?: string,
  emoteAt?: number,
  effectNow?: number,
) {
  const value = useRef(0);
  const transition = useRef({ on: false, at: 0, from: 0 });
  useFrame((_, delta) => {
    const now = effectNow ?? Date.now(),
      on = emote === "stand";
    if (transition.current.on !== on)
      transition.current = {
        on,
        at: on ? emoteAt || now : now,
        from: value.current,
      };
    const t = smooth(now, transition.current.at, transition.current.at + 1150);
    value.current = MathUtils.lerp(transition.current.from, on ? 1 : 0, t);
  }, -4);
  return value;
}
function Round({
  position = [0, 0, 0],
  scale,
  color,
}: {
  position?: XYZ;
  scale: XYZ;
  color: string;
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.86} />
    </mesh>
  );
}
export type HandControl = { mode: HandMode; phase: number; curl?: number };
export function Hand({
  side,
  skin,
  control,
}: {
  side: number;
  skin: string;
  control: MutableRefObject<HandControl>;
}) {
  const proximal = useRef<(Group | null)[]>([]),
    distal = useRef<(Group | null)[]>([]);
  const thumb = useRef<Group>(null);
  const crease = useMemo(
    () => new Color(skin).multiplyScalar(0.84).getStyle(),
    [skin],
  );
  useFrame((_, delta) => {
    const { mode, phase, curl } = control.current;
    proximal.current.forEach((joint, i) => {
      if (!joint) return;
      let a =
        mode === "cards"
          ? 0.06
          : mode === "check"
            ? 1.2
            : mode === "open"
              ? 0.04
              : mode === "push"
                ? 0.16
                : mode === "cheers"
                  ? 0.92
                  : 0.27;
      if (mode === "roll")
        a = 0.12 + Math.max(0, Math.sin(phase * Math.PI * 5 - i * 1.1)) * 0.5;
      if (mode === "riffle" || mode === "toss") a = curl ?? 0.65;
      joint.rotation.x = MathUtils.damp(
        joint.rotation.x,
        a,
        20,
        Math.min(delta, 0.06),
      );
      joint.rotation.z = (i - 1.5) * (mode === "open" ? -0.13 : -0.028);
      if (distal.current[i])
        distal.current[i]!.rotation.x =
          mode === "cards"
            ? i < 2
              ? 0.5
              : 0.76
            : mode === "check"
              ? 1.12
              : mode === "open"
                ? 0.1
                : a * 0.8 + 0.18;
    });
    if (thumb.current)
      thumb.current.rotation.y =
        control.current.mode === "open" ? side * -0.5 : 0;
  }, -1);
  return (
    <>
      <Round
        position={[0, -0.02, -0.025]}
        scale={[0.106, 0.098, 0.052]}
        color={skin}
      />
      <Round
        position={[side * -0.065, -0.042, 0.004]}
        scale={[0.05, 0.063, 0.047]}
        color={skin}
      />
      {[-0.075, -0.025, 0.025, 0.075].map((x, i) => (
        <group
          key={i}
          position={[x, 0.028, -0.027]}
          ref={(node) => {
            proximal.current[i] = node;
          }}
          name={`finger-${side}-${i}`}
        >
          <Round
            position={[0, 0.028, 0]}
            scale={[0.025, 0.046, 0.024]}
            color={skin}
          />
          <group
            position={[0, 0.063, 0]}
            ref={(node) => {
              distal.current[i] = node;
            }}
          >
            <Round
              position={[0, 0.022, 0]}
              scale={[0.024, i === 3 ? 0.03 : 0.039, 0.023]}
              color={skin}
            />
            <Round
              position={[0, 0.036, -0.019]}
              scale={[0.013, 0.018, 0.004]}
              color={new Color(skin)
                .lerp(new Color("#efceb7"), 0.22)
                .getStyle()}
            />
            <mesh position={[0, 0, -0.021]}>
              <boxGeometry args={[0.028, 0.004, 0.003]} />
              <meshStandardMaterial color={crease} />
            </mesh>
          </group>
        </group>
      ))}
      <group ref={thumb} position={[side * -0.095, -0.018, 0.012]}>
        <group rotation={[0.28, 0, side * 0.27]}>
          <Round
            position={[0, 0.026, 0.02]}
            scale={[0.037, 0.057, 0.033]}
            color={skin}
          />
          <group
            position={[side * 0.02, 0.061, 0.034]}
            rotation={[0, 0, side * 0.48]}
          >
            <Round
              position={[0, 0.01, 0]}
              scale={[0.027, 0.041, 0.025]}
              color={skin}
            />
          </group>
        </group>
      </group>
    </>
  );
}

export interface ContactRigProps {
  character: CharacterDefinition;
  actorKey?: string;
  children: ReactNode;
  emote?: string;
  emoteAt?: number;
  effectNow?: number;
  seed?: number;
  active?: boolean;
  hasCards?: boolean;
  cardsTabled?: boolean;
  peek?: CardPeek | null;
  privateCards?: string[];
  onPeekStart?: () => void;
  outOfHand?: boolean;
  cardsReadyAt?: number;
  activity?: TableMotion;
  dealer?: boolean;
  dealerMotion?: TableMotion;
  seatIndex?: number;
  workDepth?: number;
  playerCount?: number;
  soundEffects?: boolean;
}
export function ContactRig({
  character: c,
  children,
  actorKey,
  emote,
  emoteAt,
  effectNow,
  seed = 0,
  active,
  hasCards = true,
  cardsTabled = false,
  peek: peekGesture,
  privateCards,
  onPeekStart,
  outOfHand = false,
  cardsReadyAt = 0,
  activity,
  dealer,
  dealerMotion,
  seatIndex = 0,
  workDepth = 1.04,
  playerCount = 1,
  soundEffects,
}: ContactRigProps) {
  useEffect(() => {
    void loadContactPhysics().catch((error) =>
      console.error("Contact physics failed to initialise", error),
    );
  }, []);
  const root = useRef<Group>(null),
    upper = useRef<Group>(null);
  const hands = useRef<(Group | null)[]>([]),
    shoes = useRef<(Group | null)[]>([]);
  const cards = useRef<(Group | null)[]>([]),
    chips = useRef<(Group | null)[]>([]),
    deck = useRef<Group>(null),
    drink = useRef<Group>(null);
  const controls = [
    useRef<HandControl>({ mode: "cards", phase: 0 }),
    useRef<HandControl>({ mode: "rest", phase: 0 }),
  ];
  const bodyPose = useRef<BlenderPose | null>(null);
  const standing = useStanding(emote, emoteAt, effectNow);
  const emoteClock = useRef({ emote, at: emoteAt || Date.now() });
  const soundsPlayed = useRef(new Set<string>());
  const recline = useRef(0);
  const cardCurl = useRef(0);
  const peekSoundAt = useRef(0);
  useFrame(({ clock }, delta) => {
    const now = effectNow ?? Date.now();
    if (
      emoteClock.current.emote !== emote ||
      (emoteAt && emoteAt !== emoteClock.current.at)
    )
      emoteClock.current = { emote, at: emoteAt || now };
    const p = activity ? (now - activity.startAt) / activity.duration : -1;
    const actionLive = p >= 0 && p < 1;
    const phase = clock.elapsedTime + seed * 2.71;
    const folding = actionLive && activity?.type === 'fold';
    // Close the corners during the reach phase, before the chips are pushed or
    // cards released. Beginning a decision while holding P must not snap them flat.
    const peek = hasCards && !dealer && (!outOfHand || folding) && standing.current < 0.02
      ? cardPeekProgress(peekGesture, now) * (actionLive ? 1 - smooth(p, 0, 0.18) : 1) : 0;
    cardCurl.current = smooth(peek, 0.25, 1);
    if (peekGesture && peek > 0.25 && peekGesture.releasedAt === null && peekSoundAt.current !== peekGesture.startedAt) {
      peekSoundAt.current = peekGesture.startedAt;
      if (soundEffects && now - peekGesture.startedAt < 1400) playTableSound('reveal', {volume: 0.12});
    }
    const stance = seatedStance(standing.current);
    const contact = actorContact({
      p,
      activity: actionLive ? activity : undefined,
      z: workDepth,
      now,
      cardsReadyAt: dealer ? cardsReadyAt : 0,
      hasCards,
      standing: standing.current,
      emote,
      peek: 0,
    });
    if (hasCards && !dealer && standing.current < 0.02) {
      contact.left = restingCardHand(seatIndex, -1);
      contact.leftMode = 'rest';
      if (actionLive && activity?.type === 'fold') {
        contact.left = foldTableHand(p, seatIndex, -1);
        contact.right = foldTableHand(p, seatIndex, 1);
        contact.leftMode = contact.rightMode = p < 0.43 ? 'cards' : 'open';
      }
      if (peek > 0) {
        contact.left = blendPose(contact.left, tablePeekHand(seatIndex, 1, cardCurl.current), smooth(peek, 0, 0.25));
        contact.right = blendPose(contact.right, tablePeekHand(seatIndex, 0, cardCurl.current), smooth(peek, 0, 0.25));
        contact.leftMode = contact.rightMode = 'cards';
        contact.lean += peek * 0.08;
      }
    }
    const manualAge = now - emoteClock.current.at;
    const manual =
      ["chips", "chip-roll", "chip-toss"].includes(emote || "") &&
      manualAge >= 0 &&
      manualAge < TRICK_MS;
    const cycle = Math.floor(now / 14000),
      age = (now % 14000) - 3500;
    const variant = manual
      ? emote === "chip-roll"
        ? 1
        : emote === "chip-toss"
          ? 2
          : 0
      : Math.floor(cycle / Math.max(1, playerCount)) % 3;
    const trickAge = manual ? manualAge : age;
    const doingTrick =
      !dealer &&
      (!cardsTabled || manual) &&
      !actionLive &&
      peek === 0 &&
      standing.current < 0.02 &&
      !(cardsReadyAt && now < cardsReadyAt + DEAL.pickup) &&
      (manual || (!outOfHand && !emote && cycle % Math.max(1, playerCount) === seed)) &&
      trickAge >= 0 &&
      trickAge < TRICK_MS;
    const trick = doingTrick
      ? chipTrick(trickAge / TRICK_MS, variant, workDepth)
      : null;
    if (trick) {
      contact.right = trick.hand;
      contact.rightMode = ["riffle", "roll", "toss"][variant] as HandMode;
      contact.lean +=
        0.13 *
        smooth(trickAge / TRICK_MS, 0, 0.16) *
        (1 - smooth(trickAge / TRICK_MS, 0.87, 1));
      const beat =
        variant === 2
          ? trickAge / TRICK_MS >= 0.74
            ? "catch"
            : ""
          : trickAge / TRICK_MS >= 0.38
            ? "riffle"
            : "";
      const key = `${manual ? emoteClock.current.at : cycle}:${variant}:${beat}`;
      if (beat && !soundsPlayed.current.has(key)) {
        soundsPlayed.current.add(key);
        if (soundEffects)
          playTableSound(variant === 0 ? "trick" : "chips", {
            volume: variant === 0 ? 0.45 : 0.18,
          });
        if (soundsPlayed.current.size > 40)
          soundsPlayed.current = new Set([key]);
      }
    }
    if (dealer) {
      contact.left = dealerLeftHand();
      contact.leftMode = "push";
      const dealing =
        dealerMotion &&
        now >= dealerMotion.startAt &&
        now < dealerMotion.startAt + dealerMotion.duration;
      if (dealing && dealerMotion.type === "hand-start")
        contact.right = dealerHandAt(
          now - dealerMotion.startAt,
          dealerMotion.playerIds.length * 2,
        );
      if (dealing && dealerMotion.type === "street")
        contact.right = dealerHandAt(
          now - dealerMotion.startAt,
          dealerMotion.stage === "flop" ? 3 : 1,
          STREET.release,
          STREET.interval,
          true,
        );
      contact.rightMode = "push";
      contact.lean = dealing ? 0.1 : 0.035;
    }
    const sittingBack = outOfHand && !dealer && !actionLive && !trick && !emote && standing.current < 0.01;
    recline.current = MathUtils.damp(recline.current, sittingBack ? 1 : 0, 3.2, Math.min(delta, 0.05));
    if (!dealer && recline.current > 0.001) relaxContact(contact, recline.current);
    const breath = Math.sin(phase * 1.5) * 0.008;
    const bodyRotation = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      contact.lean + breath,
    );
    if (upper.current) {
      upper.current.position.copy(stance.hip);
      upper.current.quaternion.copy(bodyRotation);
    }
    const arms: BlenderPose["arms"] = [];
    const errors: number[] = [],
      clearances: number[] = [];
    [-1, 1].forEach((side, i) => {
      const shoulder = new Vector3(side * 0.44, 1.7 - BODY.hipY, 0.125)
        .applyQuaternion(bodyRotation)
        .add(stance.hip);
      const hand = i === 0 ? contact.left : contact.right;
      const arm = solveArm(
        shoulder,
        wristJoint(hand),
        side,
        dealer ? "dealer" : seatIndex,
      );
      arms.push(arm);
      errors.push(arm.error);
      clearances.push(arm.clearance);
      applyPose(hands.current[i], hand);
      const leg = stance.legs[i];
      if (shoes.current[i])
        shoes.current[i]!.position.copy(leg.end).add(
          new Vector3(0, -0.052, 0.075),
        );
      controls[i].current = {
        mode: i === 0 ? contact.leftMode : contact.rightMode,
        phase: trickAge / TRICK_MS,
        curl: trick?.curl,
      };
    });
    bodyPose.current = {
      hip: stance.hip,
      rotation: bodyRotation,
      arms,
      legs: stance.legs,
    };
    cards.current.forEach((card, i) => {
      if (!card) return;
      const folding = actionLive && activity?.type === "fold";
      card.visible = !dealer && (folding || hasCards) && now >= cardsReadyAt;
      applyPose(
        card,
        folding
          ? foldTableCard(p, seatIndex, i)
          : holeCardRest(workDepth, i),
      );
    });
    if (deck.current) applyPose(deck.current, contact.left);
    if (drink.current) {
      drink.current.visible = emote === "cheers";
      applyPose(drink.current, contact.right);
    }
    chips.current.forEach((chip, i) => {
      if (!chip) return;
      applyPose(chip, trick?.chips[i] || chipRest(i, workDepth));
      chip.visible =
        !dealer && (!cardsTabled || manual) && !(i < 4 && actionLive && activity?.type === "bet");
    });
    if (root.current) {
      root.current.userData.action = actionLive
        ? activity?.type
        : trick
          ? ["chip-riffle", "chip-roll", "chip-toss"][variant]
          : peek > 0.01 ? 'peek-cards' : standing.current > 0.05
            ? "stand"
            : recline.current > 0.5 ? "sitting-back" : "idle";
      root.current.userData.contact = {
        physics: contactPhysicsReady() ? "rapier" : "loading",
        solver: "three-ccdik",
        armError: Math.max(...errors),
        railClearance: Math.min(...clearances),
        standing: standing.current,
        recline: recline.current,
        peek: peek,
        cardCurl: cardCurl.current,
        hip: stance.hip.toArray(),
        leftHand: contact.left.position.toArray(),
        rightHand: contact.right.position.toArray(),
        knees: stance.legs.map((l) => l.joint.toArray()),
        ankles: stance.legs.map((l) => l.end.toArray()),
        airborne: trick?.airborne ?? false,
      };
    }
  }, -2);
  return (
    <group
      ref={root}
      name={`toon-${actorKey || c.id}`}
      userData={{ actorKey: actorKey || c.id }}
    >
      <group ref={upper}>
        <group position={[0, -BODY.hipY, -BODY.hipZ]}>{children}</group>
      </group>
      <BlenderBody character={c} pose={bodyPose} />
      {[-1, 1].map((side, i) => (
        <group key={side}>
          <group
            ref={(n) => {
              hands.current[i] = n;
            }}
            name={`${side < 0 ? "left" : "right"}-hand`}
          >
            <Hand side={side} skin={c.skin} control={controls[i]} />
          </group>
          <group
            ref={(n) => {
              shoes.current[i] = n;
            }}
            name={`${side < 0 ? "left" : "right"}-shoe`}
          >
            <Round scale={[0.155, 0.105, 0.255]} color="#303630" />
            <Round
              position={[0, -0.083, 0.005]}
              scale={[0.16, 0.022, 0.26]}
              color="#202923"
            />
            {[-0.04, 0.025, 0.085].map((z) => (
              <mesh key={z} position={[0, 0.099, z]} rotation={[-0.12, 0, 0]}>
                <boxGeometry args={[0.13, 0.008, 0.018]} />
                <meshStandardMaterial color="#929480" roughness={1} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
      {!dealer &&
        [0, 1].map((i) => (
          <group
            key={i}
            ref={(n) => {
              cards.current[i] = n;
            }}
            name={`hole-card-${i}`}
            onPointerDown={onPeekStart ? event => { event.stopPropagation(); if (event.button === 0) onPeekStart(); } : undefined}
            onClick={onPeekStart ? event => event.stopPropagation() : undefined}
          >
            <PeekCard card={privateCards?.[i]} amount={cardCurl} />
          </group>
        ))}
      {!dealer &&
        Array.from({ length: 8 }, (_, i) => (
          <group
            key={i}
            ref={(n) => {
              chips.current[i] = n;
            }}
            name={`contact-chip-${i}`}
          >
            <ChipStack
              count={1}
              position={[0, -0.025 * TRICK_CHIP_SCALE, 0]}
              scale={TRICK_CHIP_SCALE}
              color={i < 4 ? "#aa463e" : "#e0cfab"}
            />
          </group>
        ))}
      {dealer && (
        <group ref={deck} name="dealer-held-deck">
          <group
            position={[-0.021, 0.185, 0.055]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} position={[0, i * 0.008, 0]} scale={CARD_SCALE} />
            ))}
          </group>
        </group>
      )}
      <group ref={drink} visible={false}>
        <group position={[0.09, 0.1, 0.035]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.092, 0.078, 0.26, 18]} />
            <meshStandardMaterial color="#ae813e" roughness={0.45} />
          </mesh>
          <Round
            position={[0, 0.13, 0]}
            scale={[0.09, 0.014, 0.09]}
            color="#eee1c2"
          />
        </group>
      </group>
    </group>
  );
}
