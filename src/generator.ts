import { Game, PALETTE, WIDTH, HEIGHT, COLLECTION_DEPTH, exitPaths, type BucketSpec, type Level, type Speed } from './game.ts';
import { catalogArtwork, artworkIndex, artworkPalette } from './art-catalog.ts';
import { arrangeMechanics, mechanicsFor } from './level-mechanics.ts';
import type { Mechanics } from './mechanics.ts';

export const GENERATOR_VERSION = 6;
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
  const exposed = Array(PALETTE.length).fill(false);
  for (let i = (HEIGHT - COLLECTION_DEPTH) * WIDTH; i < game.cells.length; i++) if(!game.held[i])exposed[game.cells[i]] = true;
  return exposed;
}
export function replay(level: Level, solution: readonly Move[], maxSteps = MAX_STEPS, speed:Speed=2, usedPaths?:Set<number>): Game {
  const game = new Game(level);
  let move = 0;
  while (game.status === 'playing' && game.tick < maxSteps) {
    while (move < solution.length && solution[move].tick === game.tick) {
      if (game.launch(solution[move].bucketId) !== 'ok') throw new Error(`Недоступный ход ${move}`);
      for(const event of game.events)if(event.type==='launch')event.path?.forEach(i=>usedPaths?.add(i));
      move++;
    }
    game.step(2/speed); game.events.length = 0;
  }
  if (game.status !== 'won' || move !== solution.length) throw new Error('Решение не подтверждено');
  return game;
}

class Unsolved extends Error {
  readonly game:Game;
  constructor(game:Game) { super('Решение не найдено'); this.game=game; }
}

export function solve(level: Level, delay = 0, speed:Speed=2): {game:Game;solution:Move[]} {
  const game=new Game(level),solution:Move[]=[];
  let readyAt=-1;
  while(game.status==='playing'&&game.tick<MAX_STEPS){
    const exposed=exposedColors(game);
    const index=[...game.paths.keys()].sort((a,b)=>game.field[a]!.color-game.field[b]!.color||game.field[a]!.capacity-game.field[b]!.capacity).find(i=>{
      const b=game.field[i]!;
      if(!exposed[b.color]||game.slots.some(s=>s?.color===b.color))return false;
      const pair=game.mechanics.links.find(p=>p.includes(b.id));
      if(pair&&game.slots.filter(s=>!s).length>=2){
        const other=game.field.find(o=>o?.id===pair.find(id=>id!==b.id));
        if(other&&(!exposed[other.color]||game.slots.some(s=>s?.color===other.color)))return false;
      }
      return true;
    });
    if(index!==undefined&&game.motionTick>=game.busyUntil&&game.slots.includes(null)){
      if(readyAt<0)readyAt=game.tick+delay;
      if(game.tick>=readyAt){
        const bucket=game.field[index]!;
        if(game.launch(bucket.id)!=='ok')throw Error('Ошибка поиска решения');
        solution.push({tick:game.tick,bucketId:bucket.id});readyAt=-1;
      }
    }else readyAt=-1;
    game.step(2/speed);game.events.length=0;
  }
  if(game.status!=='won')throw new Unsolved(game);
  return {game,solution};
}

// Shorten a stalled bucket and keep its remaining sand in a later bucket of that color.
function rebalance(level:Level,failed:Game):boolean {
  const all=[...level.field,...(level.mechanics?.queues.flatMap(q=>q.buckets)??[]),...(level.mechanics?.platforms.flatMap(p=>p.next)??[])].filter((b):b is BucketSpec=>!!b);
  const later=[...failed.field,...failed.mechanics.queues.flatMap(q=>q.buckets),...failed.mechanics.platforms.flatMap(p=>p.next)].filter((b):b is BucketSpec=>!!b);
  const reserved=new Set([...(level.walls??[]),...(level.mechanics?.trays.flat()??[]),...(level.mechanics?.gates.flatMap(g=>g.cells)??[]),...(level.mechanics?.bridges.flatMap(b=>[...b.cells,...b.passage])??[]),...(level.mechanics?.platforms.flatMap(p=>p.cells)??[]),...(level.mechanics?.queues.map(q=>q.cell)??[])]);
  for(const partial of failed.buckets.filter(b=>b.filled>0&&b.filled<b.capacity).sort((a,b)=>b.filled/b.capacity-a.filled/a.capacity)){
    const original=all.find(b=>b.id===partial.id)!;
    if(original.swapWith!==undefined)continue;
    const receiver=later.find(b=>b.color===partial.color&&all.find(o=>o.id===b.id)!.swapWith===undefined);
    const remainder=partial.capacity-partial.filled;
    if(receiver)all.find(b=>b.id===receiver.id)!.capacity+=remainder;
    else{
      let cell=level.field.length-1;
      while(cell>=0&&(level.field[cell]||reserved.has(cell)))cell--;
      if(cell<0)continue;
      level.field[cell]={id:Math.max(...all.map(b=>b.id))+1,color:partial.color,capacity:remainder};
    }
    original.capacity=partial.filled;
    return true;
  }
  return false;
}

