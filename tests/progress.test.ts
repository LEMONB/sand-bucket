import { expect,it } from 'vitest';
import { ProgressStore } from '../src/progress';
function storage(value:string|null=null){let data=value;return {getItem:()=>data,setItem:(_k:string,v:string)=>{data=v;}};}
it('preserves progress, speed and seen mechanics while discarding generated layouts',()=>{
 const s=storage(JSON.stringify({version:6,number:42,speed:2,seenMechanics:[0,7],current:{},next:{},seed:123}));
 const p=new ProgressStore(s);p.save();
 expect(new ProgressStore(s).data).toEqual({version:1,number:42,speed:2,seenMechanics:[0,7]});
 expect(s.getItem()).not.toMatch(/current|next|seed/);
});
it('advances only the current level; replay never reduces or unlocks progress',()=>{
 const p=new ProgressStore(storage());p.setSpeed(2);p.advance(1);p.advance(1);p.advance(3);
 expect(p.data.number).toBe(2);expect(p.data.speed).toBe(2);expect(p.unlocked).toBe(2);
});
it('finishes at 400 and keeps every level available on reload',()=>{
 const s=storage(JSON.stringify({number:400,speed:2})),p=new ProgressStore(s);
 p.advance(400);p.advance(401);expect(p.completed).toBe(true);expect(p.unlocked).toBe(400);
 expect(new ProgressStore(s).data.number).toBe(401);
 expect(new ProgressStore(storage(JSON.stringify({number:900}))).data.number).toBe(401);
});
it('survives unavailable and corrupted storage',()=>{
 const p=new ProgressStore({getItem(){throw Error();},setItem(){throw Error();}});p.setSpeed(2);expect(p.available).toBe(false);expect(p.data.speed).toBe(2);
 expect(new ProgressStore(storage('{')).data.number).toBe(1);
});
it('remembers new mechanics and filters malformed records',()=>{
 const s=storage(JSON.stringify({number:2,seenMechanics:[0,0,'1',null,-1,8,2.5,7]})),p=new ProgressStore(s);
 expect(p.data.seenMechanics).toEqual([0,8,7]);p.markMechanicsSeen([1,1,99]);
 expect(new ProgressStore(s).data.seenMechanics).toEqual([0,8,7,1]);
});
