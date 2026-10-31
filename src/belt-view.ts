import { bucketPosition, landingMotion } from './bucket-motion';
import { bucketIcon } from './bucket-icon';
import { bucketMarks, yokeIcon } from './game-icons';
import { BELT_LIMIT, LAUNCH_TICKS, LOOP_TICKS, type Game, type GameEvent, type Speed } from './game';

export class BeltView {
  private readonly views: { slot: HTMLElement; bucket: HTMLElement; fill: HTMLElement; label: HTMLElement; id: number; percent: number; marks: HTMLElement }[][] = [];
  private readonly effects: { element: HTMLElement; rope: HTMLElement; x:number; y:number; active: boolean; event?: GameEvent; started: number }[] = [];
  private readonly stream = document.createElement('canvas');
  private readonly streamContext = this.stream.getContext('2d')!;
  private readonly grains = Array.from({ length: 120 }, () => ({ active: false, born: 0, x: 0, y: 0, slot: 0, color: 1, jitter: 0 }));
  private nextGrain = 0;
  private sandRect!: DOMRect;
  private streamTop = 0;
  private clock = 0;
  private sandClock = 0;
  private beltRect!: DOMRect;
  private cells: {x:number;y:number}[] = [];
  private grainSize = 32;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private belt: HTMLElement, private field: HTMLElement, private sand: HTMLElement) {
    this.stream.className = 'sand-stream'; this.stream.setAttribute('aria-hidden', 'true'); document.body.append(this.stream);
    for(let slot=0;slot<BELT_LIMIT;slot++) {
      const views=[];
      for(let fragment=0;fragment<2;fragment++) {
        const element=document.createElement('div');element.className='mock-slot';element.setAttribute('aria-hidden','true');
        element.innerHTML=`<div class="slot-bucket">${bucketIcon}<span class="belt-marks"></span><i class="mock-fill"></i><small></small></div>`;
        belt.append(element);
        views.push({slot:element,bucket:element.firstElementChild as HTMLElement,fill:element.querySelector('i')!,label:element.querySelector('small')!,id:-1,percent:-1,marks:element.querySelector<HTMLElement>('.belt-marks')!});
      }
      this.views.push(views);
    }
    // At most five launches plus recent completions; reuse a bounded visual pool.
    for(let i=0;i<20;i++) {
      const element=document.createElement('div');element.className='flying-bucket';element.hidden=true;element.setAttribute('aria-hidden','true');
      element.innerHTML=`${bucketIcon}<span class="belt-marks"></span><i class="completion-fill"></i><small class="completion-label">100%</small><span class="sparkles">✦ · ✧</span>`;document.body.append(element);
      const rope=document.createElement('div');rope.className='pair-yoke flying-yoke';rope.innerHTML=yokeIcon;rope.hidden=true;rope.setAttribute('aria-hidden','true');document.body.append(rope);
      this.effects.push({element,rope,x:0,y:0,active:false,started:0});
    }
  }
  measure(): void {
    this.beltRect=this.belt.getBoundingClientRect();
    this.sandRect=this.sand.getBoundingClientRect();
    this.streamTop=this.sandRect.bottom-this.sandRect.height*5/128-8;
    this.stream.width=Math.ceil(this.beltRect.width);
    this.stream.height=Math.ceil(this.beltRect.bottom-this.streamTop);
    this.stream.style.left=`${this.beltRect.left}px`;this.stream.style.top=`${this.streamTop}px`;
    this.cells=[...this.field.children].map(element=>{const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
    const shape=this.field.querySelector('.bucket-shape');
    if(shape)this.grainSize=shape.getBoundingClientRect().width;
  }
  reset(): void { this.views.flat().forEach(v=>{v.id=-1;});this.grains.forEach(g=>{g.active=false;});this.streamContext.clearRect(0,0,this.stream.width,this.stream.height);for(const effect of this.effects){effect.active=false;effect.element.hidden=true;effect.rope.hidden=true;} }
  get busy(): boolean {return this.effects.some(e=>e.active);}
  draw(game: Game, seconds: number, speed:Speed=1): void {
    this.clock+=seconds;this.sandClock+=seconds*speed;
    for(const event of game.events) {
      if(event.type==='arrive')continue;
      if(event.type==='collect') {
        for(let i=0;i<Math.min(3,event.amount!);i++) {
          const grain=this.grains[this.nextGrain++%this.grains.length];
          Object.assign(grain,{active:true,born:this.sandClock-i*.025,x:this.sandRect.left+4+event.from!.x*(this.sandRect.width-8)-this.beltRect.left,
            y:this.sandRect.top+4+event.from!.y*(this.sandRect.height-8)-this.streamTop,slot:event.slot,color:event.bucket.color,jitter:(i-1)*3});
        }
        continue;
      }
      const effect=this.effects.find(e=>!e.active);
      if(!effect)continue;
      effect.active=true;effect.event=event;effect.started=this.clock;effect.element.hidden=false;
      effect.element.style.color=game.palette[event.bucket.color];
      effect.element.querySelector('.belt-marks')!.innerHTML=bucketMarks(game,event.bucket);
      effect.element.classList.toggle('completion',event.type==='complete');
      effect.element.style.width=`${event.type==='complete'?48:this.grainSize}px`;
    }
    game.events.length=0;
    for(let slot=0;slot<BELT_LIMIT;slot++) {
      const position=game.slotPosition(slot),bucket=game.slots[slot];
      const visible=bucket!==null&&game.motionTick>=bucket.arrivalTick;
      const percent=bucket?Math.floor(bucket.filled/bucket.capacity*100):0;
      for(let fragment=0;fragment<2;fragment++) {
        const view=this.views[slot][fragment];
        const x=(fragment===0?position:position+(position<.5?1:-1))*this.beltRect.width;
        view.slot.style.transform=`translateX(${x-27}px)`;
        view.bucket.hidden=!visible;
        if(bucket&&view.id!==bucket.id){view.id=bucket.id;view.bucket.style.color=game.palette[bucket.color];view.marks.innerHTML=bucketMarks(game,bucket);}
        const settle=this.reduced.matches||!bucket?0:landingMotion((game.motionTick-bucket.arrivalTick)/16);
        view.bucket.style.transform=`translateY(${settle*5}px) scale(${1+settle*.09},${1-settle*.1})`;
        if(percent!==view.percent){view.percent=percent;view.fill.style.height=`${24*percent/100}px`;view.label.textContent=`${percent}%`;}
      }
    }
    const ctx=this.streamContext;
    ctx.clearRect(0,0,this.stream.width,this.stream.height);
    for(const grain of this.grains) {
      if(!grain.active)continue;
      const t=(this.sandClock-grain.born)/.22;
      if(t>=1){grain.active=false;continue;}
      const targetX=game.slotPosition(grain.slot)*this.beltRect.width;
      const targetY=this.beltRect.top+25-this.streamTop;
      const x=this.reduced.matches?targetX:grain.x+(targetX-grain.x)*t+grain.jitter*Math.sin(t*Math.PI);
      const y=this.reduced.matches?targetY:grain.y+(targetY-grain.y)*t*t;
      ctx.globalAlpha=this.reduced.matches ? .45*(1-t) : 1;
      ctx.fillStyle=game.palette[grain.color];ctx.fillRect(x-1.5,y-1.5,3,3);
    }
    ctx.globalAlpha=1;
    for(const effect of this.effects) {
      if(!effect.active)continue;
      const event=effect.event!,complete=event.type==='complete';
      const t=complete?Math.min((this.clock-effect.started)/.8,1):Math.min((game.motionTick-event.motionTick!)/LAUNCH_TICKS,1);
      const end={x:this.beltRect.left+game.slotPosition(event.slot)*this.beltRect.width,y:this.beltRect.top+34};
      let x=end.x,y=end.y,scale=1,scaleY=1,angle=0,opacity=1;
      if(complete){
        x=this.beltRect.left+(((event.tick%LOOP_TICKS)/LOOP_TICKS+event.slot/BELT_LIMIT)%1)*this.beltRect.width;
        const lift=Math.max(0,(t-.18)/.82);
        y+=Math.sin(Math.min(t/.18,1)*Math.PI)*3-lift*lift*24;
        scale=1+Math.sin(t*Math.PI)*.12-lift*lift*.35;scaleY=scale;
        opacity=1-lift*lift;
      }else{
        const path=event.path!;
        const mouth={x:this.cells[path[path.length-1]].x,y:this.beltRect.bottom+4};
        const points=[...path.map(i=>this.cells[i]),mouth,end];
        const position=bucketPosition(points,t);
        const before=bucketPosition(points,Math.max(0,t-.015));
        x=position.x;y=position.y;
        angle=Math.max(-7,Math.min(7,(position.x-before.x)*.7))*Math.sin(t*Math.PI);
        const width=this.grainSize+(48-this.grainSize)*t;
        effect.element.style.width=`${width}px`;
        scaleY=1+Math.sin(t*Math.PI)*.035;
      }
      effect.x=x;effect.y=y;
      effect.element.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${this.reduced.matches?0:angle}deg) scale(${this.reduced.matches?1:scale},${this.reduced.matches?1:scaleY})`;
      effect.element.style.opacity=String(this.reduced.matches?(complete?opacity:0):opacity);
      if(t>=1){effect.active=false;effect.element.hidden=true;}
    }
    for(const effect of this.effects){
      const partnerId=effect.event?.partnerId;
      const partner=partnerId===undefined?undefined:this.effects.find(e=>e.active&&e.event?.type==='launch'&&e.event.bucket.id===partnerId);
      const visible=effect.active&&effect.event?.type==='launch'&&partner&&effect.event.bucket.id<partnerId!&&!this.reduced.matches;
      effect.rope.hidden=!visible;
      if(visible){
        const dx=partner!.x-effect.x,dy=partner!.y-effect.y;
        Object.assign(effect.rope.style,{left:`${effect.x}px`,top:`${effect.y-19}px`,width:`${Math.hypot(dx,dy)}px`,transform:`rotate(${Math.atan2(dy,dx)}rad)`});
      }
    }
  }
}
