import { Game, WIDTH, HEIGHT, COLLECTION_DEPTH, exitPaths, type BucketSpec, type Level } from './game.ts';
import { catalogArtwork, artworkIndex, artworkPalette } from './art-catalog.ts';
import { arrangeMechanics, mechanicsFor } from './level-mechanics.ts';
import type { Mechanics } from './mechanics.ts';

export const GENERATOR_VERSION = 5;
export const MAX_STEPS = 30_000;
export const MAX_ATTEMPTS = 24;
export interface Move { tick: number; bucketId: number }
export interface GeneratedLevel {
  version: number;
  number: number;
  seed: number;
  columns: number;
  walls: number[];
  cells: number[];
  field: (BucketSpec | null)[];
  solution: Move[];
  victoryTick: number;
  fallback?: boolean;
  mechanics?: Mechanics;
  kinds?: number[];
  art?: number;
  palette?: string[];
}
export const DIFFICULTIES = ['Простой', 'Средний', 'Сложный', 'Очень сложный'];
export function difficulty(number: number): number {
  const phase = (number - 1) % 9;
  return phase < 3 ? 0 : phase < 6 ? 1 : phase < 8 ? 2 : 3;
}
export function seedFor(number: number): number {
  return (Math.imul(number, 2654435761) ^ 20261029) >>> 0;
}
export function asLevel(record: GeneratedLevel): Level {
  return { cells: new Uint8Array(record.cells), field: record.field.map(b => b ? { ...b } : null), columns: record.columns, walls: [...record.walls], mechanics:record.mechanics, palette:record.palette };
}
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function exposedColors(game: Game): boolean[] {
  const exposed = [false, false, false, false, false];
  for (let i = (HEIGHT - COLLECTION_DEPTH) * WIDTH; i < game.cells.length; i++) if(!game.held[i])exposed[game.cells[i]] = true;
  return exposed;
}
export function replay(level: Level, solution: readonly Move[], maxSteps = MAX_STEPS): Game {
  const game = new Game(level);
  let move = 0;
  while (game.status === 'playing' && game.tick < maxSteps) {
    while (move < solution.length && solution[move].tick === game.tick) {
      if (game.launch(solution[move].bucketId) !== 'ok') throw new Error(`Недоступный ход ${move}`);
      move++;
    }
    game.step(); game.events.length = 0;
  }
  if (game.status !== 'won' || move !== solution.length) throw new Error('Решение не подтверждено');
  return game;
}

export function solve(level: Level, delay = 0): {game:Game;solution:Move[]} {
  const game=new Game(level),solution:Move[]=[];
  const needed=[0,0,0,0,0];
  for(const color of level.cells)needed[color]++;
  const all=[...level.field,...(level.mechanics?.queues.flatMap(q=>q.buckets)??[]),...(level.mechanics?.platforms.flatMap(p=>p.next)??[])];
  for(const bucket of all)if(bucket&&!bucket.alternate)needed[bucket.color]-=bucket.capacity;
  let readyAt=-1;
  while(game.status==='playing'&&game.tick<MAX_STEPS){
    const exposed=exposedColors(game);
    const index=[...game.paths.keys()].find(i=>{
      const b=game.field[i]!;
      if(!exposed[b.color]||game.slots.some(s=>s?.color===b.color)||(b.alternate&&needed[b.color]<b.capacity))return false;
      const pair=game.mechanics.links.find(p=>p.includes(b.id));
      if(pair&&game.slots.filter(s=>!s).length>=2){
        const other=game.field.find(o=>o?.id===pair.find(id=>id!==b.id));
        if(other&&(!exposed[other.color]||game.slots.some(s=>s?.color===other.color)))return false;
      }
      return true;
    });
    if(index!==undefined&&game.tick>=game.busyUntil&&game.slots.includes(null)){
      if(readyAt<0)readyAt=game.tick+delay;
      if(game.tick>=readyAt){
        const bucket=game.field[index]!;
        if(game.launch(bucket.id)!=='ok')throw Error('Ошибка поиска решения');
        if(bucket.alternate)needed[bucket.color]-=bucket.capacity;
        solution.push({tick:game.tick,bucketId:bucket.id});readyAt=-1;
      }
    }else readyAt=-1;
    game.step();game.events.length=0;
  }
  if(game.status!=='won')throw Error('Решение не найдено');
  return {game,solution};
}

