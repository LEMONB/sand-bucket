import { trayPosition } from './bucket-motion';
import { bucketIcon } from './bucket-icon';
import { bucketMarks, gameIcon, keyColor, yokeIcon } from './game-icons';
import { COLOR_NAMES, PALETTE, type Game } from './game';

export function wallConnections(index:number,columns:number,walls:ReadonlySet<number>):string[] {
  if(!walls.has(index))return [];
  const connections:string[]=[];
  if(index>=columns&&walls.has(index-columns))connections.push('wall-up');
  if(index%columns<columns-1&&walls.has(index+1))connections.push('wall-right');
  if(walls.has(index+columns))connections.push('wall-down');
  if(index%columns>0&&walls.has(index-1))connections.push('wall-left');
  return connections;
}

export class FieldView {
  private revision=-1;
  private freeSlots=-1;
  private positions=new Map<number,number>();
  private colors=new Map<number,number>();
  private overlays=new Map<string,HTMLElement>();
  private turns=0;
  private initialized=false;
  private animate(element:HTMLElement,frames:Keyframe[],duration=360):Animation|undefined {
    if(this.reduced.matches)return;
    element.getAnimations().forEach(a=>a.cancel());
    return element.animate(frames,{duration,easing:'cubic-bezier(.22,.7,.25,1)'});
  }
  private buttons:HTMLButtonElement[]=[];
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private host:HTMLElement,private sand:HTMLElement) {}
  reset(game:Game):void {
    this.revision=-1;this.positions.clear();this.colors.clear();this.turns=game.turns;this.initialized=false;
    this.overlays.forEach(e=>e.remove());this.overlays.clear();
    this.sand.querySelectorAll('.sand-lid').forEach(e=>e.remove());
    this.host.innerHTML=game.field.map((_,i)=>`<button class="field-bucket" data-position="${i}"><span class="bucket-shape">${bucketIcon}<b class="bucket-mark"></b></span><span class="bucket-extra"></span></button>`).join('');
    this.buttons=[...this.host.querySelectorAll<HTMLButtonElement>('button')];this.draw(game);
  }
  draw(game:Game):void {
    const freeSlots=game.slots.filter(b=>!b).length;
    if(this.revision===game.fieldRevision&&(!game.mechanics.links.length||this.freeSlots===freeSlots))return;
    this.freeSlots=freeSlots;
    this.revision=game.fieldRevision;
    const previous=this.overlays;this.overlays=new Map();
    const rotated=this.turns!==game.turns&&game.motionTick>=game.busyUntil-10;
    const overlay=(key:string,className:string,parent=this.host)=>{
      const element=previous.get(key)??document.createElement('div');
      element.className=className;element.setAttribute('aria-hidden','true');
      if(!element.parentElement)parent.append(element);
      previous.delete(key);this.overlays.set(key,element);return element;
    };
    const blocked=new Set(game.walls);
    game.mechanics.gates.forEach(g=>g.cells.forEach(i=>blocked.add(i)));
    const surfaceCells=new Set([...game.mechanics.platforms.flatMap(p=>p.cells),...game.mechanics.trays.flat()]);
    const nextPositions=new Map<number,number>();
    for(const [i,button] of this.buttons.entries()){
      const bucket=game.field[i];
      const hidden=!!bucket&&game.isHidden(bucket);
      const available=!!bucket&&game.paths.has(i);
      button.className=`field-bucket ${blocked.has(i)?'mechanic-wall':!bucket?'is-empty':available?'is-available':'is-blocked'}`;
      if(game.walls.has(i))button.classList.add('solid-wall',...wallConnections(i,game.columns,game.walls));
      button.classList.toggle('on-surface',surfaceCells.has(i));
      button.classList.toggle('is-hidden',hidden);
      button.disabled=!available;
      button.style.gridColumn=String(i%game.columns+1);button.style.gridRow=String(Math.floor(i/game.columns)+1);
      const shape=button.querySelector<HTMLElement>('.bucket-shape')!,mark=button.querySelector<HTMLElement>('.bucket-mark')!,extra=button.querySelector<HTMLElement>('.bucket-extra')!;
      if(button.dataset.bucket!==String(bucket?.id)){shape.getAnimations().forEach(a=>a.cancel());button.dataset.bucket=String(bucket?.id);}
      const queue=game.mechanics.queues.find(q=>q.cell===i);
      const remaining=(queue?.buckets.length??0)+Number(!!bucket);
      button.classList.toggle('is-dispenser',!!queue);
      mark.textContent='';extra.innerHTML=queue?`<span class="queue-dispenser" aria-hidden="true"></span>${remaining!==1?`<small class="queue-count" aria-hidden="true">${remaining}</small>`:''}`:'';
      if(!bucket){button.setAttribute('aria-label',queue?`Диспенсер: осталось вёдер ${remaining}`:blocked.has(i)?'Закрытый проход':'Пустое место');continue;}
      button.style.setProperty('--color',hidden?'#9ba49e':game.palette[bucket.color]);
      nextPositions.set(bucket.id,i);
      const swapPartner=bucket.swapWith===undefined?undefined:game.field.find(b=>b?.id===bucket.swapWith);
      const key=game.mechanics.gates.some(g=>g.key===bucket.id),lid=game.mechanics.lids.some(l=>l.key===bucket.id);
      mark.innerHTML=hidden?gameIcon('mystery'):'';
      extra.innerHTML+=bucketMarks(game,bucket,hidden);
      const name=game.palette[1]===PALETTE[1]?COLOR_NAMES[bucket.color]:['','Тёмное','Бирюзовое','Песочное','Коралловое','Синее','Зелёное','Жёлтое','Фиолетовое'][bucket.color];
      button.setAttribute('aria-label',`${hidden?'Скрытое':name} ведро ${bucket.id+1}, ${available?'доступно':'проход закрыт'}${key?', ключ':''}${lid?', открывает крышку':''}${swapPartner?`, обменивается цветом с ведром ${swapPartner.id+1} после хода`:''}${queue?`, диспенсер: осталось вёдер ${remaining}`:''}`);
      const old=this.positions.get(bucket.id);
      const base=available?'rotate(0deg) scale(1)':'rotate(180deg)';
      if(old!==undefined&&old!==i){
        const from=this.buttons[old].getBoundingClientRect(),to=button.getBoundingClientRect();
        const tray=game.mechanics.trays.find(t=>t.includes(i)&&t.includes(old));
        if(tray){
          const first=this.buttons[tray[0]].getBoundingClientRect(),last=this.buttons[tray[2]].getBoundingClientRect();
          const cx=(first.left+last.right)/2,cy=(first.top+last.bottom)/2;

          this.animate(shape,Array.from({length:9},(_,j)=>{
            const point=trayPosition({x:from.left+from.width/2,y:from.top+from.height/2},{x:cx,y:cy},j/8);
            return {transform:`translate(${point.x-to.left-to.width/2}px,${point.y-to.top-to.height/2}px) ${base}`};
          }),400);
        }else this.animate(shape,[{transform:`translate(${from.left-to.left}px,${from.top-to.top}px) ${base}`},{transform:base}]);
      }else if(this.initialized&&old===undefined){
        this.animate(shape,[{transform:`translateY(16px) scale(.75) ${base}`,opacity:0},{transform:base,opacity:1}],400);
      }else if(this.colors.has(bucket.id)&&this.colors.get(bucket.id)!==bucket.color){
        this.animate(shape,[{transform:base,color:game.palette[this.colors.get(bucket.id)!]},{transform:`${base} scaleX(.08)`,offset:.49,color:game.palette[this.colors.get(bucket.id)!]},{transform:`${base} scaleX(.08)`,offset:.5,color:game.palette[bucket.color]},{transform:base,color:game.palette[bucket.color]}],400);
      }
    }
    this.positions=nextPositions;
    this.colors=new Map(game.field.filter(b=>b&&!game.isHidden(b)).map(b=>[b!.id,b!.color]));
    const surface=(cells:number[],className:string,text='')=>{
      const xs=cells.map(i=>i%game.columns),ys=cells.map(i=>Math.floor(i/game.columns));
      const element=overlay(`${className}:${cells.join(',')}`,`mechanic-surface ${className}`);
      element.style.gridColumn=`${Math.min(...xs)+1} / ${Math.max(...xs)+2}`;element.style.gridRow=`${Math.min(...ys)+1} / ${Math.max(...ys)+2}`;
      element.textContent=text;return element;
    };
    game.mechanics.platforms.forEach(p=>{
      const key=`platform-surface:${p.cells.join(',')}`;
      const wasUpper=previous.get(key)?.dataset.upper==='true';
      const panel=surface(p.cells,'platform-surface');
      panel.dataset.upper=String(p.next.length>0);
      if(wasUpper&&!p.next.length)this.animate(panel,[{transform:'translateY(5px) scale(.97)'},{transform:'translateY(-2px) scale(1.01)',offset:.65},{transform:'none'}],450);
    });
    game.mechanics.trays.forEach(t=>{const panel=surface(t,'tray-surface');panel.innerHTML=gameIcon('rotate');if(rotated)this.animate(panel,[{transform:'rotate(-90deg)'},{transform:'rotate(0deg)'}],400);});
    game.mechanics.gates.forEach(g=>{const panel=surface(g.cells,'gate-surface');panel.innerHTML=gameIcon('lock');panel.style.color=keyColor(game,g.key);});
    game.mechanics.links.forEach(pair=>{
      const indexes=pair.map(id=>game.field.findIndex(b=>b?.id===id));
      if(indexes.some(i=>i<0))return;
      const host=this.host.getBoundingClientRect(),a=this.buttons[indexes[0]].getBoundingClientRect(),b=this.buttons[indexes[1]].getBoundingClientRect();
      const x=a.left+a.width/2-host.left,y=a.top+a.height/2-host.top,dx=b.left+b.width/2-host.left-x,dy=b.top+b.height/2-host.top-y;
      const rope=overlay(`pair:${pair.join(',')}`,'pair-yoke');rope.innerHTML=yokeIcon;
      Object.assign(rope.style,{left:`${x}px`,top:`${y-19}px`,width:`${Math.hypot(dx,dy)}px`,transform:`rotate(${Math.atan2(dy,dx)}rad)`});
    });
    game.mechanics.lids.forEach(l=>{
      const lid=overlay(`lid:${l.key}`,'sand-lid',this.sand);lid.innerHTML=gameIcon('lid');lid.style.color=keyColor(game,l.key);lid.setAttribute('aria-label','Песок под крышкой');
      Object.assign(lid.style,{left:`${l.x/128*100}%`,top:`${l.y/128*100}%`,width:`${l.width/128*100}%`,height:`${l.height/128*100}%`});
    });
    previous.forEach((element,key)=>{
      if(key.startsWith('pair:')&&key.slice(5).split(',').every(id=>!nextPositions.has(Number(id)))){element.remove();return;}
      const base=element.style.transform||'none';
      let frames:Keyframe[]=[{opacity:1,transform:base},{opacity:0,transform:base}];
      if(key.startsWith('lid:'))frames=[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-24px) rotate(-8deg) scale(.94)'}];
      if(key.startsWith('gate-surface'))frames=[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-12px) scale(.8)'}];
      if(key.startsWith('pair:'))frames=[{opacity:1,transform:base},{opacity:0,transform:`${base} scaleX(.15)`}];
      element.style.zIndex='3';
      const animation=this.animate(element,frames,400);
      if(animation)animation.onfinish=()=>element.remove();else element.remove();
    });
    if(rotated)this.turns=game.turns;
    this.initialized=true;
    const focused=document.activeElement;
    if(focused instanceof HTMLButtonElement&&focused.disabled&&this.buttons.includes(focused))this.buttons.find(b=>!b.disabled)?.focus({preventScroll:true});
  }
  resize(game:Game):void {this.revision=-1;this.draw(game);}
}
