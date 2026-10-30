import {expect,it} from 'vitest';
import {arrangeMechanics,mechanicsFor} from '../src/level-mechanics';
import {Game,WIDTH,HEIGHT} from '../src/game';

it('can place every special mechanic in the lower part of the field',()=>{
  const columns=7,specs=Array.from({length:42},(_,id)=>({id,color:id%8+1,capacity:1})),order=specs.map(b=>b.id);
  for(let kind=0;kind<8;kind++){
    const {field,mechanics:m}=arrangeMechanics(specs,order,columns,[kind],()=>.99);
    const cells=kind===0?[m.queues[0].cell]:kind===1?[field.findIndex(b=>b?.id===m.gates[0].key)]:kind===2?m.platforms[0].cells:kind===3?m.trays[0]:kind===4?m.bridges[0].cells:kind===5?m.links[0].map(id=>field.findIndex(b=>b?.id===id)):kind===6?[field.findIndex(b=>b?.id===m.lids[0].key)]:[field.findIndex(b=>b?.swapWith!==undefined)];
    expect(cells.every(i=>i>=columns*3),`mechanic ${kind}`).toBe(true);
    const all=[...field,...m.queues.flatMap(q=>q.buckets),...m.platforms.flatMap(p=>p.next)].filter(b=>b);
    expect(all.map(b=>b!.id).sort((a,b)=>a-b)).toEqual(order);
  }
});

it('places repeated instances without overlaps or lost buckets',()=>{
  const columns=7,specs=Array.from({length:42},(_,id)=>({id,color:id%8+1,capacity:1})),order=specs.map(b=>b.id);
  const cells=new Uint8Array(WIDTH*HEIGHT);specs.forEach((b,i)=>{cells[cells.length-1-i]=b.color;});
  for(let kind=0;kind<8;kind++){
    const {field,mechanics}=arrangeMechanics(specs,order,columns,[kind,kind],()=>.99);
    const game=new Game({cells,field,columns,mechanics});
    const counts=[mechanics.queues.length,mechanics.gates.length,mechanics.platforms.length,mechanics.trays.length,mechanics.bridges.length,mechanics.links.length,mechanics.lids.length,field.filter(b=>b?.swapWith!==undefined).length/2];
    expect(counts[kind]).toBe(2);
    expect(game.total).toBe(42);
  }
  expect(mechanicsFor(24,5)).toEqual([7,7,1]);
  expect(mechanicsFor(15,5)).toEqual([6,0,1]);
});
