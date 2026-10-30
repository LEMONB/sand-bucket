import { bucketIcon } from './bucket-icon';
import type { BucketSpec, Game } from './game';

const paths = {
  mystery: '<path d="M7 8a5 5 0 0 1 10 0c0 3-5 3-5 6"/><circle cx="12" cy="20" r="1.8" fill="currentColor" stroke="none"/>',
  key: '<circle cx="8" cy="8" r="4.8"/><path d="m11.5 11.5 9 9m-6-6 3-3m0 6 3-3"/>',
  lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="3" y="9" width="18" height="14" rx="3" fill="currentColor" stroke="none"/><path d="M12 14v4" stroke="#294c42" stroke-width="2.5"/>',
  lid: '<g transform="rotate(-14 12 11)"><path d="M3 15C4 5 20 5 21 15Z" fill="currentColor" stroke="none"/><path d="M10 7V4h4v3M2 15h20" stroke-width="2.8"/></g><path d="M3 21h18" stroke="#61796d" stroke-width="2"/>',
  swap: '<path d="M2 6h12V1l9 7-9 7v-5H2zm20 12H10v5l-9-7 9-7v5h12z" fill="currentColor" stroke="none"/>',
  rotate: '<path d="M19 8a8 8 0 1 0 1 8"/><path d="M21 1v10H11z" fill="currentColor" stroke="none"/>',
};
export type GameIcon = keyof typeof paths;
export function gameIcon(name: GameIcon): string {
  return `<svg class="game-icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}


export function bucketMarks(game: Game, bucket: BucketSpec, hidden = false): string {
  const color = hidden ? '#77867f' : game.palette[bucket.color];
  let marks = '';
  if (game.mechanics.gates.some(g => g.key === bucket.id)) marks += gameIcon('key');
  if (game.mechanics.lids.some(l => l.key === bucket.id)) marks += gameIcon('lid');
  if (bucket.swapWith !== undefined) {
    const partner = game.field.find(b => b?.id === bucket.swapWith);
    const nextColor = !hidden && partner && !game.isHidden(partner) ? game.palette[partner.color] : '#77867f';
    marks += `<span style="color:${nextColor}">${gameIcon('swap')}</span><small class="swap-number">${Math.min(bucket.id,bucket.swapWith)+1}</small>`;
  }
  return `<span class="bucket-roles" style="color:${color}">${marks}</span>`;
}

export function nextBuckets(game: Game, buckets: BucketSpec[], hidden = false): string {
  return buckets.map(b => `<i class="next-bucket" style="color:${hidden || b.hidden ? '#9ba49e' : game.palette[b.color]}">${bucketIcon}${hidden || b.hidden ? '<b>?</b>' : ''}</i>`).join('');
}

export function keyColor(game: Game, id: number): string {
  const bucket = game.field.find(b => b?.id === id);
  if (bucket) return game.isHidden(bucket) ? '#9ba49e' : game.palette[bucket.color];
  const moving = game.slots.find(b => b?.id === id);
  return moving ? game.palette[moving.color] : '#9ba49e';
}

export const yokeIcon = '<svg viewBox="17 0 115 50" preserveAspectRatio="none" aria-hidden="true"><path class="yoke-hook" d="M17 24v7q0 5 5 5m110-12v7q0 5-5 5"/><path class="yoke-wood" d="M13 24Q75 3 136 24"/><path class="yoke-highlight" d="M15 22Q75 3 134 22"/><path class="yoke-grain" d="M44 16q19-5 35-3m15 2 17 3"/></svg>';
