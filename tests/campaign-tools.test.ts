import { expect,it } from 'vitest';
import { Game, WIDTH, HEIGHT, type Level } from '../src/game';
import { campaignKinds, campaignPhase } from '../src/campaign-rules';
import { layoutFor } from '../scripts/campaign/layout';
import { certify,replayDecisions } from '../scripts/campaign/solver';

it('recreates the same candidate and eight proofs from the same inputs',async()=>{
 const {prepare}=await import('../scripts/campaign/candidate');
 const first=prepare(1,0),second=prepare(1,0);
 expect(first.error).toBeUndefined();expect(first.level).toBeDefined();
 expect(second.level).toEqual(first.level);expect(second.proofs).toEqual(first.proofs);
 expect(first.proofs).toHaveLength(8);
},30000);

it('introduces active mechanics in waves, with a quiet fifth level',()=>{
 expect(Array.from({length:10},(_,i)=>campaignPhase(i+1))).toEqual([0,1,2,3,4,0,1,2,3,4]);
 expect(Array.from({length:8},(_,i)=>campaignKinds(6+i*5)[0])).toEqual([0,1,2,3,undefined,5,6,7]);
 for(let n=5;n<=400;n+=5)expect(campaignKinds(n)).toEqual([]);
});
it('constructs repeatable distinct geometry for the four appearances of an artwork',()=>{
 const profiles=[1,101,201,301].map(n=>layoutFor(n,0));
 expect(new Set(profiles.map(p=>JSON.stringify([p.columns,p.walls]))).size).toBe(4);
 expect(layoutFor(154,7)).toEqual(layoutFor(154,7));
});
function blockedColor():Level {
 const cells=new Uint8Array(WIDTH*HEIGHT);
 cells.fill(2,(HEIGHT-10)*WIDTH,(HEIGHT-5)*WIDTH);cells.fill(1,(HEIGHT-5)*WIDTH);
 const field:Level['field']=Array(16).fill(null);
 field[0]={id:0,color:2,capacity:WIDTH*5};field[4]={id:1,color:1,capacity:WIDTH*5};
 return {cells,field,walls:[1,5,8]};
}
it('searches a necessary unproductive move and verifies semantic conditions at both speeds',()=>{
 const level=blockedColor();expect(new Game(level).paths.has(4)).toBe(false);
 for(const speed of [1,2] as const){
   const proof=certify(level,speed,0);
   expect(proof.unproductive).toBeGreaterThan(0);expect(proof.decisions[0].bucketId).toBe(0);
   expect(replayDecisions(level,proof.decisions,speed,120).decisions).toEqual(proof.decisions);
 }
},30000);
it('rejects an incomplete proof rather than silently substituting a level',()=>{
 expect(()=>replayDecisions(blockedColor(),[],1,0)).toThrow('не подтверждено');
});

it('rejects reflected copies of the same topology',async()=>{
 const {topology}=await import('../scripts/campaign/candidate');
 const record={number:1,art:0,seed:1,columns:4,walls:[1,5,8],field:blockedColor().field,kinds:[],family:0};
 const mirror=(i:number)=>Math.floor(i/4)*4+3-i%4;
 const reflected={...record,walls:record.walls.map(mirror),field:record.field.map((_,i)=>record.field[mirror(i)])};
 expect(topology(record)).toBe(topology(reflected));
});


it('compares mechanic positions and treats mirrored connections as duplicates',async()=>{
 const {structuralSignature}=await import('../scripts/campaign/selection');
 const field:Level['field']=Array(16).fill(null);
 for(const [id,cell] of [0,1,4,5].entries())field[cell]={id,color:1+id%2,capacity:1};
 const mechanics={queues:[],platforms:[],trays:[],bridges:[],gates:[],lids:[],links:[[0,1]]};
 const record={number:1,art:0,seed:1,columns:4,walls:[8],field,kinds:[5],family:0,mechanics};
 expect(structuralSignature({...record,mechanics:{...mechanics,links:[[2,3]]}})).not.toBe(structuralSignature(record));
 expect(structuralSignature({...record,field:field.map(b=>b?{...b,color:b.color===1?7:3}:null)})).toBe(structuralSignature(record));
 expect(structuralSignature({...record,field:field.map(b=>b?{...b,color:b.id<2?1:2}:null)})).not.toBe(structuralSignature(record));
 const mirror=(i:number)=>Math.floor(i/4)*4+3-i%4;
 expect(structuralSignature({...record,walls:[mirror(8)],field:field.map((_,i)=>field[mirror(i)])})).toBe(structuralSignature(record));
});

it.each([1,23,36,127])('certifies merged colors at level %i without changing its buckets', async number => {
  const { campaignLevel, playableLevel } = await import('../src/campaign');
  const level = playableLevel(campaignLevel(number)), before = structuredClone(level);
  for (const speed of [1,2] as const) for (const pause of [0,120,1800,-1]) {
    const proof = certify(level,speed,pause);
    expect(proof.nodes).toBe(0);
    expect(replayDecisions(level,proof.decisions,speed,pause).decisions).toEqual(proof.decisions);
  }
  expect(level).toEqual(before);
},30000);
