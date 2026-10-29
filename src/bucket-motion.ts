type Point = { x: number; y: number };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t });

// Round only near route corners so buckets stay inside their available passage.
export function bucketPosition(points: Point[], progress: number): Point {
  if(points.length===1)return points[0];
  const t=Math.max(0,Math.min(1,progress));
  const distance=(t*t*(3-2*t))*(points.length-1);
  const corner=Math.round(distance),radius=.18;
  if(corner>0&&corner<points.length-1&&Math.abs(distance-corner)<radius){
    const start=mix(points[corner],points[corner-1],radius);
    const end=mix(points[corner],points[corner+1],radius);
    const f=(distance-corner+radius)/(radius*2);
    return mix(mix(start,points[corner],f),mix(points[corner],end,f),f);
  }
  const i=Math.min(Math.floor(distance),points.length-2);
  return mix(points[i],points[i+1],distance-i);
}

export function landingMotion(progress: number): number {
  const t=Math.max(0,Math.min(1,progress));
  return Math.sin(t*Math.PI*2)*Math.pow(1-t,2);
}

export function trayPosition(from:Point,center:Point,progress:number):Point {
  const angle=Math.max(0,Math.min(1,progress))*Math.PI/2;
  const rx=Math.abs(from.x-center.x),ry=Math.abs(from.y-center.y);
  const x=Math.sign(from.x-center.x),y=Math.sign(from.y-center.y);
  return {x:center.x+(x*Math.cos(angle)-y*Math.sin(angle))*rx,y:center.y+(x*Math.sin(angle)+y*Math.cos(angle))*ry};
}
