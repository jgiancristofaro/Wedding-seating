/** Muted, print-friendly palette for groups. Text on these uses dark ink for AA contrast. */
export const GROUP_COLORS = [
  '#E8B4A6', // blush
  '#A9C5B4', // sage
  '#B7C4E0', // dusty blue
  '#E6CF9C', // champagne
  '#CDB4DB', // lavender
  '#9FD1CF', // seafoam
  '#F0B9C8', // rose
  '#C9C29B', // olive
  '#D9B99B', // caramel
  '#B9D3E8', // sky
  '#D6C1B0', // taupe
  '#C2D6A0', // pistachio
];

export function nextGroupColor(used: string[]): string {
  const free = GROUP_COLORS.find((c) => !used.includes(c));
  return free ?? GROUP_COLORS[used.length % GROUP_COLORS.length];
}

export const NEUTRAL_SEAT = '#EFE9E1';
