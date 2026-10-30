import type { CampaignLevel } from '../../src/campaign-types.ts';

export function structuralSignature(level:CampaignLevel):string {
  const n=level.columns,walls=new Set(level.walls),mechanics=level.mechanics;
  const oriented=(mirror:boolean)=>{
    const cell=(i:number)=>Math.floor(i/n)*n+(mirror?n-1-i%n:i%n);
    const cells=(indexes:number[])=>indexes.map(cell).sort((a,b)=>a-b);
    const position=(id:number)=>cell(level.field.findIndex(b=>b?.id===id));
    const sorted=(items:unknown[])=>items.map(item=>JSON.stringify(item)).sort();
    const shape=level.field.map((_,i)=>walls.has(cell(i))?'#':level.field[cell(i)]?'B':'.').join('');
    // Compare color relationships, not palette names: a recolored copy is still a duplicate.
    const groups=new Map<number,string[]>();
    const group=(color:number,location:string)=>{const positions=groups.get(color)??[];positions.push(location);groups.set(color,positions);};
    level.field.forEach((b,i)=>{if(b)group(b.color,`f:${cell(i)}`);});
    mechanics?.queues.forEach(q=>q.buckets.forEach((b,i)=>group(b.color,`q:${cell(q.cell)}:${i}`)));
    mechanics?.platforms.forEach(p=>p.next.forEach((b,i)=>group(b.color,`p:${cell(p.cells[i])}`)));
    const switches=level.field.flatMap((b,i)=>{
      if(b?.swapWith===undefined||b.id>b.swapWith)return [];
      return [[cell(i),position(b.swapWith)].sort((a,b)=>a-b)];
    });
    return JSON.stringify([n,shape,level.kinds,sorted([...groups.values()].map(g=>g.sort())),sorted(switches),mechanics&&[
      sorted(mechanics.queues.map(q=>[cell(q.cell),q.buckets.length,!!q.hidden])),
      sorted(mechanics.platforms.map(p=>[cells(p.cells),p.next.length,!!p.hidden])),
      sorted(mechanics.trays.map(cells)),
      sorted(mechanics.bridges.map(b=>[cells(b.cells),cells(b.passage)])),
      sorted(mechanics.gates.map(g=>[cells(g.cells),position(g.key)])),
      sorted(mechanics.links.map(pair=>pair.map(position).sort((a,b)=>a-b))),
      sorted(mechanics.lids.map(l=>[position(l.key),l.x,l.y,l.width,l.height])),
    ]]);
  };
  return [oriented(false),oriented(true)].sort()[0];
}
