import { afterEach, expect, it, vi } from 'vitest';
import { BeltView } from '../src/belt-view';
import { Game, HEIGHT, WIDTH, advanceFrame, type Speed } from '../src/game';

// Only the DOM operations used by the view; real geometry is checked in the browser.
class ElementStub {
  style = Object.assign({} as Record<string, string>, { setProperty: vi.fn() });
  hidden = false;
  width = 0;
  height = 0;
  innerHTML = '';
  textContent = '';
  className = '';
  children: ElementStub[] = [];
  selected = new Map<string, ElementStub>();
  classList = { toggle: vi.fn() };
  setAttribute(): void {}
  append(element: ElementStub): void { this.children.push(element); }
  querySelector(selector: string): ElementStub {
    if (!this.selected.has(selector)) this.selected.set(selector, new ElementStub());
    return this.selected.get(selector)!;
  }
  cloneNode(): ElementStub { const copy = new ElementStub();copy.innerHTML = this.innerHTML;return copy; }
  get firstElementChild(): ElementStub { return this.querySelector('first'); }
  getBoundingClientRect(): DOMRect { return { left: 0, right: 300, top: 0, bottom: 200, width: 300, height: 200 } as DOMRect; }
  getContext(): object { return { clearRect() {}, fillRect() {} }; }
}
afterEach(() => vi.unstubAllGlobals());

function fixture(speed: Speed, reduced: boolean, tick = 0) {
  const body = new ElementStub();
  vi.stubGlobal('document', { body, createElement: () => new ElementStub() });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const belt = new ElementStub(), field = new ElementStub(), sand = new ElementStub();
  belt.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 68, width: 300, height: 68 } as DOMRect);
  field.children = Array.from({ length: 16 }, () => new ElementStub());
  const view = new BeltView(belt as unknown as HTMLElement, field as unknown as HTMLElement, sand as unknown as HTMLElement);
  const cells = new Uint8Array(WIDTH * HEIGHT);
  // Fill the arriving bucket in its first collection tick at either speed.
  const center = speed === 1 ? 6 : 12;
  cells[tick ? 0 : (HEIGHT - 1) * WIDTH + center] = 1;
  const buckets = Array(16).fill(null);buckets[0] = { id: 0, color: 1, capacity: 1 };
  const game = new Game({ cells, field: buckets });
  game.tick = tick;view.measure();game.launch(0);view.draw(game, 0, speed);
  return { body, effects: { children: body.children[0].children.flatMap(e => e.children) }, clips: body.children[0].children, sand, belt, view, game };
}

it.each([1, 2] as const)('shows completion for a real .8 seconds when filling on arrival at speed %i', speed => {
  const { effects, view, game } = fixture(speed, false);
  let remainder = 0;
  for (let frame = 0; frame < 3; frame++) {
    remainder = advanceFrame(game, .1, speed, remainder);view.draw(game, .1, speed);
  }
  expect(game.status).toBe('won');expect(game.slots[0]).toBeNull();
  const complete = effects.children.find(e => e.classList.toggle.mock.calls.some(([name, on]) => name === 'completion' && on))!;
  expect(complete.hidden).toBe(false);expect(complete.innerHTML).toContain('100%');
  view.draw(game, .4, speed);
  expect(complete.hidden).toBe(false);expect(Number(complete.style.opacity)).toBeGreaterThan(.8);expect(view.busy).toBe(true);
  view.draw(game, .41, speed);expect(complete.hidden).toBe(true);expect(view.busy).toBe(false);
});

it('keeps completion visible with reduced motion and clears it on restart', () => {
  const { effects, view, game } = fixture(2, true);
  advanceFrame(game, .1, 2, 0);advanceFrame(game, .1, 2, 0);advanceFrame(game, .1, 2, 0);
  view.draw(game, .3, 2);
  expect(effects.children.some(e => !e.hidden && e.style.opacity === '1')).toBe(true);
  view.reset();expect(view.busy).toBe(false);
});


