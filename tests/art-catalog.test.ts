import { expect,it } from 'vitest';
import { ART_TITLES, artworkIndex, artworkPalette, catalogArtwork } from '../src/art-catalog';

it('provides 100 distinct square compositions, not palette swaps',()=>{
  const signatures=new Set<string>();
  for(let i=0;i<100;i++){
    const cells=catalogArtwork(i);
    expect(cells.length).toBe(128*128);expect([...new Set(cells)].sort()).toEqual([1,2,3,4,5,6,7,8]);
    signatures.add(cells.join(''));expect(artworkPalette(i)).toHaveLength(9);
  }
  expect(signatures.size).toBe(100);expect(new Set(ART_TITLES).size).toBe(100);
  expect(Array.from({length:100},(_,i)=>artworkIndex(i+1))).toEqual(Array.from({length:100},(_,i)=>i));
  expect(artworkIndex(100)).not.toBe(artworkIndex(101));
});
