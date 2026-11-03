import { expect, it } from 'vitest';
import { Game, HEIGHT, WIDTH, COLLECTION_DEPTH, type Speed } from '../src/game';
import { campaignLevel, playableLevel } from '../src/campaign';
import { certify } from '../scripts/campaign/solver';
import { ProgressStore } from '../src/progress';

it.each([2,3,4,5])('keeps pilot level %i solvable at both speeds with every pause scenario',number=>{
  const level=playableLevel(campaignLevel(number));
  for(const speed of [1,2] as const)for(const pause of [0,120,1800,-1]){
    const proof=certify(level,speed,pause);
    expect(proof.decisions.length).toBeGreaterThan(0);
    if(number>=3)expect(proof.unproductive).toBeGreaterThan(0);
  }
},30000);

it('requires opening a passage on levels 3–5 instead of always picking an exposed color',()=>{
  for(const number of [1,2,3,4,5]){
    const game=new Game(playableLevel(campaignLevel(number)));
    const colors=new Set(game.cells.slice((HEIGHT-COLLECTION_DEPTH)*WIDTH));
    const useful=[...game.paths.keys()].filter(i=>colors.has(game.field[i]!.color));
    expect(useful.length>0).toBe(number<=2);
  }
});

function wrongOrder(number:number,order:number[],speed:Speed):Game {
  const game=new Game(playableLevel(campaignLevel(number)));
  let cursor=0,next=0;
  for(let i=0;i<30000&&game.status==='playing';i++){
    if(cursor<order.length&&game.tick>=next&&game.slots.includes(null)&&[...game.paths.keys()].some(pos=>game.field[pos]?.id===order[cursor])){
      if(game.launch(order[cursor])==='ok'){cursor++;next=game.tick+1800;}
    }
    game.step(2/speed);game.events.length=0;
  }
  return game;
}

it.each([1,2] as const)('makes wrong routes matter even with long waits at speed %i',speed=>{
  const fourth=wrongOrder(4,[19,20,17,24,23],speed);
  expect(fourth.status).toBe('lost');expect(fourth.buckets).toHaveLength(5);
  const fifth=wrongOrder(5,[2,5,9,7,6,1,3,8,4,0],speed);
  expect(fifth.status).toBe('lost');expect(fifth.collected).toBeGreaterThan(5000);
  expect(fifth.buckets).toHaveLength(5);
});

it('keeps later progress when replaying the pilot',()=>{
  const storage={getItem:()=>JSON.stringify({number:127,speed:2,seenMechanics:[0,1,2,3,5,6,7,8]}),setItem:()=>{}};
  const progress=new ProgressStore(storage),before=structuredClone(progress.data);
  for(const number of [1,2,3,4,5])progress.advance(number);
  expect(progress.data).toEqual(before);expect(progress.unlocked).toBe(127);
});
