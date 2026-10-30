import { expect,it } from 'vitest';
import { Game, WIDTH, HEIGHT, LAUNCH_TICKS, type BucketSpec, type Level } from '../src/game';
import { emptyMechanics } from '../src/mechanics';

const bucket=(id:number,color=1,capacity=20):BucketSpec=>({id,color,capacity});
function fixture(entries:Record<number,BucketSpec>, change:(level:Level)=>void=()=>{}):Level {
  const field=Array<BucketSpec|null>(16).fill(null);
  Object.entries(entries).forEach(([i,b])=>{field[Number(i)]=b;});
  const level:Level={field,cells:new Uint8Array(WIDTH*HEIGHT),mechanics:emptyMechanics()};
  change(level);
  let cursor=level.cells.length-1;
  for(const b of [...field,...level.mechanics!.queues.flatMap(q=>q.buckets),...level.mechanics!.platforms.flatMap(p=>p.next)])if(b)for(let i=0;i<b.capacity;i++)level.cells[cursor--]=b.color;
  return level;
}
function advance(game:Game,ticks=LAUNCH_TICKS+10):void {for(let i=0;i<ticks;i++)game.step();}

it('queues reveal one bucket after departure and do not exceed five',()=>{
  const level=fixture({0:bucket(0)},l=>{l.mechanics!.queues=[{cell:0,buckets:[bucket(1),bucket(2),bucket(3),bucket(4)]}];});
  const game=new Game(level);expect(game.launch(0)).toBe('ok');expect(game.field[0]).toBeNull();
  advance(game);expect(game.field[0]?.id).toBe(1);expect(game.mechanics.queues[0].buckets).toHaveLength(3);
  level.mechanics!.queues[0].buckets.push(bucket(5));expect(()=>new Game(level)).toThrow();
});
it('rotates the tray clockwise once per successful turn, including empty positions',()=>{
  const game=new Game(fixture({0:bucket(0),1:bucket(1),4:bucket(2),5:bucket(3),2:bucket(4)},l=>{l.mechanics!.trays=[[0,1,5,4]];}));
  expect(game.launch(4)).toBe('ok');expect(game.launch(3)).toBe('blocked');advance(game);
  expect([0,1,5,4].map(i=>game.field[i]?.id)).toEqual([2,0,1,3]);expect(game.turns).toBe(1);
  expect(game.launch(2)).toBe('ok');advance(game);expect(game.field[1]).toBeNull();
});
it('reveals the next platform layer only after all upper buckets leave',()=>{
  const game=new Game(fixture({0:bucket(0),1:bucket(1)},l=>{l.mechanics!.platforms=[{cells:[0,1],next:[bucket(2),bucket(3)]}];}));
  game.launch(0);advance(game);expect(game.field[0]).toBeNull();
  game.launch(1);advance(game);expect(game.field.slice(0,2).map(b=>b?.id)).toEqual([2,3]);
  expect(game.mechanics.platforms[0].next).toHaveLength(0);
});
it('removes the whole bridge when its last bucket departs',()=>{
  const game=new Game(fixture({0:bucket(0),1:bucket(1),8:bucket(2)},l=>{l.mechanics!.bridges=[{cells:[0,1],passage:[4,5]}];}));
  game.launch(0);advance(game);expect(game.mechanics.bridges).toHaveLength(1);
  game.launch(1);advance(game);expect(game.mechanics.bridges).toHaveLength(0);expect(game.paths.has(8)).toBe(true);
});
it('sends a linked pair as one turn, or the clicked bucket alone when one slot remains',()=>{
  const level=fixture({0:bucket(0),1:bucket(1)},l=>{l.mechanics!.links=[[0,1]];});
  const pair=new Game(level);pair.launch(1);expect(pair.slots.filter(Boolean).map(b=>b!.id)).toEqual([1,0]);expect(pair.turns).toBe(1);expect(pair.events.map(e=>e.partnerId)).toEqual([0,1]);
  const single=new Game(level);
  for(let i=0;i<4;i++)single.slots[i]={...bucket(10+i),filled:0,arrivalTick:LAUNCH_TICKS};
  expect(single.launch(1)).toBe('ok');expect(single.field[0]?.id).toBe(0);expect(single.mechanics.links).toHaveLength(0);expect(single.events[0].partnerId).toBeUndefined();
  expect(single.launch(0)).toBe('full');expect(single.turns).toBe(1);
});
it('exchanges colors in equal-capacity pairs and freezes both when one leaves',()=>{
  const game=new Game(fixture({0:{...bucket(0,1),swapWith:1},1:{...bucket(1,2),swapWith:0},2:bucket(2)}));
  game.launch(2);advance(game);
  expect(game.field[0]?.color).toBe(2);expect(game.field[1]?.color).toBe(1);
  game.launch(0);advance(game);
  expect(game.buckets.find(b=>b.id===0)?.color).toBe(2);
  expect(game.field[1]?.color).toBe(1);expect(game.field[1]?.swapWith).toBeUndefined();
});
it('rejects orphan switches, unequal capacities and per-color sand mismatches',()=>{
  expect(()=>new Game(fixture({0:{...bucket(0),swapWith:1}}))).toThrow();
  expect(()=>new Game(fixture({0:{...bucket(0),swapWith:1},1:{...bucket(1,2,21),swapWith:0}}))).toThrow();
  const level=fixture({0:{...bucket(0),swapWith:1},1:{...bucket(1,2),swapWith:0}});
  level.cells[level.cells.length-1]=2;expect(()=>new Game(level)).toThrow();
});
it.each([0,1])('preserves each color through repeated exchanges and departure of partner %i',id=>{
  const game=new Game(fixture({0:{...bucket(0,1),swapWith:1},1:{...bucket(1,2),swapWith:0},2:bucket(2,3),3:bucket(3,4)}));
  const balanced=()=>{
    for(let color=1;color<=8;color++){
      const grains=game.cells.reduce((n,c)=>n+Number(c===color),0);
      const capacity=game.field.reduce((n,b)=>n+(b?.color===color?b.capacity:0),0)+game.buckets.reduce((n,b)=>n+(b.color===color?b.capacity-b.filled:0),0);
      expect(capacity).toBe(grains);
    }
  };
  for(const other of [2,3]){game.launch(other);advance(game);balanced();}
  expect(game.field[0]?.color).toBe(1);expect(game.field[1]?.color).toBe(2);
  expect(game.launch(id)).toBe('ok');advance(game);balanced();
  expect(game.field[1-id]?.swapWith).toBeUndefined();
});
it('holds covered grains until the matching key bucket fills, also opening its gate',()=>{
  const level=fixture({0:bucket(0,1,1),1:bucket(1,2,1)},l=>{
    l.mechanics!.lids=[{x:5,y:5,width:1,height:1,key:0}];l.mechanics!.gates=[{cells:[4],key:0}];
  });
  level.cells.fill(0);level.cells[5*WIDTH+5]=2;level.cells[(HEIGHT-1)*WIDTH+6]=1;
  const game=new Game(level);advance(game,10);expect(game.cells[5*WIDTH+5]).toBe(2);
  game.launch(0);for(let i=0;i<400&&game.mechanics.lids.length;i++)game.step();
  expect(game.mechanics.lids).toHaveLength(0);expect(game.mechanics.gates).toHaveLength(0);expect(game.held[5*WIDTH+5]).toBe(0);
  advance(game,HEIGHT);
  expect(game.cells.slice(0,(HEIGHT-1)*WIDTH).some(Boolean)).toBe(false);
  expect(game.cells.slice((HEIGHT-1)*WIDTH)).toContain(2);
});
it('rejects intersecting regions, missing keys and duplicate bucket IDs',()=>{
  const level=fixture({0:bucket(0),1:bucket(1),4:bucket(2),5:bucket(3)},l=>{l.mechanics!.trays=[[0,1,5,4]];l.mechanics!.queues=[{cell:0,buckets:[bucket(4)]}];});
  expect(()=>new Game(level)).toThrow();
  const missing=fixture({0:bucket(0)},l=>{l.mechanics!.gates=[{cells:[4],key:99}];});expect(()=>new Game(missing)).toThrow();
});

