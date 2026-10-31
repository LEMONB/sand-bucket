import type { BucketSpec } from './game';

export interface Queue { cell: number; buckets: BucketSpec[]; hidden?: boolean }
export interface Platform { cells: number[]; next: BucketSpec[]; hidden?: boolean }
export interface Gate { cells: number[]; key: number }
export interface Lid { x: number; y: number; width: number; height: number; key: number }
export interface Mechanics {
  queues: Queue[];
  platforms: Platform[];
  // Legacy catalog field; mechanic ID 4 stays reserved for saved progress.
  bridges: { cells: number[]; passage: number[] }[];
  trays: number[][];
  gates: Gate[];
  lids: Lid[];
  links: number[][];
}
export function emptyMechanics(): Mechanics {
  return { queues: [], platforms: [], bridges: [], trays: [], gates: [], lids: [], links: [] };
}
