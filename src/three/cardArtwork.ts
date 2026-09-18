/** Original vector deck, shared by the DOM hand and the table's 3D textures. */
const shapes: Record<string, string> = {
  s: "M0 -48C-13 -29 -43 -14 -43 10C-43 35 -13 42 -3 20C-5 36 -10 44 -20 48H20C10 44 5 36 3 20C13 42 43 35 43 10C43 -14 13 -29 0 -48Z",
  h: "M0 45C-11 33 -45 9 -45 -15C-45 -48 -10 -53 0 -27C10 -53 45 -48 45 -15C45 9 11 33 0 45Z",
  d: "M0 -49L36 0L0 49L-36 0Z",
  c: "M-9 5C-40 -20 -53 8 -42 26C-31 43 -10 34 -4 21C-5 37 -12 44 -22 48H22C12 44 5 37 4 21C10 34 31 43 42 26C53 8 40 -20 9 5C33 -10 25 -45 0 -45C-25 -45 -33 -10 -9 5Z",
};
export const suitNames: Record<string, string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};
export function cardLabel(card?: string) {
  if (!card || !/^(10|[2-9TJQKA])[shdc]$/i.test(card)) return "Face-down card";
  const rank = card.slice(0, -1).toUpperCase();
  return `${({ A: "Ace", K: "King", Q: "Queen", J: "Jack", T: "10" } as Record<string, string>)[rank] || rank} of ${suitNames[card.slice(-1).toLowerCase()]}`;
}
/** Normalized positions for the central pips, excluding the two corner indices. */
export function cardPips(rank: string): [number, number][] {
  const pair = (y: number): [number, number][] => [
    [-1, y],
    [1, y],
  ];
  const ends = [...pair(-1), ...pair(1)],
    six = [...ends, ...pair(0)];
  switch (rank) {
    case "A":
      return [[0, 0]];
    case "2":
      return [
        [0, -1],
        [0, 1],
      ];
    case "3":
      return [
        [0, -1],
        [0, 0],
        [0, 1],
      ];
    case "4":
      return ends;
    case "5":
      return [...ends, [0, 0]];
    case "6":
      return six;
    case "7":
      return [...six, [0, -0.5]];
    case "8":
      return [...six, [0, -0.5], [0, 0.5]];
    case "9":
      return [...ends, ...pair(-0.34), ...pair(0.34), [0, 0]];
    case "T":
    case "10":
      return [...ends, ...pair(-0.34), ...pair(0.34), [0, -0.67], [0, 0.67]];
    default:
      return [];
  }
}
function pip(
  suit: string,
  x: number,
  y: number,
  size: number,
  inverted = false,
) {
  return `<path d="${shapes[suit]}" transform="translate(${x} ${y}) rotate(${inverted ? 180 : 0}) scale(${size / 100})"/>`;
}
function court(rank: string, suit: string, ink: string) {
  const crown =
    rank === "J"
      ? '<path d="M84 126Q122 82 164 122L161 136H88Z" fill="#bd363d"/><path d="M128 103Q134 76 151 83L141 116" fill="#e1b960"/>'
      : '<path d="M87 124L81 98L104 110L122 87L140 110L163 98L157 124Z" fill="#e1b960"/>';
  const face = `${crown}<path d="M97 125H148L145 154L136 166H109L99 154Z" fill="#f2d7ad"/><path d="M100 126L97 145L91 143L90 127M147 126L153 142L159 137L156 123" fill="#222a33"/><path d="M110 138H119M133 138H141M126 141L122 151H129M116 158H133" fill="none" stroke="#222a33" stroke-width="2.5"/>${rank === "K" ? '<path d="M108 155L119 150L126 156L135 150L144 155L138 169L125 177L111 166Z" fill="#344455"/>' : ""}`;
  const upper = `<g clip-path="url(#half)" stroke="#253347" stroke-width="2" stroke-linejoin="round"><path d="M69 187L83 166L108 160L124 179L139 160L164 169L177 187V215H69Z" fill="#345578"/><path d="M86 166L104 164L146 215H124Z" fill="#d0a24f"/><path d="M154 167L163 172L112 215H96Z" fill="${ink}"/>${face}<path d="M69 190V118" stroke="#c8973d" stroke-width="5"/>${rank === "Q" ? '<path d="M69 123C47 119 53 97 69 105C85 97 91 119 69 123Z" fill="#c13c47"/>' : '<path d="M63 120L69 106L75 120Z" fill="#c8973d"/>'}${pip(suit, 171, 147, 23)}</g>`;
  return `<defs><clipPath id="half"><rect x="59" y="85" width="132" height="90"/></clipPath></defs><g fill="${ink}"><rect x="59" y="85" width="132" height="180" rx="2" fill="#fbf5e5" stroke="#263747" stroke-width="2"/>${upper}<g transform="translate(250 350) rotate(180)">${upper}</g><path d="M60 176H190" stroke="#d0a24f" stroke-width="4"/></g>`;
}
export function cardSvg(card?: string) {
  const base =
    '<rect x="1.5" y="1.5" width="247" height="347" rx="14" fill="#fffef9" stroke="#d7d3c8" stroke-width="3"/>';
  const suit = card?.slice(-1).toLowerCase() || "",
    rank = (card?.slice(0, -1).toUpperCase() || "").replace("10", "T");
  if (!shapes[suit] || !/^[2-9TJQKA]$/.test(rank))
    return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 250 350">${base}<defs><pattern id="weave" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M7 0L14 7L7 14L0 7Z" fill="none" stroke="#f6d3bb" stroke-width="1"/></pattern></defs><rect x="13" y="13" width="224" height="324" rx="7" fill="#90393c"/><rect x="22" y="22" width="206" height="306" rx="3" fill="url(#weave)" stroke="#f6d3bb" stroke-width="2"/><ellipse cx="125" cy="175" rx="55" ry="79" fill="#90393c" stroke="#f6d3bb" stroke-width="3"/><g fill="#f8e2c3">${pip("s", 125, 156, 64)}<text x="125" y="201" text-anchor="middle" font-family="Georgia,serif" font-size="12" font-weight="bold">BIG MONEY</text><text x="125" y="219" text-anchor="middle" font-family="Georgia,serif" font-size="12" font-weight="bold">BIG PLAYERS</text></g></svg>`;
  const ink = suit === "h" || suit === "d" ? "#bd1730" : "#101820";
  // Keep the small index suit close to its rank, outside the central pip field.
  // Full-sized corner suits at the pip-row height made a four look like a six.
  const corner = `<g class="card-index" fill="${ink}"><text x="29" y="50" text-anchor="middle" font-family="Arial,sans-serif" font-size="${rank === "T" ? 37 : 48}" font-weight="800" letter-spacing="-2">${rank === "T" ? "10" : rank}</text>${pip(suit, 28, 71, 22)}</g>`;
  const field = "JQK".includes(rank)
    ? `<g class="card-court">${court(rank, suit, ink)}</g>`
    : `<g class="card-pips" fill="${ink}">${cardPips(rank)
        .map(([x, y]) =>
          pip(
            suit,
            125 + x * 45,
            175 + y * 85,
            rank === "A" ? 110 : rank === "T" || rank === "9" ? 40 : 46,
            y > 0,
          ),
        )
        .join("")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 250 350">${base}${corner}<g transform="translate(250 350) rotate(180)">${corner}</g>${field}</svg>`;
}
const sources = new Map<string, string>();
export function cardImageSource(card?: string) {
  const key = card || "back";
  if (!sources.has(key))
    sources.set(
      key,
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(card))}`,
    );
  return sources.get(key)!;
}
