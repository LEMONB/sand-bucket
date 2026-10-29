import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BELT_LIMIT, Game, HEIGHT, PALETTE, WIDTH, type Bucket } from './game';

export const VIEW_WIDTH = 384;
export const VIEW_HEIGHT = 396;
const BELT_LEFT = 32;
const BELT_WIDTH = 320;

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

// Both fragments are clipped to the belt: crossing an edge never adds a sixth slot.
export function slotRenderPositions(position: number): number[] {
  const x = BELT_LEFT + position * BELT_WIDTH;
  const positions = [x];
  if (x - 28 < BELT_LEFT) positions.push(x + BELT_WIDTH);
  if (x + 28 > BELT_LEFT + BELT_WIDTH) positions.push(x - BELT_WIDTH);
  return positions;
}

interface SlotView {
  container: Container;
  graphics: Graphics;
  label: Text;
}

export class GameRenderer {
  readonly app = new Application();
  private readonly sandCanvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private texture!: Texture;
  private revision = -1;
  private readonly streams = new Graphics();
  private readonly slots: SlotView[][] = [];
  private readonly previousFill = new Map<number, number>();

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
    for (let x = 40; x < 352; x += 16) {
      for (let y = 40; y < 312; y += 16) {
        frame.circle(x, y, 0.8).fill('#d6d1c5');
      }
    }
    const belt = new Graphics().roundRect(24, 319, 336, 68, 16).fill('#d8ded5');
    this.app.stage.addChild(frame, belt);
    this.texture = Texture.from(this.sandCanvas);
    this.texture.source.scaleMode = 'nearest';
    const sand = new Sprite(this.texture);
    sand.position.set(32, 32);
    sand.width = 320;
    sand.height = 280;
    this.app.stage.addChild(sand, this.streams);
    const slotLayer = new Container();
    const mask = new Graphics().rect(BELT_LEFT, 316, BELT_WIDTH, 76).fill('#ffffff');
    slotLayer.mask = mask;
    this.app.stage.addChild(slotLayer, mask);
    for (let slot = 0; slot < BELT_LIMIT; slot++) {
      const views: SlotView[] = [];
      for (let fragment = 0; fragment < 2; fragment++) {
        const container = new Container();
        const graphics = new Graphics();
        const label = new Text({ text: '', style: { fontFamily: 'Arial', fontWeight: '700', fontSize: 10, fill: '#456055' } });
        label.anchor.set(0.5);
        label.position.set(0, 6);
        container.addChild(graphics, label);
        slotLayer.addChild(container);
        views.push({ container, graphics, label });
      }
      this.slots.push(views);
    }
  }

  reset(): void {
    this.revision = -1;
    this.previousFill.clear();
  }

  draw(game: Game): void {
    if (game.revision !== this.revision) {
      paintSand(this.context, game.cells);
      this.texture.source.update();
      this.revision = game.revision;
    }
    this.streams.clear();
    for (let slot = 0; slot < BELT_LIMIT; slot++) {
      const bucket = game.slots[slot];
      const positions = slotRenderPositions(game.slotPosition(slot));
      this.slots[slot].forEach((view, index) => {
        view.container.visible = index < positions.length;
        if (view.container.visible) this.drawSlot(view, positions[index], bucket);
      });
      if (bucket && bucket.filled > (this.previousFill.get(bucket.id) ?? 0)) {
        for (let i = 0; i < 14; i++) {
          const x = Math.max(32, Math.min(351, positions[0] + ((i * 7 + game.tick) % 24) - 12));
          const y = 313 + ((i * 5 + game.tick * 3) % 22);
          this.streams.rect(x, y, 2, 2).fill(PALETTE[bucket.color]);
        }
      }
      if (bucket) this.previousFill.set(bucket.id, bucket.filled);
    }
  }

  private drawSlot(view: SlotView, x: number, bucket: Bucket | null): void {
    view.container.position.set(x, 352);
    const g = view.graphics.clear();
    g.roundRect(-27, -29, 54, 60, 13).fill('#b6c4b6');
    g.roundRect(-25, -26, 50, 55, 11).fill('#c7d2c3');
    g.moveTo(-15, 30).lineTo(15, 30).stroke({ color: '#edf0e5', width: 2 });
    view.label.visible = Boolean(bucket);
    if (!bucket) return;
    const amount = bucket.filled / bucket.capacity;
    g.ellipse(0, 22, 23, 5).fill({ color: '#203d3c', alpha: 0.12 });
    g.roundRect(-17, -27, 34, 26, 15).stroke({ color: PALETTE[bucket.color], width: 4 });
    g.poly([-24, -15, 24, -15, 18, 23, -18, 23]).fill(PALETTE[bucket.color]);
    g.roundRect(-16, -8, 32, 24, 5).fill({ color: '#fffaf1', alpha: 0.48 });
    if (amount > 0) g.roundRect(-16, 16 - amount * 24, 32, Math.max(2, amount * 24), 3).fill('#fff2c7');
    g.ellipse(0, -15, 24, 6).fill(PALETTE[bucket.color]);
    g.ellipse(0, -15, 19, 3).fill({ color: '#203d3c', alpha: 0.2 });
    view.label.alpha = 1;
    view.label.text = `${Math.floor(amount * 100)}%`;
  }
}
