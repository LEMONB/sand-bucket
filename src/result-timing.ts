import type { Status } from './game';

export function resultReady(status: Status, beltBusy: boolean, secondsSinceLoss: number): boolean {
  return status === 'won' ? !beltBusy : status === 'lost' && secondsSinceLoss >= 1;
}