it.each([[1, 1], [2, 1], [1, .75], [2, .75]] as const)('keeps a launch continuous across the belt seam at speed %i and scale %f', (speed, scale) => {
  const { effects, belt, view, game } = fixture(speed, false, 350);
  const width = 300*scale;
  belt.getBoundingClientRect = () => ({ left: 0, right: width, top: 0, bottom: 68*scale, width, height: 68*scale } as DOMRect);
  view.measure();
  const flying = effects.children[0], wrap = effects.children[1];
  let remainder = 0, previous = 0, crossed = false;
  for (let frame = 0; frame < 18; frame++) {
    remainder = advanceFrame(game, 1/60, speed, remainder);view.draw(game, 1/60, speed);
    const x = Number(flying.style.transform.match(/translate\(([^,]+)/)![1].replace('px',''));
    if (frame > 0) expect(Math.abs(x-previous)).toBeLessThan(90);
    if (x > width && !flying.hidden) {
      crossed = true;
      const wrapped = Number(wrap.style.transform.match(/translate\(([^,]+)/)![1].replace('px',''));
      expect(wrapped).toBeCloseTo(x-width);expect(wrap.hidden).toBe(false);
    }
    previous = x;
  }
  expect(crossed).toBe(true);expect(flying.hidden).toBe(true);expect(wrap.hidden).toBe(true);
  expect(game.slots[0]?.filled).toBe(0);expect(belt.children[0].firstElementChild.hidden).toBe(false);
  expect(previous).toBeCloseTo(width+game.slotPosition(0)*width);
});


it('covers both sand and belt when the landscape layout places them side by side', () => {
  const { body, sand, belt, view } = fixture(1, false);
  sand.getBoundingClientRect = () => ({ left: 20, right: 220, top: 100, bottom: 300, width: 200, height: 200 } as DOMRect);
  belt.getBoundingClientRect = () => ({ left: 240, right: 600, top: 82, bottom: 150, width: 360, height: 68 } as DOMRect);
  view.measure();
  const stream = body.children.find(e => e.className === 'sand-stream')!;
  expect(stream.width).toBe(580);expect(stream.height).toBe(218);
  expect(stream.style.left).toBe('20px');expect(stream.style.top).toBe('82px');
});


it('keeps a launch from outside the narrow belt visible, then lands at the scaled size', () => {
  const { belt, view, game, effects, clips } = fixture(1, false, 100);
  belt.getBoundingClientRect = () => ({ left: 200, right: 425, top: 0, bottom: 51, width: 225, height: 51 } as DOMRect);
  view.measure();view.draw(game, 0);
  expect(clips[0].style.clipPath).toBe('none');expect(effects.children[1].hidden).toBe(true);
  expect(effects.children[0].style.transform).toContain('translate(150px,100px)');
  for (let tick = 0; tick < 36; tick++) game.step();
  view.draw(game, .3);
  expect(effects.children[0].style.width).toBe('36px');
  expect(effects.children[0].style.transform).toContain(',25.5px)');
  expect(clips[0].style.clipPath).toContain('425px');
  expect(belt.children[0].style.transform).toBe(`translateX(${game.slotPosition(0)*225-20.25}px)`);
});

it('resizes an active completion without restarting its animation', () => {
  const { belt, view, game, effects } = fixture(2, false);
  for (let tick = 0; tick < 36; tick++) game.step();
  view.draw(game, .3, 2);view.draw(game, .2, 2);
  const complete = effects.children.find(e => e.classList.toggle.mock.calls.some(([name, on]) => name === 'completion' && on))!;
  const opacity = complete.style.opacity;
  belt.getBoundingClientRect = () => ({ left: 30, right: 255, top: 10, bottom: 61, width: 225, height: 51 } as DOMRect);
  view.measure();view.draw(game, 0, 2);
  expect(complete.style.width).toBe('36px');expect(complete.style.opacity).toBe(opacity);
});