it('pulls an inaccessible linked partner along the selected bucket path', () => {
  const level = fixture({0:bucket(0),4:bucket(1)}, l => {
    l.walls = [1,2,3,5,6,7,8,9,10,11,12,13,14,15];
    l.mechanics!.links = [[0,1]];
  });
  const game = new Game(level);
  expect(game.paths.has(4)).toBe(false);
  expect(game.launch(1)).toBe('blocked');
  expect(game.launch(0)).toBe('ok');
  expect(game.buckets.map(b => b.id)).toEqual([0,1]);
  expect(game.events.map(e => e.path)).toEqual([[0],[4,0]]);
  expect(game.events.map(e => e.partnerId)).toEqual([1,0]);
  expect(game.turns).toBe(1);
  expect(game.mechanics.links).toHaveLength(0);

  const single = new Game(level);
  for (let i=0;i<4;i++) single.slots[i]={...bucket(10+i),filled:0,arrivalTick:LAUNCH_TICKS};
  expect(single.launch(0)).toBe('ok');
  expect(single.field[4]?.id).toBe(1);
  expect(single.mechanics.links).toHaveLength(0);
  expect(single.launch(1)).toBe('full');
});

it('does not declare loss when only one member of a linked pair is accessible', () => {
  const level = fixture({0:bucket(0),4:bucket(1)}, l => {
    l.walls = [1,2,3,5,6,7,8,9,10,11,12,13,14,15];
    l.mechanics!.links = [[0,1]];
  });
  const game = new Game(level);
  for (let i=0;i<1000;i++) game.step();
  expect(game.status).toBe('playing');
  expect(game.launch(0)).toBe('ok');
});
