import { afterEach, expect, it, vi } from 'vitest';
import { BeltView } from '../src/belt-view';
import { Game, HEIGHT, WIDTH, advanceFrame, type Speed } from '../src/game';

// Only the DOM operations used by the view; real geometry is checked in the browser.
class ElementStub {
  style: Record<string, string> = {};
  hidden = false;
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
  get firstElementChild(): ElementStub { return this.querySelector('first'); }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, bottom: 200, width: 300, height: 200 } as DOMRect; }
  getContext(): object { return { clearRect() {}, fillRect() {} }; }
}
afterEach(() => vi.unstubAllGlobals());

function fixture(speed: Speed, reduced: boolean) {
  const body = new ElementStub();
  vi.stubGlobal('document', { body, createElement: () => new ElementStub() });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const belt = new ElementStub(), field = new ElementStub(), sand = new ElementStub();
  field.children = Array.from({ length: 16 }, () => new ElementStub());
  const view = new BeltView(belt as unknown as HTMLElement, field as unknown as HTMLElement, sand as unknown as HTMLElement);
  const cells = new Uint8Array(WIDTH * HEIGHT);
  // Fill the arriving bucket in its first collection tick at either speed.
  const center = speed === 1 ? 6 : 12;
  cells[(HEIGHT - 1) * WIDTH + center] = 1;
  const buckets = Array(16).fill(null);buckets[0] = { id: 0, color: 1, capacity: 1 };
  const game = new Game({ cells, field: buckets });
  view.measure();game.launch(0);view.draw(game, 0, speed);
  return { body, belt, view, game };
}

it.each([1, 2] as const)('shows completion for a real .8 seconds when filling on arrival at speed %i', speed => {
  const { body, view, game } = fixture(speed, false);
  let remainder = 0;
  for (let frame = 0; frame < 3; frame++) {
    remainder = advanceFrame(game, .1, speed, remainder);view.draw(game, .1, speed);
  }
  expect(game.status).toBe('won');expect(game.slots[0]).toBeNull();
  const complete = body.children.find(e => e.classList.toggle.mock.calls.some(([name, on]) => name === 'completion' && on))!;
  expect(complete.hidden).toBe(false);expect(complete.innerHTML).toContain('100%');
  view.draw(game, .4, speed);
  expect(complete.hidden).toBe(false);expect(Number(complete.style.opacity)).toBeGreaterThan(.8);expect(view.busy).toBe(true);
  view.draw(game, .41, speed);expect(complete.hidden).toBe(true);expect(view.busy).toBe(false);
});

it('keeps completion visible with reduced motion and clears it on restart', () => {
  const { body, view, game } = fixture(2, true);
  advanceFrame(game, .1, 2, 0);advanceFrame(game, .1, 2, 0);advanceFrame(game, .1, 2, 0);
  view.draw(game, .3, 2);
  expect(body.children.some(e => !e.hidden && e.style.opacity === '1')).toBe(true);
  view.reset();expect(view.busy).toBe(false);
});
