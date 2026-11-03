import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT, COLLECTION_DEPTH, type Level, type Speed, type BucketSpec } from '../../src/game.ts';

export const CALIBRATION_LEVELS = [1,2,3,4,5,101,102,103,104,105,201,202,203,204,205,301,302,303,304,305];
export const POLICY_NAMES = ['Сверху слева', 'Снизу справа', 'Меньшее ведро', 'Большее ведро'] as const;

// These policies inspect only current visible colors; they never search future states.
export function reactiveChoices(game:Game):BucketSpec[] {
  if(game.status!=='playing'||game.motionTick<game.busyUntil||!game.slots.includes(null))return [];
  const colors=new Set<number>();
  for(let i=(HEIGHT-COLLECTION_DEPTH)*WIDTH;i<game.cells.length;i++){
    if(!game.held[i]&&game.cells[i])colors.add(game.cells[i]);
  }
  const useful=(bucket:BucketSpec)=>!game.isHidden(bucket)&&colors.has(bucket.color)&&!game.buckets.some(b=>b.color===bucket.color);
  return [...game.paths.keys()].sort((a,b)=>a-b).map(i=>game.field[i]!).filter(bucket=>{
    if(!useful(bucket))return false;
    const pair=game.mechanics.links.find(p=>p.includes(bucket.id));
    const partner=pair&&game.field.find(b=>b&&b.id!==bucket.id&&pair.includes(b.id));
    return !partner||game.slots.filter(b=>!b).length<2||useful(partner);
  });
}

export function probePolicy(level:Level, speed:Speed, policy:number, maxTicks=30000) {
  assert(Number.isInteger(policy)&&policy>=0&&policy<POLICY_NAMES.length);
  assert(Number.isSafeInteger(maxTicks)&&maxTicks>0);
  const game=new Game(level), moves:{tick:number;bucketId:number;choices:number[]}[]=[];
  while(game.status==='playing'&&game.tick<maxTicks){
    const choices=reactiveChoices(game);
    if(policy===1)choices.reverse();
    if(policy===2)choices.sort((a,b)=>a.capacity-b.capacity);
    if(policy===3)choices.sort((a,b)=>b.capacity-a.capacity);
    if(choices.length){
      moves.push({tick:game.tick,bucketId:choices[0].id,choices:choices.map(b=>b.id)});
      assert.equal(game.launch(choices[0].id),'ok');
    }
    game.step(2/speed);game.events.length=0;
  }
  return {policy,speed,outcome:game.status==='playing'?'unresolved':game.status,ticks:game.tick,collected:game.collected,total:game.total,moves};
}
