import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BELT_LENGTH, Game, HEIGHT, PALETTE, TOP_LENGTH, WIDTH, type Bucket } from './game';

export const VIEW_WIDTH = 384;
export const VIEW_HEIGHT = 464;

export function paintSand(context: CanvasRenderingContext2D, cells: Uint8Array): void {
  const image = context.createImageData(WIDTH, HEIGHT);
  const colors = PALETTE.map((color) => parseInt(color.slice(1), 16));
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) {
      continue;
    }
    const color = colors[cells[i]];
    const noise = Math.imul(i ^ (i >>> 7), 0x45d9f3b);
    const shade = ((noise ^ (noise >>> 16)) >>> 0) % 17 - 8;
    image.data[i * 4] = Math.max(0, Math.min(255, (color >> 16) + shade));
    image.data[i * 4 + 1] = Math.max(0, Math.min(255, ((color >> 8) & 255) + shade));
    image.data[i * 4 + 2] = Math.max(0, Math.min(255, (color & 255) + shade));
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function beltPoint(distance: number): { x: number; y: number } {
  const d = distance % BELT_LENGTH;
  if (d <= TOP_LENGTH) {
    return { x: 32 + d, y: 352 };
  }
  if (d <= 394) {
    return { x: 352, y: 352 + d - TOP_LENGTH };
  }
  if (d <= 714) {
    return { x: 352 - (d - 394), y: 426 };
  }
  return { x: 32, y: 426 - (d - 714) };
}

interface BucketView {
  container: Container;
  graphics: Graphics;
  label: Text;
  filled: number;
}

export class GameRenderer {
  readonly app = new Application();
  private readonly sandCanvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private texture!: Texture;
  private revision = -1;
  private readonly beltMarks = new Graphics();
  private readonly streams = new Graphics();
  private readonly bucketViews = new Map<number, BucketView>();

  constructor() {
    this.sandCanvas.width = WIDTH;
    this.sandCanvas.height = HEIGHT;
    this.context = this.sandCanvas.getContext('2d')!;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      preference: 'webgl',
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
    });
    host.append(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden', 'true');
    const frame = new Graphics()
      .roundRect(24, 24, 336, 296, 15).fill('#dfdcd2')
      .roundRect(28, 26, 328, 290, 12).fill('#fcfaf5')
      .roundRect(32, 32, 320, 280, 5).fill('#ebe6db');
    // Subtle grid remains visible as the sand is collected.
    for (let x = 40; x < 352; x += 16) {
      for (let y = 40; y < 312; y += 16) {
        frame.circle(x, y, 0.8).fill('#d6d1c5');
      }
    }
    const belt = new Graphics()
      .roundRect(10, 330, 364, 118, 26).fill('#d8ded5')
      .roundRect(53, 373, 278, 32, 14).fill('#f5f1e9');
    this.app.stage.addChild(frame, belt, this.beltMarks);
    this.texture = Texture.from(this.sandCanvas);
    this.texture.source.scaleMode = 'nearest';
    const sand = new Sprite(this.texture);
    sand.position.set(32, 32);
    sand.width = 320;
    sand.height = 280;
    this.app.stage.addChild(sand, this.streams);
    const direction = new Text({ text: '→     →     →', style: { fontFamily: 'Arial', fontSize: 15, fill: '#87978c', letterSpacing: 5 } });
    direction.anchor.set(0.5);
    direction.position.set(192, 389);
    this.app.stage.addChild(direction);
  }

  reset(): void {
    this.revision = -1;
    for (const view of this.bucketViews.values()) {
      view.container.destroy({ children: true });
    }
    this.bucketViews.clear();
  }

  draw(game: Game): void {
    if (game.revision !== this.revision) {
      paintSand(this.context, game.cells);
      this.texture.source.update();
      this.revision = game.revision;
    }
    this.beltMarks.clear();
    for (let d = 0; d < BELT_LENGTH; d += 27) {
      const point = beltPoint(d + game.tick * BELT_LENGTH / 720);
      this.beltMarks.circle(point.x, point.y, 1.8).fill('#b4c0b4');
    }
    this.streams.clear();
    const live = new Set(game.buckets.map((bucket) => bucket.id));
    for (const [id, view] of this.bucketViews) {
      if (!live.has(id)) {
        view.container.destroy({ children: true });
        this.bucketViews.delete(id);
      }
    }
    for (const bucket of game.buckets) {
      this.drawBucket(bucket, game.tick);
    }
  }

  private drawBucket(bucket: Bucket, tick: number): void {
    let view = this.bucketViews.get(bucket.id);
    if (!view) {
      const container = new Container();
      const graphics = new Graphics();
      const label = new Text({ text: '', style: { fontFamily: 'Arial', fontWeight: '700', fontSize: 10, fill: '#203d3c' } });
      label.anchor.set(0.5);
      label.position.set(0, 6);
      container.addChild(graphics, label);
      this.app.stage.addChild(container);
      view = { container, graphics, label, filled: 0 };
      this.bucketViews.set(bucket.id, view);
    }
    const point = beltPoint(bucket.distance);
    const amount = bucket.filled / bucket.capacity;
    view.container.position.set(point.x, point.y);
    const g = view.graphics.clear();
    g.ellipse(0, 22, 23, 5).fill({ color: '#203d3c', alpha: 0.12 });
    g.roundRect(-17, -27, 34, 26, 15).stroke({ color: PALETTE[bucket.color], width: 4 });
    g.poly([-24, -15, 24, -15, 18, 23, -18, 23]).fill(PALETTE[bucket.color]);
    g.roundRect(-16, -8, 32, 24, 5).fill({ color: '#fffaf1', alpha: 0.48 });
    if (amount > 0) {
      g.roundRect(-16, 16 - amount * 24, 32, Math.max(2, amount * 24), 3).fill('#fff2c7');
    }
    g.ellipse(0, -15, 24, 6).fill(PALETTE[bucket.color]);
    g.ellipse(0, -15, 19, 3).fill({ color: '#203d3c', alpha: 0.2 });
    view.label.text = `${Math.floor(amount * 100)}%`;
    if (bucket.filled > view.filled && bucket.distance <= TOP_LENGTH) {
      for (let i = 0; i < 14; i++) {
        const x = Math.max(32, Math.min(351, point.x + ((i * 7 + tick) % 24) - 12));
        const y = 313 + ((i * 5 + tick * 3) % 22);
        this.streams.rect(x, y, 2, 2).fill(PALETTE[bucket.color]);
      }
    }
    view.filled = bucket.filled;
  }
}
