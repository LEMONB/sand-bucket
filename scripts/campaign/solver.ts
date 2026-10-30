import { rebalance } from '../../src/generator.ts';
import { createHash } from 'node:crypto';
import { Game, WIDTH, HEIGHT, COLLECTION_DEPTH, LOOP_TICKS, type Level, type Speed } from '../../src/game.ts';

export interface Decision { bucketId:number; collected:number; completed:number[]; exposed:boolean }
export interface Proof { speed:Speed; pause:number; decisions:Decision[]; ticks:number; peakSlots:number; unproductive:number; nodes:number }
const MAX_TICKS=30000;
function tickLimit(level:Level,pause:number):number{return MAX_TICKS+allIds(level).length*(pause<0?1800:pause);}
const exposure=new WeakMap<Game,{revision:number;checked:number;colors:number}>();
function exposed(game:Game,color:number):boolean {
  let cached=exposure.get(game);
  if(!cached||cached.revision!==game.revision){
    cached={revision:game.revision,checked:0,colors:0};exposure.set(game,cached);
  }
  const bit=1<<color;
  if(!(cached.checked&bit)){
    cached.checked|=bit;
    for(let i=(HEIGHT-COLLECTION_DEPTH)*WIDTH;i<game.cells.length;i++){
      if(!game.held[i]&&game.cells[i]===color){cached.colors|=bit;break;}
    }
  }
  return !!(cached.colors&bit);
}
function allIds(level:Level):number[]{return [...level.field,...(level.mechanics?.queues.flatMap(q=>q.buckets)??[]),...(level.mechanics?.platforms.flatMap(p=>p.next)??[])].filter(b=>b).map(b=>b!.id);}
function remaining(game:Game):Set<number>{return new Set([...game.field,...game.buckets,...game.mechanics.queues.flatMap(q=>q.buckets),...game.mechanics.platforms.flatMap(p=>p.next)].filter(b=>b).map(b=>b!.id));}
function pauseTicks(pause:number,turn:number):number{return pause<0?(73+turn*137)%1801:pause;}
function step(game:Game,speed:Speed):void{game.step(2/speed);game.events.length=0;}
function ready(game:Game,bucketId:number):boolean{return game.motionTick>=game.busyUntil&&game.slots.includes(null)&&[...game.paths.keys()].some(i=>game.field[i]!.id===bucketId);}
function decision(game:Game,id:number,ids:number[]):Decision {
  const rest=remaining(game),bucket=game.field.find(b=>b?.id===id)!;
  return {bucketId:id,collected:game.collected,completed:ids.filter(id=>!rest.has(id)),exposed:exposed(game,bucket.color)};
}
export function replayDecisions(level:Level,decisions:Decision[],speed:Speed,pause:number):Proof {
  const game=new Game(level),completed=new Set<number>();let cursor=0,readyAt=-1,peakSlots=0,unproductive=0;
  const limit=tickLimit(level,pause);
  while(game.status==='playing'&&game.tick<limit){
    const move=decisions[cursor];
    if(move){
      const b=game.field.find(b=>b?.id===move.bucketId);
      const allowed=b&&ready(game,b.id)&&game.collected>=move.collected&&move.completed.every(id=>completed.has(id))&&(!move.exposed||exposed(game,b.color));
      if(allowed){
        if(readyAt<0)readyAt=game.tick+pauseTicks(pause,cursor);
        if(game.tick>=readyAt){if(!exposed(game,b.color))unproductive++;if(game.launch(b.id)!=='ok')throw Error('Неверный ход доказательства');cursor++;readyAt=-1;}
      }else readyAt=-1;
    }
    peakSlots=Math.max(peakSlots,game.buckets.length);
    game.step(2/speed);
    for(const event of game.events)if(event.type==='complete')completed.add(event.bucket.id);
    game.events.length=0;
  }
  if(game.status!=='won'||cursor!==decisions.length)throw Error('Решение с условиями ожидания не подтверждено');
  return {speed,pause,decisions,ticks:game.tick,peakSlots,unproductive,nodes:0};
}

