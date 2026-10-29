import './style.css';
import './interface.css';
import { bucketIcon } from './bucket-icon';
import { createPreviewArtwork, PREVIEW_GRAIN } from './interface-artwork';
import { PALETTE, COLOR_NAMES } from './game';
import { demoField, exitPath, type DemoCell } from './interface-model';

const names = ['Простой', 'Средний', 'Сложный', 'Очень сложный'];
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `<nav class="demo-sizes" aria-label="Размер поля">${[4, 5, 6, 7].map(n => `<button data-size="${n}">${n}×${n}</button>`).join('')}</nav>
<section class="mock-game"><header class="mock-header"><button id="demo-reset" class="icon-button" aria-label="Повторить демонстрацию">↻</button><span class="mock-brand">SAND BUCKET</span><span id="difficulty"></span></header>
<div class="mock-status"><span id="demo-percent">0%</span><progress id="demo-progress" max="100" value="0" aria-label="Собрано песка"></progress><span id="demo-count">0 / 5</span><button id="demo-speed" aria-label="Ускорить в два раза" aria-pressed="false"><span>×1</span></button></div>
<div class="mock-sand"><canvas width="128" height="112" aria-label="Песочная картинка"></canvas></div>
<div class="mock-belt" aria-label="Конвейер, пять мест">${Array.from({length: 5}, (_, i) => `<div class="mock-slot" data-slot="${i}"><div class="slot-bucket"></div></div>`).join('')}</div>
<div class="mock-field" role="group" aria-label="Поле вёдер"></div><span class="sr-only" id="demo-status" role="status"></span></section>`;
const fieldElement = root.querySelector<HTMLDivElement>('.mock-field')!;
const slotElements = [...root.querySelectorAll<HTMLDivElement>('.mock-slot')];
const canvas = root.querySelector('canvas')!;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  const height = Math.round(entry.contentRect.height);
  if (width < 1 || height < 1 || (canvas.width === width && canvas.height === height)) return;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const cells = createPreviewArtwork(width, height);
  const columns = Math.ceil(width / PREVIEW_GRAIN);
  const colors = PALETTE.map(color => parseInt(color.slice(1), 16));
  for (let i = 0; i < cells.length; i++) {
    const color = colors[cells[i]];
    const noise = Math.imul(i ^ (i >>> 7), 0x45d9f3b);
    const shade = ((noise ^ (noise >>> 16)) >>> 0) % 17 - 8;
    context.fillStyle = `rgb(${(color >> 16) + shade}, ${((color >> 8) & 255) + shade}, ${(color & 255) + shade})`;
    context.fillRect((i % columns) * PREVIEW_GRAIN, Math.floor(i / columns) * PREVIEW_GRAIN, PREVIEW_GRAIN, PREVIEW_GRAIN);
  }
}).observe(canvas);
let size = 4;
let field: DemoCell[];
let speed = 1;
let phase = 0;
let collected = 0;
let lastTime = performance.now();
let flights: { element: HTMLElement; points: {x:number;y:number}[]; elapsed:number; slot:number; color:number }[] = [];
let slots: ({ color:number; elapsed:number; state:'flying'|'filling'|'done' } | null)[] = [];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function reset(n: number): void {
  size = n; field = demoField(size); slots = Array(5).fill(null); collected = 0; phase = 0; speed = 1;
  for (const flight of flights) flight.element.remove();
  flights = [];
  root.style.setProperty('--columns', String(size));
  root.querySelector('#difficulty')!.textContent = names[size - 4];
  root.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === size)));
  const speedButton = root.querySelector<HTMLButtonElement>('#demo-speed')!;
  speedButton.setAttribute('aria-pressed', 'false'); speedButton.firstElementChild!.textContent = '×1';
  fieldElement.innerHTML = field.map((cell, i) => cell === 'wall'
    ? `<div class="mock-wall" role="img" aria-label="Стена"></div>`
    : `<button class="field-bucket" data-cell="${i}" style="--color:${PALETTE[cell as number]}"><span class="bucket-shape">${bucketIcon}</span></button>`).join('');
  updateField(); updateHud();
}
function updateField(): void {
  fieldElement.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(button => {
    const i = Number(button.dataset.cell); const cell = field[i];
    const available = cell !== null && exitPath(field, size, i) !== null;
    button.disabled = !available;
    button.classList.toggle('is-empty', cell === null);
    button.classList.toggle('is-blocked', cell !== null && !available);
    button.classList.toggle('is-available', available);
    button.setAttribute('aria-label', cell === null ? 'Пустое место' : `${COLOR_NAMES[cell as number]} ведро, ряд ${Math.floor(i / size) + 1}, место ${i % size + 1}, ${available ? 'доступно' : 'проход закрыт'}`);
  });
}
function center(element: Element): {x:number;y:number} {
  const rect = element.getBoundingClientRect(); return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
}
function updateHud(): void {
  root.querySelector('#demo-count')!.textContent = `${slots.filter(Boolean).length} / 5`;
  const percent = Math.round(collected / field.filter(c => c !== 'wall').length * 100);
  root.querySelector('#demo-percent')!.textContent = `${percent}%`;
  root.querySelector<HTMLProgressElement>('#demo-progress')!.value = percent;
}
fieldElement.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-cell]');
  if (!button) return;
  const index = Number(button.dataset.cell), path = exitPath(field, size, index), slot = slots.indexOf(null);
  if (!path || slot < 0) { root.querySelector('#demo-status')!.textContent = 'Все места на ленте заняты'; return; }
  const color = field[index] as number;
  const points = path.map(i => center(fieldElement.children[i]));
  const belt = root.querySelector('.mock-belt')!.getBoundingClientRect();
  points.push({x:points[points.length - 1].x, y:belt.bottom + 4});
  const ghost = document.createElement('div'); ghost.className = 'flying-bucket'; ghost.style.color = PALETTE[color]; ghost.innerHTML = bucketIcon;
  const width = button.querySelector('.bucket-shape')!.getBoundingClientRect().width;
  ghost.style.width = `${width}px`; document.body.append(ghost);
  flights.push({element:ghost, points, elapsed:0, slot, color});
  slots[slot] = {color, elapsed:0, state:'flying'};
  field[index] = null; updateField(); updateHud();
});
root.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(button => button.addEventListener('click', () => reset(Number(button.dataset.size))));
root.querySelector('#demo-reset')!.addEventListener('click', () => reset(size));
root.querySelector('#demo-speed')!.addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  const button = root.querySelector('#demo-speed')!;
  button.setAttribute('aria-pressed', String(speed === 2)); button.firstElementChild!.textContent = `×${speed}`;
});
window.addEventListener('resize', () => reset(size));

