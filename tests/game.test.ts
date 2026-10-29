import { describe, expect, it } from 'vitest';
import { Game, WIDTH, HEIGHT, LAUNCH_TICKS, LOOP_TICKS, accessibleCells, exitPaths, advanceFrame, type BucketSpec, type Level } from '../src/game';
import { createLevel } from '../src/level';
const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };
const board = (size = 4): BucketSpec[] => Array.from({length: size ** 2}, (_, id) => ({id, color:1, capacity:1}));
function fixture(colors: number[], buckets: BucketSpec[]): Level {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  colors.forEach((c, i) => { cells[(HEIGHT - 1) * WIDTH + i + 4] = c; });
  return {cells, field:Array.from({length:16}, (_,i) => buckets[i] ?? null)};
}
describe('routes and walls', () => {
  it('finds winding paths but never crosses buckets, walls or diagonals', () => {
    const field: (BucketSpec|null)[] = board();
    for (const i of [0,4,8,9,10,6]) field[i] = null;
    expect(exitPaths(field).get(7)).toEqual([7,6,10,9,8,4,0]);
    expect(accessibleCells(field).has(15)).toBe(false);
    expect(accessibleCells(field,4,new Set([8])).has(7)).toBe(false);
    const diagonal: (BucketSpec|null)[] = board(); diagonal[0]=null; diagonal[5]=null;
    expect(accessibleCells(diagonal).has(9)).toBe(false);
  });
  for (const size of [4,5,6,7]) it(`supports ${size} columns without row wrapping`, () => {
    expect([...accessibleCells(board(size),size)]).toEqual(Array.from({length:size},(_,i)=>i));
  });
});
describe('simulation', () => {
  it('reserves the first slot immediately, opens a route and only collects after arrival', () => {
    const level=fixture([1], [{id:0,color:1,capacity:1}]); const g=new Game(level);
    expect(g.launch(0)).toBe('ok'); expect(g.slots[0]?.id).toBe(0); expect(g.field[0]).toBeNull();
    expect(g.events[0].path).toEqual([0]); run(g,LAUNCH_TICKS-1); expect(g.collected).toBe(0);
    g.step(); expect(g.collected).toBe(1); expect(g.status).toBe('won'); expect(g.slots[0]).toBeNull();
    expect(g.events.map(e=>e.type)).toEqual(['launch','arrive','complete']);
    expect(level.field[0]?.id).toBe(0);
  });
  it('collects five rows through other colors, excludes sixth row and respects capacity', () => {
    const cells=new Uint8Array(WIDTH*HEIGHT); cells.fill(2);
    cells[(HEIGHT-5)*WIDTH+6]=1; cells[(HEIGHT-6)*WIDTH+6]=1;
    const field=Array<BucketSpec|null>(16).fill(null); field[0]={id:0,color:1,capacity:2};field[1]={id:1,color:2,capacity:cells.length-2};
    const g=new Game({cells,field});g.launch(0);run(g,LAUNCH_TICKS);
    expect(g.collected).toBe(1);expect(g.slots[0]?.filled).toBe(1);
    expect(g.cells.filter(c=>c===2)).toHaveLength(cells.length-2);
  });
  it('keeps five slots evenly spaced across wrapping', () => {
    const g=new Game(createLevel()); const before=g.slots.map((_,i)=>g.slotPosition(i));run(g,LOOP_TICKS);
    expect(g.slots.map((_,i)=>g.slotPosition(i))).toEqual(before);
    expect(before).toEqual([0,.2,.4,.6,.8]);
  });
  it('requires a quiet revolution before declaring a full belt stuck', () => {
    const cells=new Uint8Array(WIDTH*HEIGHT);cells.fill(1);cells[0]=2;
    const field=board().map((b,i)=>({...b,color:i<5?2:1,capacity:i<5?1:1}));
    cells.fill(2,0,5);
    field[5].capacity=cells.length-15;
    const g=new Game({cells,field});for(let i=0;i<5;i++)expect(g.launch(i)).toBe('ok');
    run(g,LOOP_TICKS-1);expect(g.status).toBe('playing');g.step();expect(g.status).toBe('lost');
  });
  it('conserves grains and restarts from an unchanged level', () => {
    const level=createLevel(), g=new Game(level);g.field.slice(0,4).forEach(b=>b&&g.launch(b.id));run(g,720);
    expect(g.cells.filter(Boolean).length+g.collected).toBe(g.total);
    expect(g.buckets.every(b=>b.filled<=b.capacity)).toBe(true);
    expect(new Game(level).collected).toBe(0);expect(level.cells).toEqual(createLevel().cells);
  });
  it('rejects malformed cells, capacities, IDs, dimensions and wall overlaps', () => {
    const level=createLevel();level.field[0]!.capacity++;
    expect(()=>new Game(level)).toThrow();
    expect(()=>new Game({...createLevel(),columns:8})).toThrow();
    expect(()=>new Game({...createLevel(),walls:[0]})).toThrow();
    const duplicate=createLevel();duplicate.field[1]!.id=duplicate.field[0]!.id;expect(()=>new Game(duplicate)).toThrow();
  });
  it('×2 uses identical steps and events for the same simulation-time actions', () => {
    const a=new Game(createLevel()),b=new Game(createLevel());const id=a.field[0]!.id;a.launch(id);b.launch(id);
    let ra=0,rb=0;for(let i=0;i<1000;i++){ra=advanceFrame(a,1/60,1,ra);rb=advanceFrame(b,1/120,2,rb);}
    expect(a.cells).toEqual(b.cells);expect(a.events).toEqual(b.events);expect(a.slots).toEqual(b.slots);
  });
});
