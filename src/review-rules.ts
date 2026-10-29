export function linkedDeparture(remaining: readonly number[], clicked: number, freeSlots: number): number[] {
  if (!remaining.includes(clicked) || freeSlots < 1) return [];
  return [clicked, ...remaining.filter(id => id !== clicked)].slice(0, Math.floor(freeSlots));
}

export function alternatingColor(turn: number): number {
  return turn % 2 === 0 ? 0 : 1;
}
