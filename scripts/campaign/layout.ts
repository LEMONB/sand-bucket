import { campaignColumns, campaignKinds } from '../../src/campaign-rules.ts';
import type { GenerationProfile } from '../../src/generator.ts';

export const FAMILIES = ['развилка', 'остров', 'обход', 'карманы'] as const;
export function layoutFor(number:number,attempt:number):GenerationProfile & {family:number} {
  const columns=campaignColumns(number),family=Math.floor((number-1)/100);
  const walls=new Set<number>();
  const add=(x:number,y:number)=>walls.add(y*columns+x);
  const variant=(number-1)%100+attempt;
  const x=1+variant%(columns-2),y=1+Math.floor(variant/(columns-2))%(columns-2);
  if(family===0){
    // A ledge makes a choice between a short opening and a side passage.
    for(let i=0;i<columns-1;i++)if(i!==x)add(i,y);
    if(columns>4)add(x,Math.min(columns-1,y+1));
  }else if(family===1){
    for(let row=1;row<columns-1;row++)add(x,row);
    if(columns>4)add(x===columns-2?x-1:x+1,y);
  }else if(family===2){
    const upper=1+variant%(columns-3),lower=Math.min(columns-1,upper+2);
    const mirror=variant%2===1;
    for(let i=0;i<columns-2;i++)add(mirror?columns-1-i:i,upper);
    for(let i=2;i<columns;i++)add(mirror?columns-1-i:i,lower);
  }else{
    for(let i=0;i<2;i++){add(i,y);add(columns-1-i,Math.max(0,y-1));}
    if(columns>4)add(1,Math.min(columns-1,y+1));
  }
  // Leave room for mechanisms; their regions cannot overlap permanent walls.
  const kinds=campaignKinds(number);
  if(kinds.includes(2)||kinds.includes(3)){
    for(const cell of [...walls])if(cell%columns>=columns-2&&Math.floor(cell/columns)>=columns-2)walls.delete(cell);
  }
  return {columns,kinds,walls:[...walls].sort((a,b)=>a-b),family};
}
