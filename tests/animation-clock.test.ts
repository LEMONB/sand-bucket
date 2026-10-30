import {expect,it} from 'vitest';
import {Game,WIDTH,HEIGHT,LAUNCH_TICKS,advanceFrame,type Speed} from '../src/game';
function fixture(){
 const field=Array(16).fill(null);field[0]={id:0,color:1,capacity:WIDTH*HEIGHT};
 return new Game({cells:new Uint8Array(WIDTH*HEIGHT).fill(1),field});
}
it('keeps bucket travel at 300ms while only belt and sand speed doubles',()=>{
 const games=[fixture(),fixture()];
 for(const [i,game] of games.entries()){
  game.launch(0);let remainder=0;const speed=(i+1) as Speed;
  for(let frame=0;frame<17;frame++)remainder=advanceFrame(game,1/60,speed,remainder);
  expect(game.collected).toBe(0);expect(game.motionTick).toBeLessThan(LAUNCH_TICKS);
  advanceFrame(game,1/60,speed,remainder);
  expect(game.motionTick).toBe(LAUNCH_TICKS);expect(game.events.some(e=>e.type==='arrive')).toBe(true);
 }
 expect(games[1].tick).toBe(games[0].tick*2);
});
it('does not jump or restart an in-flight animation when speed changes',()=>{
 const game=fixture();game.launch(0);let remainder=0;
 for(let frame=0;frame<18;frame++)remainder=advanceFrame(game,1/60,frame<9?1:2,remainder);
 expect(game.motionTick).toBe(LAUNCH_TICKS);expect(game.tick).toBe(27);
 expect(game.events.filter(e=>e.type==='arrive')).toHaveLength(1);
});
