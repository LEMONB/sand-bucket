import { Game, WIDTH, HEIGHT, COLLECTION_DEPTH, type Level, type Speed } from '../../src/game.ts';
import { reactiveChoices, probePolicy } from './difficulty-audit.ts';
import { replayDecisions, type Decision, type Proof } from './solver.ts';

function colorsAtBottom(game:Game):Set<number> {
  const colors=new Set<number>();
  for(let i=(HEIGHT-COLLECTION_DEPTH)*WIDTH;i<game.cells.length;i++)if(!game.held[i]&&game.cells[i])colors.add(game.cells[i]);
  return colors;
}
function canProgress(game:Game):boolean {
  const colors=colorsAtBottom(game);
  return game.buckets.some(b=>colors.has(b.color))||reactiveChoices(game).length>0;
}
function visibleChoices(game:Game):number[] {
  return [...game.paths.keys()].filter(i=>{
    const bucket=game.field[i]!;
    const pair=game.mechanics.links.find(p=>p.includes(bucket.id));
    return !pair||pair.every(id=>{const b=game.field.find(b=>b?.id===id);return !b||!game.isHidden(b);});
  });
}

// Bounded exploration reports unknown separately; it never turns a timeout into difficulty evidence.
export function openingDepth(game:Game):number|null {
  if(canProgress(game))return 0;
  if(game.status!=='playing'||game.motionTick<game.busyUntil||game.buckets.some(b=>b.arrivalTick>game.motionTick))return null;
  let frontier=[game],nodes=0;
  for(let depth=1;depth<=3;depth++){
    const next:Game[]=[];
    for(const parent of frontier)for(const cell of visibleChoices(parent)){
      if(++nodes>256)return null;
      const child=parent.clone();
      if(child.launch(child.field[cell]!.id)!=='ok')continue;
      const collected=child.collected;
      for(let tick=0;tick<30&&child.status==='playing';tick++){child.step(2);child.events.length=0;}
      if(child.collected>collected||canProgress(child))return depth;
      if(child.status==='playing'&&child.slots.includes(null))next.push(child);
    }
    frontier=next;
  }
  return null;
}

export function planningProbe(level:Level,speed:Speed,policy:number,mistakeAfter:number|null=null) {
  const game=new Game(level),completed=new Set<number>(),decisions:Decision[]=[];
  let peakSlots=0,unproductive=0,nextAt=0;
  while(game.status==='playing'&&game.tick<30000){
    if(game.motionTick>=game.busyUntil&&game.slots.includes(null)&&game.tick>=nextAt){
      const colors=colorsAtBottom(game);
      const careless=mistakeAfter!==null&&completed.size>=mistakeAfter;
      let choices=careless?visibleChoices(game).map(i=>game.field[i]!):reactiveChoices(game);
      if(!choices.length&&!game.buckets.some(b=>colors.has(b.color))){
        choices=visibleChoices(game).map(i=>game.field[i]!);
      }
      choices.sort((a,b)=>policy===0?a.id-b.id:policy===1?b.id-a.id:policy===2?a.capacity-b.capacity:b.capacity-a.capacity);
      if(choices.length){
        const bucket=choices[0],exposed=colors.has(bucket.color);
        const move={bucketId:bucket.id,collected:game.collected,completed:[...completed],exposed};
        if(game.launch(bucket.id)==='ok'){decisions.push(move);if(!exposed)unproductive++;if(careless)nextAt=game.tick+120;}
      }
    }
    peakSlots=Math.max(peakSlots,game.buckets.length);
    game.step(2/speed);
    for(const event of game.events)if(event.type==='complete')completed.add(event.bucket.id);
    game.events.length=0;
  }
  return {status:game.status,completed:completed.size,collected:game.collected,proof:{speed,pause:0,decisions,ticks:game.tick,peakSlots,unproductive,nodes:0} satisfies Proof};
}

export function assessPlanning(level:Level,difficulty:number,proofs:Proof[]) {
  const reactive=([1,2] as const).map(speed=>[0,1,2,3].map(policy=>probePolicy(level,speed,policy).outcome));
  const wins=reactive.map(results=>results.filter(r=>r==='won').length);
  if(difficulty===0)return {accepted:wins.every(n=>n===4),reactive,wins};
  if(difficulty===1)return {accepted:wins.every(n=>n>=2)&&wins.some(n=>n<4),reactive,wins};
  let depth=openingDepth(new Game(level))??0,afterCompletionDepth=0;
  const reference=proofs.find(p=>p.speed===1&&p.pause===0)!;
  let revision=-1,completed=0;
  replayDecisions(level,reference.decisions,1,0,game=>{
    for(const e of game.events)if(e.type==='complete')completed++;
    if(game.fieldRevision===revision||game.motionTick<game.busyUntil||game.buckets.some(b=>b.arrivalTick>game.motionTick)||canProgress(game))return;
    revision=game.fieldRevision;
    const required=openingDepth(game);
    if(required!==null){depth=Math.max(depth,required);if(completed)afterCompletionDepth=Math.max(afterCompletionDepth,required);}
  });
  const badOrders=[];
  if(difficulty>=3)for(let policy=0;policy<4;policy++){
    const outcomes=([1,2] as const).map(speed=>planningProbe(level,speed,policy,difficulty===4?1:0));
    if(outcomes.every(o=>o.status==='lost'&&(difficulty!==4||o.completed>0)))badOrders.push({policy,orders:outcomes.map(o=>o.proof.decisions)});
  }
  return {accepted:wins.every(n=>n===0)&&depth>=(difficulty===2?1:2)&&(difficulty<3||badOrders.length>0),reactive,wins,depth,afterCompletionDepth,badOrders};
}
