import { emptyMechanics, type Mechanics } from './mechanics.ts';
import type { BucketSpec } from './game.ts';

export function mechanicsFor(number: number): number[] {
  if(number<=8)return [number-1];
  if(number%3===0)return [];
  const first=(number-9)%8;
  return number%3===2 ? [first,[7,5,6,6,7,6,0,4][first]] : [first];
}

export function arrangeMechanics(specs: BucketSpec[], order: number[], columns: number, kinds: number[]): {field:(BucketSpec|null)[]; mechanics:Mechanics} {
  const field=Array<BucketSpec|null>(columns**2).fill(null), mechanics=emptyMechanics();
  const reserved=new Set<number>();
  const pending=order.map(id=>({...specs.find(b=>b.id===id)!}));
  const reserve=(cells:number[])=>{
    if(cells.some(i=>reserved.has(i)))throw Error('Области пересекаются');
    cells.forEach(i=>reserved.add(i));
  };
  const take=()=>{const b=pending.shift();if(!b)throw Error('Не хватает ведер');return b;};
  if(kinds.includes(0)){
    reserve([0]);field[0]=take();mechanics.queues.push({cell:0,buckets:[take(),take(),take(),take()]});
  }
  if(kinds.includes(2)){
    const a=columns-2,cells=[a,a+1,a+columns,a+columns+1];reserve(cells);
    cells.forEach(i=>{field[i]=take();});mechanics.platforms.push({cells,next:[take(),take(),take(),take()]});
  }
  if(kinds.includes(3)){
    const a=columns-2,cells=[a,a+1,a+columns+1,a+columns];reserve(cells);
    cells.forEach(i=>{field[i]=take();});mechanics.trays.push(cells);
  }
  if(kinds.includes(1)){
    const cells=[columns];reserve(cells);
    let key=field.find(b=>b)?.id;
    if(key===undefined){const cell=Array.from({length:columns},(_,i)=>i).find(i=>!reserved.has(i));if(cell===undefined)throw Error('Нет места ключу');reserve([cell]);field[cell]=take();key=field[cell]!.id;}
    mechanics.gates.push({cells,key});
  }
  if(kinds.includes(4)){
    const cells=[0,1],passage=[columns,columns+1];reserve([...cells,...passage]);
    cells.forEach(i=>{field[i]=take();});mechanics.bridges.push({cells,passage});
  }
  if(kinds.includes(5)){
    const cells=[columns-2,columns-1];reserve(cells);cells.forEach(i=>{field[i]=take();});
    mechanics.links.push(cells.map(i=>field[i]!.id));
  }
  // Fill remaining cells in path-opening order; certified replay rejects awkward combinations.
  for(let i=0;i<field.length&&pending.length;i++)if(!reserved.has(i)){field[i]=take();}
  if(pending.length)throw Error('Поле переполнено');
  if(kinds.includes(6)){
    const key=order[0];mechanics.lids.push({x:40,y:8,width:48,height:32,key});
  }
  if(kinds.includes(7)){
    const bucket=field.find(b=>b && order.indexOf(b.id)>=3)!;
    if(!bucket)throw Error('Нет ведра переключателя');
    bucket.alternate=bucket.color%4+1;
  }
  return {field,mechanics};
}
