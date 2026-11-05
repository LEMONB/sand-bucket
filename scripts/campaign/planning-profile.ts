export const PLANNING_PILOT = [6,7,8,9,10,11,16,21,31,36,41,47,103,104,105,202,253,304,399,400];
export const MECHANIC_UNLOCKS = [[0,6],[1,11],[2,16],[3,21],[5,31],[6,36],[7,41],[8,47]] as const;

export function planningKinds(number:number):number[] {
  const unlocked=MECHANIC_UNLOCKS.filter(([,first])=>first<=number).map(([kind])=>Number(kind));
  if(!unlocked.length)return [];
  const introduction=MECHANIC_UNLOCKS.find(([,first])=>first===number);
  if(introduction)return [introduction[0]];
  const phase=(number-1)%5,wave=Math.floor((number-6)/5);
  const count=phase===0?1:Math.min(unlocked.length,1+(wave%3));
  return Array.from({length:count},(_,i)=>unlocked[(wave+i)%unlocked.length]);
}

export function planningProfile(number:number,attempt:number) {
  const difficulty=(number-1)%5;
  const sizes=difficulty===0?[6,7]:difficulty<3?[6,7,8]:[8,9];
  const columns=sizes[(Math.floor((number-1)/5)+attempt)%sizes.length],rows=columns-3;
  const kinds=planningKinds(number);
  // A narrow entry leads into a chamber large enough for the unlocked mechanics.
  const depth=difficulty<2?0:difficulty===2?1:2;
  const lanes=difficulty===4?3:difficulty===3?2:1;
  const mirror=(Math.floor((number-1)/100)+attempt)%2===1;
  const walls:number[]=[];
  for(let y=0;y<depth;y++)for(let x=0;x<columns;x++){
    const logical=mirror?columns-1-x:x;
    if(logical>=lanes*2||logical%2===1)walls.push(y*columns+x);
  }
  if(depth===0){
    const y=1+attempt%Math.max(1,rows-2),x=1+Math.floor(attempt/2)%(columns-2);
    for(let i=0;i<columns-1;i++)if(i!==x)walls.push(y*columns+i);
  }
  return {columns,rows,kinds:kinds.filter(k=>k!==8),walls,family:Math.floor((number-1)/100),difficulty};
}
