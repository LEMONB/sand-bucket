import { expect, it } from 'vitest';
import { alternatingColor, linkedDeparture } from '../src/review-rules';

it('sends the clicked bucket alone when only one slot is free', () => {
  expect(linkedDeparture([0, 1], 1, 1)).toEqual([1]);
  expect(linkedDeparture([0, 1], 1, 2)).toEqual([1, 0]);
  expect(linkedDeparture([0], 0, 1)).toEqual([0]);
  expect(linkedDeparture([0, 1], 0, 0)).toEqual([]);
  expect(linkedDeparture([0], 1, 2)).toEqual([]);
});

it('alternates the bucket color once per successful turn', () => {
  expect([0,1,2,3,4].map(alternatingColor)).toEqual([0,1,0,1,0]);
});
