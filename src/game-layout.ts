import type { Game } from './game';

export function fitField(width:number, available:number, columns:number, rows:number): {cell:number;beltHeight:number;width:number;height:number} {
  const fixed=(available-44-12-(rows-1)*2)/rows;
  const adaptive=(available-8-12-(rows-1)*2)/(rows+.8);
  const cell=Math.max(0,Math.min((width-12-(columns-1)*2)/columns,fixed*.8+8>=44?fixed:adaptive));
  return {cell,beltHeight:Math.min(44,cell*.8+8),width:columns*cell+(columns-1)*2+12,height:rows*cell+(rows-1)*2+12};
}

export function layoutGame(root:HTMLElement,game:Game):void {
  const space=root.querySelector<HTMLElement>('#field-space')!,field=root.querySelector<HTMLElement>('#field')!,belt=root.querySelector<HTMLElement>('#belt')!;
  const bounds=space.getBoundingClientRect();
  const fit=fitField(bounds.width,bounds.height+belt.getBoundingClientRect().height,game.columns,game.rows);
  root.style.setProperty('--belt-scale',String(fit.beltHeight/68));
  root.style.setProperty('--cell-size',fit.cell+'px');
  root.style.setProperty('--field-scale',String(Math.min(1,fit.cell/48)));
  field.style.width=fit.width+'px';field.style.height=fit.height+'px';
  const svg=root.querySelector<SVGSVGElement>('#field-walls')!,origin=root.getBoundingClientRect(),rect=field.getBoundingClientRect();
  const x=rect.left-origin.left,y=rect.top-origin.top,w=origin.width,h=origin.height;
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const ground=svg.querySelector('rect')!;
  for(const [key,value] of Object.entries({x,y,width:fit.width,height:fit.height}))ground.setAttribute(key,String(value));
  const shapes=[`<path fill-rule="evenodd" d="M-20 ${y}H${w+20}V${h+20}H-20Z M${x} ${y}H${x+fit.width}V${y+fit.height}H${x}Z"/>`];
  for(const index of game.walls){
    const col=index%game.columns,row=Math.floor(index/game.columns),cx=x+6+col*(fit.cell+2),cy=y+6+row*(fit.cell+2);
    const left=cx+(col===0?-6:game.walls.has(index-1)?-1:3);
    const right=cx+fit.cell+(col===game.columns-1?6:game.walls.has(index+1)?1:-3);
    const top=cy+(row>0&&game.walls.has(index-game.columns)?-1:3);
    const bottom=cy+fit.cell+(row===game.rows-1?6:game.walls.has(index+game.columns)?1:-3);
    shapes.push(`<rect x="${left}" y="${top}" width="${Math.max(0,right-left)}" height="${Math.max(0,bottom-top)}"/>`);
  }
  svg.querySelector('g')!.innerHTML=shapes.join('');
  const filter=svg.querySelector('filter')!;
  filter.setAttribute('width',String(w+40));filter.setAttribute('height',String(h+40));
  svg.querySelector('feGaussianBlur')!.setAttribute('stdDeviation',String(Math.min(4,fit.cell*.15)));
}
