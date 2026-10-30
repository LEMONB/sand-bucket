import {expect,it,vi} from 'vitest';
vi.mock('pixi.js',()=>({Application:class {},Sprite:class {},Texture:{}}));
import {SandPainter} from '../src/renderer';
import {WIDTH,HEIGHT,PALETTE} from '../src/game';

it('renders all eight colors and clears collected grains in the reused buffer',()=>{
 const image={data:new Uint8ClampedArray(WIDTH*HEIGHT*4)} as ImageData;
 const context={createImageData:()=>image,putImageData:vi.fn()} as unknown as CanvasRenderingContext2D;
 const painter=new SandPainter(context),cells=new Uint8Array(WIDTH*HEIGHT);
 for(let i=0;i<cells.length;i++)cells[i]=i%8+1;
 painter.draw(cells);
 for(const i of [0,1,2,3,4,5,6,7,cells.length-1]){
   const color=parseInt(PALETTE[cells[i]].slice(1),16);
   for(const [channel,shift] of [16,8,0].entries())expect(Math.abs(image.data[i*4+channel]-((color>>shift)&255))).toBeLessThanOrEqual(8);
   expect(image.data[i*4+3]).toBe(255);
 }
 cells[7]=0;painter.draw(cells);
 expect(image.data[31]).toBe(0);expect(context.putImageData).toHaveBeenCalledTimes(2);
});
