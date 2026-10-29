import { ART_TITLES, artworkPalette, catalogArtwork } from './art-catalog';
import './catalog-preview.css';
const host=document.querySelector<HTMLElement>('#catalog')!;
host.innerHTML=`<h1>100 картин</h1><p>Оригинальные геометрические мотивы в разных композициях. Порядок совпадает с первыми 100 уровнями.</p><section>${ART_TITLES.map((title,i)=>`<figure><canvas width="128" height="128" role="img" aria-label="${title}" data-art="${i}"></canvas><figcaption>${i+1}. ${title}</figcaption></figure>`).join('')}</section>`;
host.querySelectorAll<HTMLCanvasElement>('canvas').forEach(canvas=>{
  const art=Number(canvas.dataset.art),cells=catalogArtwork(art),palette=artworkPalette(art),context=canvas.getContext('2d')!;
  cells.forEach((c,i)=>{context.fillStyle=palette[c];context.fillRect(i%128,Math.floor(i/128),1,1);});
});
