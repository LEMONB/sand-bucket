import { expect,it } from 'vitest';
import { fitField } from '../src/game-layout';
import { Game, exitPaths, type Level } from '../src/game';

it('uses rectangular rows and routes to the top without crossing a row boundary',()=>{
  const cells=new Uint8Array(128*128);cells[cells.length-1]=1;
  const field:Level['field']=Array(18).fill(null);field[17]={id:0,color:1,capacity:1};
  const game=new Game({cells,field,columns:6});
  expect(game.rows).toBe(3);expect(game.paths.get(17)).toEqual([17,11,5]);
  const blocked=new Set([0,1,2,3,4,5,10,11]);
  expect(exitPaths(field,6,blocked).has(17)).toBe(false);
  expect(()=>new Game({cells,field:field.slice(1),columns:6})).toThrow('размер');
});
it.each([[351,248,9,6],[369,255,9,6],[351,153,9,6],[416,310,8,5]])('fits square cells and a proportional belt in %s×%s', (width,available,columns,rows)=>{
  const fit=fitField(width,available,columns,rows);
  expect(fit.cell).toBeGreaterThan(0);expect(fit.width).toBeLessThanOrEqual(width+.01);
  expect(fit.height+fit.beltHeight).toBeLessThanOrEqual(available+.01);
  expect(fit.beltHeight).toBeLessThanOrEqual(44);
  expect((fit.height-12-(rows-1)*2)/rows).toBeCloseTo((fit.width-12-(columns-1)*2)/columns);
});
it('gives small cells more room by reducing the belt instead of the sand',()=>{
  const fit=fitField(351,200,9,6),fixed=(200-44-12-10)/6;
  expect(fit.beltHeight).toBeLessThan(44);expect(fit.cell).toBeGreaterThan(fixed);
});