function candidate(number: number, seed: number, random: () => number, fallbackColumns?:number): GeneratedLevel {
  const columns = fallbackColumns ?? difficulty(number) + 4;
  const kinds=fallbackColumns ? [] : mechanicsFor(number);
  const wallCount = kinds.length || columns === 4 ? 0 : (columns - 4) * 2 - Math.floor(random() * 2);
  const walls = new Set<number>();
  const empty = Array<BucketSpec | null>(columns ** 2).fill(null);
  for (let trial = 0; walls.size < wallCount && trial < 100; trial++) {
    const index = columns + Math.floor(random() * (columns ** 2 - columns));
    if (walls.has(index)) continue;
    walls.add(index);
    let connected = true;
    for (let i = 0; i < empty.length && connected; i++) {
      if (walls.has(i)) continue;
      empty[i] = { id: i, color: 1, capacity: 1 };
      connected = exitPaths(empty, columns, walls).has(i); empty[i] = null;
    }
    if (!connected) walls.delete(index);
  }
  if (walls.size !== wallCount) throw new Error('Не удалось разместить стены');
  const art=artworkIndex(number),cells = catalogArtwork(art),palette=artworkPalette(art);
  const counts = [0, 0, 0, 0, 0];
  for (const color of cells) counts[color]++;
  const quantity = [0, 1, 1, 1, 1];
  const total = columns ** 2 - walls.size - (kinds.length ? columns : 0);
  for (let i = 4; i < total; i++) {
    let color = 1;
    for (let c = 2; c <= 4; c++) if (counts[c] / quantity[c] > counts[color] / quantity[color]) color = c;
    quantity[color]++;
  }
  const specs: BucketSpec[] = [];
  for (let color = 1; color <= 4; color++) {
    let remaining = counts[color];
    for (let left = quantity[color]; left > 0; left--) {
      const capacity = left === 1 ? remaining : Math.max(1, Math.min(remaining - left + 1, Math.round(remaining / left * (.8 + random() * .4))));
      specs.push({ id: specs.length, color, capacity }); remaining -= capacity;
    }
  }
  const unconstrained = Array<BucketSpec | null>(columns ** 2).fill(null);
  specs.forEach((b, i) => { unconstrained[i] = b; });
  const game = new Game({ cells, field: unconstrained, columns });
  const order: number[] = [];
  while (game.status === 'playing' && game.tick < MAX_STEPS) {
    const exposed = exposedColors(game);
    for (let color = 1; color <= 4; color++) {
      if (!exposed[color] || game.slots.some(b => b?.color === color)) continue;
      const index = game.field.findIndex(b => b?.color === color);
      if (index < 0) continue;
      [game.field[0], game.field[index]] = [game.field[index], game.field[0]];
      game.paths = exitPaths(game.field, columns);
      const id = game.field[0]!.id;
      if (game.launch(id) !== 'ok') throw new Error('Ошибка построения маршрута');
      order.push(id);
    }
    game.step(); game.events.length = 0;
  }
  if (game.status !== 'won' || order.length !== total) throw new Error('Нет решения');
  const occupancy = Array.from({ length: columns ** 2 }, (_, id) => walls.has(id) ? null : { id, color: 1, capacity: 1 });
  let field = Array<BucketSpec | null>(columns ** 2).fill(null);
  for (const id of order) {
    const frontier = [...exitPaths(occupancy, columns, walls).keys()];
    const position = frontier[Math.floor(random() * frontier.length)];
    field[position] = specs[id]; occupancy[position] = null;
  }
  let mechanics:Mechanics|undefined;
  if(kinds.length)({field,mechanics}=arrangeMechanics(specs,order,columns,kinds,random));
  const level: Level = { cells, field, columns, walls: [...walls], mechanics,palette };
  // Choose the starting face so the alternating bucket has its required color on the certified turn.
  const alternate=field.find(b=>b?.alternate);
  if(alternate){
    let turns=order.indexOf(alternate.id);
    for(const pair of mechanics?.links??[])if(pair.every(id=>order.indexOf(id)<turns))turns--;
    if(turns%2)[alternate.color,alternate.alternate]=[alternate.alternate!,alternate.color];
  }
  const checked = solve(level);
  for (const delay of [6, 12, 18]) {
    const delayed=solve(level,delay);replay(level,delayed.solution);
  }
  replay(level, checked.solution);
  return { version: GENERATOR_VERSION, number, seed, columns, walls: [...walls], cells: [...cells], field, mechanics,kinds,art,palette, solution: checked.solution, victoryTick: checked.game.tick };
}
export function generateLevel(number: number, seed = seedFor(number), fallbackColumns?:number): GeneratedLevel {
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Неверный номер или seed');
  const random = randomFrom(seed);
  let cause:unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try { return candidate(number, seed, random, fallbackColumns); } catch(error) { cause=error; }
  }
  throw new Error('Лимит генерации исчерпан', {cause});
}
