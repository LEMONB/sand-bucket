import { expect, it } from 'vitest';
import { wallConnections } from '../src/field-view';

it('joins a solid block on shared edges', () => {
  const walls = new Set([0, 1, 5, 6]);
  expect(wallConnections(0, 5, walls)).toEqual(['wall-right', 'wall-down']);
  expect(wallConnections(1, 5, walls)).toEqual(['wall-down', 'wall-left']);
  expect(wallConnections(5, 5, walls)).toEqual(['wall-up', 'wall-right']);
  expect(wallConnections(6, 5, walls)).toEqual(['wall-up', 'wall-left']);
});

it('keeps diagonal walls, isolated cells and row boundaries separate', () => {
  const walls = new Set([4, 5, 11]);
  for (const i of walls) expect(wallConnections(i, 5, walls)).toEqual([]);
  expect(wallConnections(6, 5, walls)).toEqual([]);
});

it('joins an L shape without extending into its open corner', () => {
  const walls = new Set([6, 7, 11]);
  expect(wallConnections(6, 5, walls)).toEqual(['wall-right', 'wall-down']);
  expect(wallConnections(7, 5, walls)).toEqual(['wall-left']);
  expect(wallConnections(11, 5, walls)).toEqual(['wall-up']);
  expect(wallConnections(12, 5, walls)).toEqual([]);
});
