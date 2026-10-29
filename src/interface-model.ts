export type DemoCell = number | 'wall' | null;

// Preview fixtures only; production generation follows interface approval.
export function demoField(size: number): DemoCell[] {
  const walls = [size + 1, 2 * size + size - 2, 3 * size + 1, 4 * size + 3, 2 * size + 3, 5 * size + 5];
  const count = size === 4 ? 0 : (size - 4) * 2;
  return Array.from({ length: size * size }, (_, i) => walls.slice(0, count).includes(i) ? 'wall' : 1 + ((i * 7 + Math.floor(i / size)) % 4));
}

export function exitPath(field: DemoCell[], size: number, target: number): number[] | null {
  const queue = Array.from({ length: size }, (_, i) => i);
  const parent = new Map<number, number>(queue.map(i => [i, -1]));
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    if (index === target && typeof field[index] === 'number') {
      const path = [index];
      while (parent.get(path[path.length - 1]) !== -1) path.push(parent.get(path[path.length - 1])!);
      return path;
    }
    if (field[index] !== null) continue;
    const x = index % size;
    for (const next of [index - size, index + size, x > 0 ? index - 1 : -1, x < size - 1 ? index + 1 : -1]) {
      if (next >= 0 && next < field.length && !parent.has(next)) {
        parent.set(next, index);
        queue.push(next);
      }
    }
  }
  return null;
}