// Try the inexpensive policy first; search only when useful colors are blocked.
function greedy(level:Level,speed:Speed,pause:number):{game:Game;moves:Decision[]} {
  const game=new Game(level),ids=allIds(level),moves:Decision[]=[];let readyAt=-1;let pending:Decision|undefined;
  const limit=tickLimit(level,pause);
  while(game.status==='playing'&&game.tick<limit){
    const buckets=pending?[]:[...game.paths.keys()].map(i=>game.field[i]!).sort((a,b)=>a.color-b.color||a.capacity-b.capacity);
    const bucket=buckets.find(b=>{
      if(!exposed(game,b.color)||game.buckets.some(s=>s.color===b.color))return false;
      const pair=game.mechanics.links.find(p=>p.includes(b.id));
      const other=pair&&game.field.find(o=>o&&o.id!==b.id&&pair.includes(o.id));
      return !other||game.slots.filter(s=>!s).length<2||(exposed(game,other.color)&&!game.buckets.some(s=>s.color===other.color));
    });
    const selected=pending?game.field.find(b=>b?.id===pending!.bucketId):bucket;
    if(selected&&ready(game,selected.id)&&exposed(game,selected.color)){
      if(readyAt<0){pending=decision(game,selected.id,ids);readyAt=game.tick+pauseTicks(pause,moves.length);}
      if(game.tick>=readyAt){moves.push(pending!);game.launch(selected.id);readyAt=-1;pending=undefined;}
    }else {readyAt=-1;pending=undefined;}
    step(game,speed);
  }
  return {game,moves};
}
export function certify(level:Level,speed:Speed,pause:number):Proof {
  const result=greedy(level,speed,pause),easy=result.game.status==='won'?result.moves:undefined;
  if(easy){try{return replayDecisions(level,easy,speed,pause);}catch{/* Search can find a different order. */}}
  const ids=allIds(level);let nodes=0,steps=0;
  type Node={game:Game;moves:Decision[]};
  let beam:Node[]=[{game:new Game(level),moves:[]}];
  const seen=new Set<string>();
  while(beam.length&&nodes<5000&&steps<100000){
    const next:Node[]=[];
    for(const parent of beam){
      const available=[...parent.game.paths.keys()].map(i=>parent.game.field[i]!);
      // Waiting is also a move: it can free a slot or expose a new color.
      for(const id of [...available.map(b=>b.id),-1]){
        if(nodes++>=5000||steps>=100000)break;
        const game=parent.game.clone(),moves=parent.moves.slice();
        if(id>=0){
          if(!ready(game,id))continue;
          moves.push(decision(game,id,ids));if(game.launch(id)!=='ok')continue;
        }
        const before=game.collected,slots=game.buckets.length;
        for(let t=0;t<LOOP_TICKS+pauseTicks(pause,moves.length)&&game.status==='playing';t++){
          if(steps++>=100000)break;
          step(game,speed);
          if(game.motionTick>=game.busyUntil&&game.collected>before&&game.buckets.length<slots)break;
        }
        if(game.status==='won'){
          try{return {...replayDecisions(level,moves,speed,pause),nodes};}catch{continue;}
        }
        if(game.status!=='playing'||game.tick>=tickLimit(level,pause))continue;
        // Include the entire physical state: matching bucket IDs alone is not equivalent.
        const key=createHash('sha256').update(JSON.stringify(game)).digest('hex');
        if(seen.has(key))continue;seen.add(key);next.push({game,moves});
      }
    }
    next.sort((a,b)=>(b.game.collected-a.game.collected)||a.game.buckets.length-b.game.buckets.length||a.moves.length-b.moves.length);
    beam=next.slice(0,64);
  }
  throw Error(`Не проверен: поиск исчерпан (${nodes} состояний)`);
}

export function balancePauses(level:Level):void {
  for(let repair=0;repair<16;repair++){
    let failed:Game|undefined;
    for(const speed of [1,2] as const){
      for(const pause of [0,120,1800,-1]){
        const result=greedy(level,speed,pause);
        if(result.game.status!=='won'){failed=result.game;break;}
      }
      if(failed)break;
    }
    if(!failed||!rebalance(level,failed))return;
  }
}