function candidate(number: number, seed: number, random: () => number, fallbackColumns?:number): GeneratedLevel {
  const columns = fallbackColumns ?? difficulty(number) + 4;
  const kinds=fallbackColumns ? [] : mechanicsFor(number,columns);
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
  const counts = Array(PALETTE.length).fill(0);
  for (const color of cells) counts[color]++;
  const quantity: number[] = counts.map((count,i)=>i&&count?1:0);
  const total = columns ** 2 - walls.size - columns;
  for (let i = quantity.reduce((a,b)=>a+b,0); i < total; i++) {
    let color = 1;
    for (let c = 2; c < PALETTE.length; c++) if (counts[c] / quantity[c] > counts[color] / quantity[color]) color = c;
    quantity[color]++;
  }
  const specs: BucketSpec[] = [];
  for (let color = 1; color < PALETTE.length; color++) {
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
    for (let color = 1; color < PALETTE.length; color++) {
      if (!game.slots.includes(null)) break;
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
    if((game.status as string)==='lost'){
      const partial=game.slots.filter(b=>b&&b.filled>0).sort((a,b)=>b!.filled/b!.capacity-a!.filled/a!.capacity)[0];
      if(!partial)break;
      const remainder=partial.capacity-partial.filled;
      const receiver=game.field.find(b=>b?.color===partial.color);
      if(!receiver&&specs.length>=columns**2-walls.size)break;
      specs[partial.id].capacity=partial.filled;
      if(receiver){receiver.capacity+=remainder;specs[receiver.id].capacity=receiver.capacity;}
      else{
        const bucket={id:specs.length,color:partial.color,capacity:remainder};
        specs.push(bucket);game.field[game.field.indexOf(null)]={...bucket};
      }
      game.slots[game.slots.indexOf(partial)]=null;game.status='playing';game.refreshField();
    }
  }
  if (game.status !== 'won' || order.length !== specs.length) throw new Error('Нет решения');
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
  let checked:ReturnType<typeof solve>|undefined;
  const usedPaths=new Set<number>();
  for(let repair=0;repair<8;repair++){
    try{
      usedPaths.clear();checked=solve(level);
      for(const speed of [1,2] as const){
        const proof=speed===2?checked:solve(level,0,speed);
        replay(level,proof.solution,MAX_STEPS,speed,usedPaths);
      }
      break;
    }catch(error){
      checked=undefined;
      if(!(error instanceof Unsolved)||!rebalance(level,error.game))throw error;
    }
  }
  if(!checked)throw Error('Не удалось сбалансировать вместимости');
  const protectedCells=new Set([...(mechanics?.trays.flat()??[]),...(mechanics?.gates.flatMap(g=>g.cells)??[]),...(mechanics?.bridges.flatMap(b=>b.passage)??[])]);
  const spaces=field.flatMap((b,i)=>!b&&!walls.has(i)&&!protectedCells.has(i)?[i]:[]);
  const eligible=spaces.filter(i=>!usedPaths.has(i));
  for(let i=eligible.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
  // None of the certified routes visits these cells, so adding walls preserves every proof.
  eligible.slice(0,Math.ceil(spaces.length*.65)).forEach(i=>walls.add(i));
  level.walls=[...walls];replay(level,checked.solution);
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
