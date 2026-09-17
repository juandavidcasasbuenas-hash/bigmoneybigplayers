import { memo } from "react";
import type { CharacterDefinition } from "../data/characters";
import type { TableMotion } from "../../shared/tableTimeline";
import { ContactRig } from "./ContactRig";
import { BlenderHead } from "./BlenderCharacter";
import type { CardPeek } from '../../shared/cardPeek';

export { DEALER_CHARACTER } from "../data/characters";

/** Editable Blender assets share the table's constrained interaction rig. */
export const ToonAvatar = memo(function ToonAvatar({
  character,
  attention,
  firstPerson = false,
  dealSequence: _dealSequence,
  ...props
}: {
  character: CharacterDefinition;
  emote?: string;
  seed?: number;
  actorKey?: string;
  active?: boolean;
  hasCards?: boolean;
  peek?: CardPeek | null;
  privateCards?: string[];
  onPeekStart?: () => void;
  firstPerson?: boolean;
  outOfHand?: boolean;
  dealer?: boolean;
  dealSequence?: number;
  attention?: number;
  activity?: TableMotion;
  effectNow?: number;
  playerCount?: number;
  soundEffects?: boolean;
  emoteAt?: number;
  cardsReadyAt?: number;
  seatIndex?: number;
  workDepth?: number;
  dealerMotion?: TableMotion;
}) {
  return (
    <ContactRig character={character} {...props}>
      {!firstPerson && <BlenderHead
        character={character}
        actorKey={props.actorKey}
        emote={props.emote}
        seed={props.seed}
        attention={attention}
        active={props.active}
        peek={props.peek}
        effectNow={props.effectNow}
      />}
    </ContactRig>
  );
});
