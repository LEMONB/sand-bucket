import { emptyMechanics, type Mechanics } from './mechanics.ts';
import type { BucketSpec } from './game.ts';

export function mechanicsFor(number: number): number[] {
  if(number<=8)return [number-1];
  if(number%3===0)return [];
  const first=(number-9)%8;
  return number%3===2 ? [first,[7,5,6,6,7,6,0,4][first]] : [first];
}

export function arrangeMechanics(specs: BucketSpec[], order: number[], columns: number, kinds: number[], random:()=>number): {field:(BucketSpec|null)[]; mechanics:Mechanics} {
  const field=Array<BucketSpec|null>(columns**2).fill(null),mechanics=emptyMechanics();
  const used=new Set<number>(),blocked=new Set<number>(),required=new Set<number>();
  const pick=(values:number[])=>{if(!values.length)throw Error('Нет места механике');return values[Math.floor(random()*values.length)];};
  const region=(width:number,height:number)=>{
    const starts=Array.from({length:field.length},(_,i)=>i).filter(i=>i%columns+width<=columns&&Math.floor(i/columns)+height<=columns);
    const cells=(a:number)=>Array.from({length:width*height},(_,j)=>a+Math.floor(j/width)*columns+j%width);
    const result=cells(pick(starts.filter(a=>cells(a).every(i=>!used.has(i)))));
    result.forEach(i=>used.add(i));return result;
  };
  if(kinds.includes(0)){const [cell]=region(1,1);required.add(cell);mechanics.queues.push({cell,buckets:[]});}
  if(kinds.includes(2)){const cells=region(2,2);cells.forEach(i=>required.add(i));mechanics.platforms.push({cells,next:[]});}
  if(kinds.includes(3)){const [a,b,d,c]=region(2,2);[a,b,c,d].forEach(i=>required.add(i));mechanics.trays.push([a,b,c,d]);}
  if(kinds.includes(4)){
    const [a,b,c,d]=region(2,2);[a,b].forEach(i=>required.add(i));[c,d].forEach(i=>blocked.add(i));
    mechanics.bridges.push({cells:[a,b],passage:[c,d]});
  }
  let pairCells:number[]=[];
  if(kinds.includes(5)){pairCells=region(2,1);pairCells.forEach(i=>required.add(i));}
  if(kinds.includes(1)){const cells=region(1,1);cells.forEach(i=>blocked.add(i));mechanics.gates.push({cells,key:-1});}
  const active=specs.length-4*mechanics.queues.length-4*mechanics.platforms.length;
  const occupied=new Set(required);
  for(let i=0;i<field.length&&occupied.size<active;i++)if(!blocked.has(i))occupied.add(i);
  if(occupied.size!==active)throw Error('Поле переполнено');
  const pending=order.map(id=>({...specs.find(b=>b.id===id)!}));
  const take=()=>{const bucket=pending.shift();if(!bucket)throw Error('Не хватает ведер');return bucket;};
  // Keep the verified color order while allocating hidden buckets at their reveal point.
  for(const i of [...occupied].sort((a,b)=>a-b)){
    field[i]=take();
    const queue=mechanics.queues.find(q=>q.cell===i);if(queue)queue.buckets=Array.from({length:4},take);
    const platform=mechanics.platforms.find(p=>Math.max(...p.cells)===i);if(platform)platform.next=Array.from({length:4},take);
  }
  if(pending.length)throw Error('Остались ведра');
  if(pairCells.length)mechanics.links.push(pairCells.map(i=>field[i]!.id));
  const ordinary=[...occupied].filter(i=>!used.has(i));
  for(const gate of mechanics.gates){
    const candidates=[...occupied].filter(i=>i<gate.cells[0]);
    gate.key=field[pick(candidates.length?candidates:[...occupied])]!.id;
  }
  if(kinds.includes(6))mechanics.lids.push({x:40,y:8,width:48,height:32,key:field[pick([...occupied])]!.id});
  if(kinds.includes(7)){
    const bucket=field[pick(ordinary)]!;bucket.alternate=bucket.color%4+1;
  }
  return {field,mechanics};
}
