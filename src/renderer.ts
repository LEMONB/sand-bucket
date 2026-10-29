import { Application, Sprite, Texture } from 'pixi.js';
import { Game, HEIGHT, PALETTE, WIDTH } from './game';

// One image buffer and precomputed grain colors, reused across every frame/level.
export class SandPainter {
  private readonly image: ImageData;
  private readonly shades = new Uint8ClampedArray(WIDTH * HEIGHT * 4 * 3);
  constructor(private context: CanvasRenderingContext2D) {
    this.image = context.createImageData(WIDTH, HEIGHT);
    const colors = PALETTE.map(color => parseInt(color.slice(1), 16));
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      const noise = Math.imul(i ^ (i >>> 7), 0x45d9f3b);
      const shade = ((noise ^ (noise >>> 16)) >>> 0) % 17 - 8;
      for (let c = 1; c <= 4; c++) {
        const offset = (i * 4 + c - 1) * 3, color = colors[c];
        this.shades[offset] = (color >> 16) + shade;
        this.shades[offset + 1] = ((color >> 8) & 255) + shade;
        this.shades[offset + 2] = (color & 255) + shade;
      }
    }
  }
  draw(cells: Uint8Array): void {
    const pixels = this.image.data;
    for (let i = 0; i < cells.length; i++) {
      const offset = (i * 4 + cells[i] - 1) * 3, p = i * 4;
      if (!cells[i]) { pixels[p + 3] = 0; continue; }
      pixels[p] = this.shades[offset]; pixels[p + 1] = this.shades[offset + 1]; pixels[p + 2] = this.shades[offset + 2]; pixels[p + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
  }
}
export function paintSand(context: CanvasRenderingContext2D, cells: Uint8Array): void { new SandPainter(context).draw(cells); }
export class GameRenderer {
  readonly app = new Application();
  private readonly canvas = document.createElement('canvas');
  private readonly painter: SandPainter;
  private texture!: Texture;
  private revision = -1;
  constructor() {
    this.canvas.width = WIDTH; this.canvas.height = HEIGHT;
    this.painter = new SandPainter(this.canvas.getContext('2d')!);
  }
  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ width: WIDTH, height: HEIGHT, preference: 'webgl', backgroundAlpha: 0, resolution: 1, antialias: false });
    host.append(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.texture = Texture.from(this.canvas); this.texture.source.scaleMode = 'nearest';
    this.app.stage.addChild(new Sprite(this.texture));
  }
  reset(): void { this.revision = -1; }
  draw(game: Game): void {
    if (game.revision === this.revision) return;
    this.painter.draw(game.cells); this.texture.source.update(); this.revision = game.revision;
  }
}
