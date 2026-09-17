import { cardImageSource, cardLabel } from '../three/cardArtwork';
export function PlayingCard({card,small=false}:{card?:string;small?:boolean}) {
  return <img className={`playing-card ${small?'small':''} ${card?'':'card-back'}`} src={cardImageSource(card)} alt={cardLabel(card)} draggable={false}/>;
}
