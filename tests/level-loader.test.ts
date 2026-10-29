import { afterEach, expect, it, vi } from 'vitest';
import { LevelLoader } from '../src/level-loader';
import { ProgressStore } from '../src/progress';
import { fallbackLevel } from '../src/level';
class FakeWorker {
  static instances:FakeWorker[]=[];
  onmessage?: (e:{data:unknown})=>void;
  onerror?: ()=>void;
  terminate=vi.fn();postMessage=vi.fn();
  constructor(){FakeWorker.instances.push(this);}
}
function setup(){FakeWorker.instances=[];vi.stubGlobal('Worker',FakeWorker);const p=new ProgressStore({getItem:()=>null,setItem(){}});return {p,loader:new LevelLoader(p)};}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('shares pending work, caches current/next and terminates completed workers',async()=>{
 const {p,loader}=setup();const a=loader.get(1),b=loader.get(1);expect(a).toBe(b);
 const w=FakeWorker.instances[0];w.onmessage!({data:{level:fallbackLevel(1)}});
 expect((await a).number).toBe(1);expect(w.terminate).toHaveBeenCalledOnce();expect(p.data.current?.number).toBe(1);
 await loader.get(1);expect(FakeWorker.instances).toHaveLength(1);
 const next=loader.get(2);FakeWorker.instances[1].onmessage!({data:{level:fallbackLevel(2)}});await next;expect(p.data.next?.number).toBe(2);
});
it('uses a certified fallback on worker failure or timeout',async()=>{
 vi.useFakeTimers();const {loader}=setup();const a=loader.get(1);FakeWorker.instances[0].onerror!();expect((await a).fallback).toBe(true);
 const b=loader.get(2);await vi.advanceTimersByTimeAsync(15000);expect((await b).fallback).toBe(true);expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
});
it('rejects malformed worker data and ignores late events',async()=>{
 const {loader,p}=setup();const a=loader.get(1),w=FakeWorker.instances[0];w.onmessage!({data:{level:{number:1}}});const saved=await a;
 w.onmessage!({data:{level:fallbackLevel(7)}});expect(p.data.current).toEqual(saved);expect(saved.fallback).toBe(true);
});