function draw(now: number): void {
  const dt = document.hidden ? 0 : Math.min((now - lastTime) / 1000, .05) * speed; lastTime = now;
  phase = (phase + dt / 6) % 1;
  const beltWidth = root.querySelector('.mock-belt')!.clientWidth;
  slotElements.forEach((element, i) => {
    const x = ((phase + i / 5) % 1) * beltWidth;
    element.style.left = `${x}px`;
    const bucket = slots[i], visual = element.firstElementChild as HTMLElement;
    if (!bucket || bucket.state === 'flying') { visual.innerHTML = ''; return; }
    if (!visual.firstChild) visual.innerHTML = `${bucketIcon}<i class="mock-fill"></i>`;
    visual.style.color = PALETTE[bucket.color]; bucket.elapsed += dt;
    visual.style.setProperty('--fill', String(bucket.state === 'done' ? 1 : Math.min(bucket.elapsed / 1.3, 1)));
    visual.classList.toggle('is-complete', bucket.state === 'done');
    if (bucket.state === 'filling' && bucket.elapsed >= 1.3) { bucket.state = 'done'; bucket.elapsed = 0; }
    else if (bucket.state === 'done' && bucket.elapsed >= .28) { slots[i] = null; visual.innerHTML = ''; visual.classList.remove('is-complete'); collected++; updateHud(); }
  });
  flights = flights.filter(flight => {
    flight.elapsed += dt;
    const t = Math.min(flight.elapsed / .3, 1);
    const points = [...flight.points, center(slotElements[flight.slot])];
    const segment = t * (points.length - 1), i = Math.min(Math.floor(segment), points.length - 2), f = segment - i;
    const x = points[i].x + (points[i + 1].x - points[i].x) * f, y = points[i].y + (points[i + 1].y - points[i].y) * f;
    flight.element.style.left = `${x}px`; flight.element.style.top = `${y}px`; flight.element.style.opacity = reduced.matches ? '0' : '1';
    if (t < 1) return true;
    flight.element.remove(); slots[flight.slot]!.state = 'filling'; return false;
  });
  requestAnimationFrame(draw);
}
const requestedSize = Number(new URLSearchParams(location.search).get('size'));
reset([4, 5, 6, 7].includes(requestedSize) ? requestedSize : 4);
requestAnimationFrame(draw);
