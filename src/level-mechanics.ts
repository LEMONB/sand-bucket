import { emptyMechanics, type Mechanics } from './mechanics.ts';
import type { BucketSpec } from './game.ts';

export function mechanicsFor(number: number,columns=4): number[] {
  if(number<=8)return [number-1];
  if(number%9===0)return [];
  const first=(number-9)%8;
  const repeated=Math.floor((number-9)/8)%3===1;
  const second=repeated&&!(first===2&&columns===4)?first:[7,5,6,6,7,6,0,4][first];
  const kinds=[first,second];
  if(columns>=5&&number%3===0)kinds.push(1);
  return kinds;
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
  for(let n=0;n<kinds.filter(k=>k===0).length;n++){const [cell]=region(1,1);required.add(cell);mechanics.queues.push({cell,buckets:[]});}
  for(let n=0;n<kinds.filter(k=>k===2).length;n++){const cells=region(2,2);cells.forEach(i=>required.add(i));mechanics.platforms.push({cells,next:[]});}
  for(let n=0;n<kinds.filter(k=>k===3).length;n++){const [a,b,d,c]=region(2,2);[a,b,c,d].forEach(i=>required.add(i));mechanics.trays.push([a,b,c,d]);}
  for(let n=0;n<kinds.filter(k=>k===4).length;n++){
    const [a,b,c,d]=region(2,2);[a,b].forEach(i=>required.add(i));[c,d].forEach(i=>blocked.add(i));
    mechanics.bridges.push({cells:[a,b],passage:[c,d]});
  }
  const pairsOfCells:number[][]=[];
  for(let n=0;n<kinds.filter(k=>k===5).length;n++){const cells=region(2,1);pairsOfCells.push(cells);cells.forEach(i=>required.add(i));}
  for(let n=0;n<kinds.filter(k=>k===1).length;n++){const cells=region(1,1);cells.forEach(i=>blocked.add(i));mechanics.gates.push({cells,key:-1});}
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
  pairsOfCells.forEach(cells=>mechanics.links.push(cells.map(i=>field[i]!.id)));
  const ordinary=[...occupied].filter(i=>!used.has(i));
  for(const gate of mechanics.gates){
    const candidates=[...occupied].filter(i=>i<gate.cells[0]);
    gate.key=field[pick(candidates.length?candidates:[...occupied])]!.id;
  }
  for(let n=0;n<kinds.filter(k=>k===6).length;n++){
    const keys=new Set(mechanics.lids.map(l=>l.key));
    const key=field[pick([...occupied].filter(i=>!keys.has(field[i]!.id)))]!.id;
    mechanics.lids.push({x:8+(n%2)*64,y:8+Math.floor(n/2)*40,width:40,height:28,key});
  }
  for(let n=0;n<kinds.filter(k=>k===7).length;n++){
    const all=[...field,...mechanics.queues.flatMap(q=>q.buckets),...mechanics.platforms.flatMap(p=>p.next)].filter((b):b is BucketSpec=>b!==null);
    const available=ordinary.filter(i=>field[i]!.swapWith===undefined);
    const pairs=available.flatMap(i=>available.filter(j=>j>i&&Math.floor(i/columns)===Math.floor(j/columns)&&field[i]!.color!==field[j]!.color).map(j=>[i,j])).filter(([i,j])=>{
      const a=field[i]!,b=field[j]!,larger=a.capacity>b.capacity?a:b;
      return a.capacity===b.capacity||all.some(other=>other.id!==larger.id&&other.color===larger.color&&other.swapWith===undefined);
    });
    if(!pairs.length)throw Error('Нет сбалансированной пары переключателей');
    const difference=([i,j]:number[])=>Math.abs(field[i]!.capacity-field[j]!.capacity);
    const closest=Math.min(...pairs.map(difference)),balanced=pairs.filter(pair=>difference(pair)===closest);
    const [i,j]=balanced[Math.floor(random()*balanced.length)],a=field[i]!,b=field[j]!;
    if(a.capacity!==b.capacity){
      const larger=a.capacity>b.capacity?a:b,smaller=larger===a?b:a;
      const receiver=all.find(other=>other.id!==larger.id&&other.color===larger.color&&other.swapWith===undefined)!;
      receiver.capacity+=larger.capacity-smaller.capacity;larger.capacity=smaller.capacity;
    }
    a.swapWith=b.id;b.swapWith=a.id;
  }
  return {field,mechanics};
}
