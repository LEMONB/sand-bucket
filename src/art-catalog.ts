import { createScene, SCENE_PALETTES } from './art-scenes.ts';

const subjects = ['Маяк', 'Лиса', 'Воздушный шар', 'Домик', 'Парусник', 'Кит', 'Кот', 'Кактус', 'Ракета', 'Мельница'];
const places = ['у горного озера', 'среди островов', 'на закате', 'под звёздами', 'в цветущей долине', 'среди скал', 'у водопада', 'в зимнем лесу', 'под радугой', 'на побережье'];
export const ART_COUNT = 100;
export const ART_TITLES = Array.from({length:ART_COUNT}, (_, i) => i < 3 ? subjects[i] : `${subjects[i % 10]} ${places[Math.floor(i / 10)]}`);
export function artworkIndex(number: number): number { return (number - 1) % ART_COUNT; }
export function artworkPalette(index: number): string[] { return ['#000000', ...SCENE_PALETTES[index % 3]]; }

// Original geometric motifs and compositions. No downloaded images or third-party assets.
export function catalogArtwork(index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= ART_COUNT) throw new Error('Неизвестная картина');
  if (index < 3) return createScene(index);
  const cells = new Uint8Array(128 * 128).fill(2);
  const rect = (x:number,y:number,w:number,h:number,c:number) => {
    for(let py=Math.max(0,Math.floor(y));py<Math.min(128,y+h);py++) for(let px=Math.max(0,Math.floor(x));px<Math.min(128,x+w);px++)cells[py*128+px]=c;
  };
  const disk = (cx:number,cy:number,rx:number,ry:number,c:number) => {
    for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(128,cy+ry);y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(128,cx+rx);x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)cells[y*128+x]=c;
  };
  const poly = (p:number[][],c:number) => {
    const minY=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),maxY=Math.min(128,Math.ceil(Math.max(...p.map(v=>v[1]))));
    for(let y=minY;y<maxY;y++)for(let x=0;x<128;x++){
      let inside=false;
      for(let i=0,j=p.length-1;i<p.length;j=i++){
        const [a,b]=p[i],[d,e]=p[j];
        if((b>y+.5)!==(e>y+.5)&&x+.5<(d-a)*(y+.5-b)/(e-b)+a)inside=!inside;
      }
      if(inside)cells[y*128+x]=c;
    }
  };
  const tree=(x:number,y:number,s:number)=>{rect(x-2,y-20*s,4,24*s,1);poly([[x-12*s,y-8*s],[x,y-43*s],[x+12*s,y-8*s]],1);poly([[x-16*s,y],[x,y-32*s],[x+16*s,y]],1);};
  const flower=(x:number,y:number)=>{rect(x,y,2,10,1);disk(x,y,5,2,4);disk(x,y,2,5,4);disk(x,y,1,1,3);};
  const star=(x:number,y:number)=>{rect(x-3,y,7,1,3);rect(x,y-3,1,7,3);};
  const place=Math.floor(index/10),subject=index%10;
  // Ten distinct scene layouts: foregrounds, horizon, lighting objects and framing.
  if(place===0){
    poly([[0,75],[25,35],[54,73],[84,29],[128,74],[128,128],[0,128]],1);
    poly([[14,52],[25,35],[37,52],[27,48]],3);poly([[70,46],[84,29],[97,48],[82,43]],3);
    rect(0,86,128,42,2); for(let i=0;i<7;i++)rect(i*19,99+i%3*8,12,2,3);
  }else if(place===1){
    rect(0,72,128,56,1);disk(15,95,20,7,3);disk(111,113,30,8,3);disk(107,80,20,6,2);
    tree(110,79,.5);rect(4,32,24,3,3);rect(10,28,13,4,3);disk(100,22,9,9,4);
  }else if(place===2){
    rect(0,0,128,62,4);disk(62,51,30,30,3);rect(0,69,128,59,1);
    for(let i=0;i<5;i++)rect(39-i*4,80+i*7,47+i*8,2,3);
    poly([[0,112],[22,97],[40,128],[0,128]],2);poly([[100,128],[118,102],[128,110],[128,128]],2);
  }else if(place===3){
    rect(0,0,128,128,1);disk(100,24,13,13,3);disk(106,19,12,12,1);
    for(const [x,y] of [[12,14],[31,28],[62,10],[83,44],[115,55],[15,58],[46,47]])star(x,y);
    poly([[0,109],[27,88],[62,105],[92,91],[128,107],[128,128],[0,128]],2);
  }else if(place===4){
    disk(24,23,12,12,3);poly([[0,86],[23,69],[53,82],[86,63],[128,84],[128,128],[0,128]],1);
    poly([[0,108],[34,94],[77,109],[128,91],[128,128],[0,128]],2);
    for(const [x,y] of [[8,107],[22,118],[108,108],[118,121],[40,117],[92,123]])flower(x,y);
  }else if(place===5){
    poly([[0,128],[0,37],[14,20],[25,33],[30,82],[43,128]],1);
    poly([[89,128],[101,62],[109,28],[128,35],[128,128]],1);
    poly([[0,128],[43,91],[87,103],[128,128]],3);disk(65,23,10,10,4);
    rect(8,46,5,22,3);rect(113,43,4,32,3);
  }else if(place===6){
    rect(0,65,128,63,1);poly([[0,65],[22,39],[43,57],[81,36],[128,56],[128,80],[0,80]],1);
    rect(94,50,17,62,3);rect(100,50,5,66,2);disk(99,116,28,8,2);disk(99,115,17,3,3);
    tree(14,74,.7);
  }else if(place===7){
    rect(0,96,128,32,3);tree(9,99,1.6);tree(116,102,1.9);tree(30,96,.8);
    for(const [x,y] of [[22,18],[45,35],[75,15],[100,29],[9,58],[118,57],[59,49]])rect(x,y,2,2,3);
    disk(75,109,30,5,2);
  }else if(place===8){
    disk(64,55,58,48,4);disk(64,55,51,41,3);disk(64,55,44,34,1);disk(64,55,37,27,2);
    rect(0,56,128,72,2);disk(18,57,20,7,3);disk(111,57,22,7,3);
    poly([[0,113],[36,95],[82,110],[128,97],[128,128],[0,128]],1);
  }else{
    rect(0,74,128,54,1);poly([[0,128],[0,111],[31,97],[58,112],[81,105],[128,119],[128,128]],3);
    for(let i=0;i<5;i++)rect(i*28,83+i%2*9,18,2,2);
    disk(106,26,12,12,4);poly([[9,37],[18,32],[26,37],[18,35]],1);poly([[28,23],[36,18],[44,23],[36,21]],1);
  }
  const cx=place===6?54:64,base=place===3?104:100;
  if(subject===0){
    poly([[cx-15,base],[cx-10,base-61],[cx+10,base-61],[cx+15,base]],3);
    rect(cx-12,base-38,24,11,4);rect(cx-14,base-70,28,10,1);rect(cx-10,base-67,20,5,3);
    poly([[cx-18,base-70],[cx,base-83],[cx+18,base-70]],4);rect(cx-3,base-18,6,18,1);
  }else if(subject===1||subject===6){
    const fox=subject===1;
    disk(cx+15,base-14,23,13,fox?4:1);disk(cx+27,base-15,10,7,3);
    disk(cx-4,base-19,18,23,fox?4:3);disk(cx-4,base-44,22,18,fox?4:3);
    poly([[cx-25,base-47],[cx-24,base-73],[cx-7,base-58]],fox?4:3);poly([[cx+1,base-58],[cx+14,base-73],[cx+17,base-46]],fox?4:3);
    poly([[cx-22,base-43],[cx-3,base-30],[cx+15,base-43],[cx+4,base-24],[cx-9,base-24]],fox?3:4);
    rect(cx-14,base-47,4,4,1);rect(cx+5,base-47,4,4,1);rect(cx-5,base-33,4,3,1);
    rect(cx-18,base-3,12,3,1);rect(cx,base-3,12,3,1);
    if(!fox){rect(cx-30,base-37,12,1,1);rect(cx+12,base-37,12,1,1);rect(cx-29,base-32,10,1,1);}
  }else if(subject===2){
    disk(cx,base-57,24,29,4);poly([[cx-21,base-41],[cx+21,base-41],[cx+8,base-20],[cx-8,base-20]],4);
    disk(cx,base-57,9,29,3);poly([[cx-9,base-40],[cx+9,base-40],[cx+4,base-20],[cx-4,base-20]],3);
    rect(cx-8,base-20,2,11,1);rect(cx+6,base-20,2,11,1);rect(cx-9,base-9,18,9,1);rect(cx-6,base-8,12,5,3);
  }else if(subject===3){
    rect(cx-25,base-35,50,35,3);poly([[cx-33,base-35],[cx,base-63],[cx+33,base-35]],4);
    rect(cx+13,base-66,7,18,1);rect(cx-5,base-23,11,23,1);
    rect(cx-19,base-27,9,11,2);rect(cx+12,base-27,9,11,2);rect(cx-19,base-22,9,2,1);rect(cx+16,base-27,2,11,1);
    rect(cx-29,base,58,4,4);
  }else if(subject===4){
    poly([[cx-35,base-14],[cx+36,base-14],[cx+23,base],[cx-23,base]],4);rect(cx-2,base-75,3,60,1);
    poly([[cx-6,base-70],[cx-32,base-22],[cx-6,base-22]],3);poly([[cx+4,base-65],[cx+31,base-22],[cx+4,base-22]],3);
    poly([[cx+1,base-77],[cx+18,base-73],[cx+1,base-68]],4);rect(cx-23,base+5,47,2,3);
  }else if(subject===5){
    disk(cx-5,base-23,31,20,1);poly([[cx+15,base-28],[cx+34,base-36],[cx+42,base-54],[cx+43,base-28],[cx+22,base-8]],1);
    disk(cx-10,base-15,22,8,3);disk(cx-23,base-30,3,3,3);disk(cx-23,base-30,1,1,1);
    rect(cx-12,base-63,3,19,3);disk(cx-17,base-63,7,3,3);disk(cx-5,base-65,7,3,3);
    poly([[cx-3,base-14],[cx+12,base-3],[cx+5,base-21]],2);
  }else if(subject===7){
    rect(cx-10,base-60,20,47,1);disk(cx,base-61,10,10,1);
    rect(cx-28,base-49,8,25,1);rect(cx-28,base-31,21,8,1);rect(cx+7,base-44,23,8,1);rect(cx+22,base-61,8,25,1);
    rect(cx-5,base-62,2,42,2);rect(cx+4,base-53,2,35,2);
    poly([[cx-20,base-14],[cx+20,base-14],[cx+15,base+7],[cx-15,base+7]],4);rect(cx-22,base-17,44,6,3);flower(cx,base-73);
  }else if(subject===8){
    poly([[cx-13,base-18],[cx-13,base-58],[cx,base-80],[cx+13,base-58],[cx+13,base-18]],3);
    poly([[cx-13,base-39],[cx-26,base-13],[cx-13,base-18]],4);poly([[cx+13,base-39],[cx+26,base-13],[cx+13,base-18]],4);
    disk(cx,base-51,8,8,1);disk(cx-2,base-53,3,3,2);rect(cx-13,base-25,26,7,4);
    poly([[cx-8,base-17],[cx+8,base-17],[cx,base+9]],4);poly([[cx-4,base-17],[cx+4,base-17],[cx,base]],3);
  }else{
    poly([[cx-17,base],[cx-10,base-56],[cx+10,base-56],[cx+17,base]],3);
    poly([[cx-15,base-56],[cx,base-72],[cx+15,base-56]],4);
    poly([[cx-2,base-49],[cx-29,base-73],[cx-35,base-65],[cx-5,base-44]],1);
    poly([[cx+2,base-49],[cx+28,base-73],[cx+35,base-65],[cx+5,base-44]],1);
    poly([[cx+2,base-42],[cx+29,base-18],[cx+35,base-26],[cx+5,base-47]],1);
    poly([[cx-2,base-42],[cx-29,base-18],[cx-35,base-26],[cx-5,base-47]],1);disk(cx,base-46,5,5,4);rect(cx-4,base-14,8,14,1);
  }
  flower(16,116);
  return cells;
}
