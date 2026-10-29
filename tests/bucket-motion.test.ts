import { describe, expect, it } from 'vitest';
import { bucketPosition, landingMotion, trayPosition } from '../src/bucket-motion';

describe('bucket motion',()=>{
  const route=[{x:0,y:100},{x:0,y:0},{x:100,y:0}];
  it('keeps endpoints exact and rounds the corner inside the passage',()=>{
    expect(bucketPosition(route,0)).toEqual(route[0]);
    expect(bucketPosition(route,1)).toEqual(route[2]);
    const corner=bucketPosition(route,.5);
    expect(corner.x).toBeGreaterThan(0);expect(corner.y).toBeGreaterThan(0);
    for(let i=0;i<=100;i++){
      const p=bucketPosition(route,i/100);
      expect(Math.min(p.x,p.y)).toBeLessThanOrEqual(5);
      expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });
  it('settles exactly and clamps late frames',()=>{
    expect(landingMotion(0)).toBe(0);expect(landingMotion(1)).toBeCloseTo(0);expect(landingMotion(2)).toBeCloseTo(0);
    expect(bucketPosition(route,2)).toEqual(route[2]);
    expect(bucketPosition([{x:3,y:4}],.5)).toEqual({x:3,y:4});
  });
});

it('rotates clockwise on rectangular fields and arrives at the next cell center',()=>{
  const center={x:50,y:80};
  const corners=[{x:10,y:20},{x:90,y:20},{x:90,y:140},{x:10,y:140}];
  corners.forEach((from,i)=>{
    expect(trayPosition(from,center,0)).toEqual(from);
    const end=trayPosition(from,center,1),next=corners[(i+1)%4];
    expect(end.x).toBeCloseTo(next.x);expect(end.y).toBeCloseTo(next.y);
  });
});
