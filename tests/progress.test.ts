import { expect,it } from 'vitest';
import { ProgressStore } from '../src/progress';
import { fallbackLevel } from '../src/level';
import { GENERATOR_VERSION } from '../src/generator';
function storage(){const map=new Map<string,string>();return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};}
it('persists speed across reloads and level advancement, caches only current and next',()=>{
 const s=storage(),p=new ProgressStore(s);expect(p.data.speed).toBe(1);p.setSpeed(2);
 p.data.current=fallbackLevel(1);p.data.next=fallbackLevel(2);p.save();
 const loaded=new ProgressStore(s);expect(loaded.data.speed).toBe(2);expect(loaded.data.current).toEqual(p.data.current);
 loaded.advance();expect(loaded.data.number).toBe(2);expect(loaded.data.speed).toBe(2);expect(loaded.data.next).toBeUndefined();
 expect(new ProgressStore(s).data.current?.number).toBe(2);
});
it('survives unavailable and corrupted storage',()=>{
 const p=new ProgressStore({getItem(){throw Error();},setItem(){throw Error();}});p.setSpeed(2);expect(p.available).toBe(false);expect(p.data.speed).toBe(2);
 const bad=new ProgressStore({getItem:()=>'{',setItem(){}});expect(bad.data.number).toBe(1);
});
it('keeps level and speed while invalidating the previous generator cache',()=>{
 const p=new ProgressStore({getItem:()=>JSON.stringify({version:GENERATOR_VERSION-1,number:42,speed:2,current:{},next:{}}),setItem(){}});
 expect(p.data.number).toBe(42);expect(p.data.speed).toBe(2);expect(p.data.current).toBeUndefined();expect(p.data.next).toBeUndefined();
});
