import { CAMPAIGN_COUNT, CAMPAIGN_VERSION } from './campaign-rules';
import type { Speed } from './game';
const KEY = 'sand-bucket.progress.v2';
interface Progress { version:number; number:number; speed:Speed; seenMechanics:number[] }
export class ProgressStore {
  available = true;
  data:Progress = {version:CAMPAIGN_VERSION,number:1,speed:1,seenMechanics:[]};
  constructor(private storage:Pick<Storage,'getItem'|'setItem'>) {
    try {
      const raw=JSON.parse(storage.getItem(KEY)??'null');
      if(raw&&Number.isSafeInteger(raw.number)&&raw.number>=1){
        this.data.number=Math.min(raw.number,CAMPAIGN_COUNT+1);
        this.data.speed=raw.speed===2?2:1;
        if(Array.isArray(raw.seenMechanics))this.data.seenMechanics=[...new Set<number>(raw.seenMechanics.filter((k:unknown)=>Number.isInteger(k)&&Number(k)>=0&&Number(k)<=8))];
      }
    }catch{this.available=false;}
  }
  get completed():boolean {return this.data.number>CAMPAIGN_COUNT;}
  get unlocked():number {return Math.min(this.data.number,CAMPAIGN_COUNT);}
  save():void {
    try{this.storage.setItem(KEY,JSON.stringify(this.data));this.available=true;}
    catch{this.available=false;}
  }
  setSpeed(speed:Speed):void{this.data.speed=speed;this.save();}
  markMechanicsSeen(kinds:number[]):void{
    this.data.seenMechanics=[...new Set([...this.data.seenMechanics,...kinds.filter(k=>Number.isInteger(k)&&k>=0&&k<=8)])];this.save();
  }
  advance(completedLevel=this.data.number):void {
    if(completedLevel!==this.data.number||this.completed)return;
    this.data.number++;this.save();
  }
}
