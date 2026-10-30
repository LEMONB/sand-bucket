import { parentPort } from 'node:worker_threads';
import { prepare } from './campaign/candidate.ts';
import { replayDecisions, type Proof } from './campaign/solver.ts';
import { catalogArtwork, artworkPalette } from '../src/art-catalog.ts';
import type { CampaignLevel } from '../src/campaign-types.ts';
parentPort!.on('message',({number,attempt,level,proofs}:{number:number;attempt:number;level?:CampaignLevel;proofs?:Proof[]})=>{
  if(level&&proofs){
    try{
      const playable={...level,cells:catalogArtwork(level.art),palette:artworkPalette(level.art)};
      for(const proof of proofs)replayDecisions(playable,proof.decisions,proof.speed,proof.pause);
      parentPort!.postMessage({result:{}});
    }catch(error){parentPort!.postMessage({result:{error:String(error)}});}
  }else parentPort!.postMessage({number,attempt,result:prepare(number,attempt)});
});
