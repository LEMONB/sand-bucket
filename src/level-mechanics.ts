import { emptyMechanics, type Mechanics } from './mechanics.ts';
import { exitPaths, type BucketSpec } from './game.ts';

export function separatedSwapCells(a:number,b:number,columns:number,accessible:ReadonlySet<number>):boolean {
  const upper=Math.floor(a/columns),lower=Math.floor(b/columns);
  return lower>upper && Math.max(Math.abs(a%columns-b%columns),lower-upper)>1 && accessible.has(a) && !accessible.has(b);
}

export function mechanicsFor(number: number,columns=4): number[] {
  if(number<=8)return number===5?[]:[number-1];
  if(number%9===0)return [];
  const first=(number-9)%8;
  const repeated=Math.floor((number-9)/8)%3===1;
  const second=repeated&&!(first===2&&columns===4)?first:[7,5,6,6,7,6,0,4][first];
  const kinds=[first,second];
  if(columns>=5&&number%3===0)kinds.push(1);
  return kinds.filter(kind=>kind!==4);
}

export function arrangeMechanics(specs: BucketSpec[], order: number[], columns: number, kinds: number[], random:()=>number,walls:ReadonlySet<number>=new Set(),rows=columns): {field:(BucketSpec|null)[]; mechanics:Mechanics} {
  const field=Array<BucketSpec|null>(columns*rows).fill(null),mechanics=emptyMechanics();
  const used=new Set<number>(walls),blocked=new Set<number>(walls),required=new Set<number>();
  const pick=(values:number[])=>{if(!values.length)throw Error('Нет места механике');return values[Math.floor(random()*values.length)];};
  const region=(width:number,height:number)=>{
    const starts=Array.from({length:field.length},(_,i)=>i).filter(i=>i%columns+width<=columns&&Math.floor(i/columns)+height<=rows);
    const cells=(a:number)=>Array.from({length:width*height},(_,j)=>a+Math.floor(j/width)*columns+j%width);
    const result=cells(pick(starts.filter(a=>cells(a).every(i=>!used.has(i)))));
    result.forEach(i=>used.add(i));return result;
  };
  for(let n=0;n<kinds.filter(k=>k===0).length;n++){const [cell]=region(1,1);required.add(cell);mechanics.queues.push({cell,buckets:[]});}
  for(let n=0;n<kinds.filter(k=>k===2).length;n++){const cells=region(2,2);cells.forEach(i=>required.add(i));mechanics.platforms.push({cells,next:[]});}
  for(let n=0;n<kinds.filter(k=>k===3).length;n++){const [a,b,d,c]=region(2,2);[a,b,c,d].forEach(i=>required.add(i));mechanics.trays.push([a,b,c,d]);}
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
    const accessible=new Set(exitPaths(field,columns,blocked).keys());
    const all=[...field,...mechanics.queues.flatMap(q=>q.buckets),...mechanics.platforms.flatMap(p=>p.next)].filter((b):b is BucketSpec=>b!==null);
    const available=ordinary.filter(i=>field[i]!.swapWith===undefined);
    const pairs=available.filter(i=>accessible.has(i)).flatMap(i=>available.filter(j=>i!==j&&field[i]!.color!==field[j]!.color).flatMap(j=>{
      const destinations=separatedSwapCells(i,j,columns,accessible)?[j]:available.filter(k=>separatedSwapCells(i,k,columns,accessible));
      return destinations.map(k=>[i,j,k]);
    })).filter(([i,j])=>{
      const a=field[i]!,b=field[j]!,larger=a.capacity>b.capacity?a:b;
      return a.capacity===b.capacity||all.some(other=>other.id!==larger.id&&other.color===larger.color&&other.swapWith===undefined);
    });
    if(!pairs.length)throw Error('Нет сбалансированной пары переключателей');
    const difference=([i,j]:number[])=>Math.abs(field[i]!.capacity-field[j]!.capacity);
    const closest=Math.min(...pairs.map(difference)),balanced=pairs.filter(pair=>difference(pair)===closest);
    const [i,j,destination]=balanced[Math.floor(random()*balanced.length)];
    [field[j],field[destination]]=[field[destination],field[j]];
    const a=field[i]!,b=field[destination]!;
    if(a.capacity!==b.capacity){
      const larger=a.capacity>b.capacity?a:b,smaller=larger===a?b:a;
      const receiver=all.find(other=>other.id!==larger.id&&other.color===larger.color&&other.swapWith===undefined)!;
      receiver.capacity+=larger.capacity-smaller.capacity;larger.capacity=smaller.capacity;
    }
    a.swapWith=b.id;b.swapWith=a.id;
  }
  return {field,mechanics};
}
