import { bucketIcon } from './bucket-icon';
import { COLOR_NAMES, PALETTE, type Game } from './game';

export class FieldView {
  private revision=-1;
  private freeSlots=-1;
  private positions=new Map<number,number>();
  private buttons:HTMLButtonElement[]=[];
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private host:HTMLElement,private sand:HTMLElement) {}
  reset(game:Game):void {
    this.revision=-1;this.positions.clear();
    this.host.innerHTML=game.field.map((_,i)=>`<button class="field-bucket" data-position="${i}"><span class="bucket-shape">${bucketIcon}<b class="bucket-mark"></b></span><span class="bucket-extra"></span></button>`).join('');
    this.buttons=[...this.host.querySelectorAll<HTMLButtonElement>('button')];this.draw(game);
  }
  draw(game:Game):void {
    const freeSlots=game.slots.filter(b=>!b).length;
    if(this.revision===game.fieldRevision&&(!game.mechanics.links.length||this.freeSlots===freeSlots))return;
    this.freeSlots=freeSlots;
    this.revision=game.fieldRevision;
    this.host.querySelectorAll('.mechanic-surface,.pair-rope').forEach(e=>e.remove());
    this.sand.querySelectorAll('.sand-lid').forEach(e=>e.remove());
    const blocked=new Set(game.walls);
    game.mechanics.gates.forEach(g=>g.cells.forEach(i=>blocked.add(i)));
    game.mechanics.bridges.forEach(b=>b.passage.forEach(i=>blocked.add(i)));
    const surfaceCells=new Set([...game.mechanics.platforms.flatMap(p=>p.cells),...game.mechanics.trays.flat(),...game.mechanics.bridges.flatMap(b=>b.cells)]);
    const nextPositions=new Map<number,number>();
    for(const [i,button] of this.buttons.entries()){
      const bucket=game.field[i];
      const pair=bucket&&game.mechanics.links.find(p=>p.includes(bucket.id));
      const partner=pair?.find(id=>id!==bucket!.id);
      const partnerIndex=pair?game.field.findIndex(b=>b?.id===partner):-1;
      const available=!!bucket&&game.paths.has(i)&&(!pair||freeSlots<2||game.paths.has(partnerIndex));
      button.className=`field-bucket ${blocked.has(i)?'mechanic-wall':!bucket?'is-empty':available?'is-available':'is-blocked'}`;
      button.classList.toggle('on-surface',surfaceCells.has(i));
      button.disabled=!available;
      button.style.gridColumn=String(i%game.columns+1);button.style.gridRow=String(Math.floor(i/game.columns)+1);
      const shape=button.querySelector<HTMLElement>('.bucket-shape')!,mark=button.querySelector<HTMLElement>('.bucket-mark')!,extra=button.querySelector<HTMLElement>('.bucket-extra')!;
      mark.textContent='';extra.innerHTML='';
      if(blocked.has(i)){
        const gate=game.mechanics.gates.some(g=>g.cells.includes(i));
        extra.textContent=gate?'⚿':'';
      }
      if(!bucket){button.setAttribute('aria-label',blocked.has(i)?'Закрытый проход':'Пустое место');continue;}
      button.style.setProperty('--color',game.palette[bucket.color]);
      nextPositions.set(bucket.id,i);
      const key=game.mechanics.gates.some(g=>g.key===bucket.id),lid=game.mechanics.lids.some(l=>l.key===bucket.id);
      mark.textContent=key?'⚿':lid?'◇':bucket.alternate?'↻':'';
      const queue=game.mechanics.queues.find(q=>q.cell===i);
      if(queue?.buckets.length)extra.innerHTML=`<span class="queue-colors">${queue.buckets.map(b=>`<i style="background:${game.palette[b.color]}"></i>`).join('')}</span><small>${queue.buckets.length+1}/5</small>`;
      if(bucket.alternate)extra.innerHTML=`<i class="alternate-color" style="background:${game.palette[bucket.alternate]}"></i>`;
      const name=game.palette[1]===PALETTE[1]?COLOR_NAMES[bucket.color]:['','Тёмное','Бирюзовое','Песочное','Коралловое'][bucket.color];
      button.setAttribute('aria-label',`${name} ведро ${bucket.id+1}, ${available?'доступно':'проход закрыт'}${key?', ключ':''}${lid?', открывает крышку':''}${bucket.alternate?', меняет цвет после хода':''}${queue?`, в очереди ${queue.buckets.length+1}`:''}`);
      const old=this.positions.get(bucket.id);
      if(old!==undefined&&old!==i&&!this.reduced.matches){
        const from=this.buttons[old].getBoundingClientRect(),to=button.getBoundingClientRect();
        shape.animate([{transform:`translate(${from.left-to.left}px,${from.top-to.top}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'ease-out'});
      }
    }
    this.positions=nextPositions;
    const surface=(cells:number[],className:string,text='')=>{
      const xs=cells.map(i=>i%game.columns),ys=cells.map(i=>Math.floor(i/game.columns));
      const element=document.createElement('div');element.className=`mechanic-surface ${className}`;element.setAttribute('aria-hidden','true');
      element.style.gridColumn=`${Math.min(...xs)+1} / ${Math.max(...xs)+2}`;element.style.gridRow=`${Math.min(...ys)+1} / ${Math.max(...ys)+2}`;
      element.textContent=text;this.host.append(element);return element;
    };
    game.mechanics.platforms.forEach(p=>{
      const panel=surface(p.cells,'platform-surface',p.next.length?'Ⅱ':'Ⅰ');
      if(p.next.length){const colors=document.createElement('span');colors.className='platform-next';colors.innerHTML=p.next.map(b=>`<i style="background:${game.palette[b.color]}"></i>`).join('');panel.append(colors);}
    });
    game.mechanics.trays.forEach(t=>surface(t,'tray-surface','↻'));
    game.mechanics.bridges.forEach(b=>surface(b.cells,'bridge-surface'));
    game.mechanics.links.forEach(pair=>{
      const indexes=pair.map(id=>game.field.findIndex(b=>b?.id===id));
      if(indexes.some(i=>i<0))return;
      const host=this.host.getBoundingClientRect(),a=this.buttons[indexes[0]].getBoundingClientRect(),b=this.buttons[indexes[1]].getBoundingClientRect();
      const x=a.left+a.width/2-host.left,y=a.top+a.height/2-host.top,dx=b.left+b.width/2-host.left-x,dy=b.top+b.height/2-host.top-y;
      const rope=document.createElement('div');rope.className='pair-rope';rope.setAttribute('aria-hidden','true');
      Object.assign(rope.style,{left:`${x}px`,top:`${y}px`,width:`${Math.hypot(dx,dy)}px`,transform:`rotate(${Math.atan2(dy,dx)}rad)`});this.host.append(rope);
    });
    game.mechanics.lids.forEach(l=>{
      const lid=document.createElement('div');lid.className='sand-lid';lid.textContent='◇';lid.setAttribute('aria-label','Песок под крышкой');
      Object.assign(lid.style,{left:`${l.x/128*100}%`,top:`${l.y/128*100}%`,width:`${l.width/128*100}%`,height:`${l.height/128*100}%`});this.sand.append(lid);
    });
    const focused=document.activeElement;
    if(focused instanceof HTMLButtonElement&&focused.disabled&&this.buttons.includes(focused))this.buttons.find(b=>!b.disabled)?.focus({preventScroll:true});
  }
  resize(game:Game):void {this.revision=-1;this.draw(game);}
}
