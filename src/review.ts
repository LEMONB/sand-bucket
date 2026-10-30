import './review.css';
import { SCENES, SCENE_PALETTES, createScene } from './art-scenes';
import { bucketIcon } from './bucket-icon';
import { alternatingColor, linkedDeparture } from './review-rules';

const colors = ['#58aaa8', '#e77d62', '#e4bd68', '#a596bb'];
const names = ['Очередь', 'Ключ и замок', 'Платформа', 'Поднос 2×2', 'Разборный мост', 'Связанные ведра', 'Песок под крышкой', 'Переключатель'];
const descriptions = [
  'До пяти ведер в одной ячейке. Ближайшие цвета видны заранее.',
  'Заполнение ведра с ключом открывает отмеченный проход.',
  'Отправь весь верхний слой — поднимется следующий.',
  'Любая отправка поворачивает поднос на 90° по часовой стрелке.',
  'После отправки последнего ведра мост убирается и открывает проход.',
  'Два свободных места — уходит пара. Одно — только нажатое ведро, цепь разрывается.',
  'Заполнение отмеченного ведра освобождает песок под прозрачной крышкой.',
  'После каждой успешной отправки цвет меняется: мятный ↔ коралловый. На ленте цвет фиксируется.',
];
const root = document.querySelector<HTMLElement>('#review')!;
root.innerHTML = `<header><span>SAND BUCKET / МАСТЕРСКАЯ</span><h1>Картины, которые<br>хочется разобрать.</h1><p>Три образца для будущей коллекции из 100 разных композиций.</p></header>
<section class="gallery" aria-label="Образцы картин">${SCENES.map((name, i) => `<article><canvas width="128" height="128" data-scene="${i}" role="img" aria-label="${name}"></canvas><div class="caption"><h2>${name}</h2><span>0${i + 1} / 100</span></div></article>`).join('')}</section>
<section class="mechanics"><div class="intro"><span>ВОСЕМЬ МЕХАНИК</span><h2>У каждого хода<br>есть продолжение.</h2><p>Выбери механику и нажми кнопку под полем. Это демонстрация внешнего вида и переходов, без игровой физики.</p><nav aria-label="Механики">${names.map((name, i) => `<button data-mechanic="${i}" aria-pressed="false">${name}</button>`).join('')}</nav></div>
<div class="phone"><div class="phone-header"><span>SAND BUCKET</span><button id="reset" aria-label="Сбросить демонстрацию">↻</button></div><div class="sand"><canvas width="128" height="128" data-scene="0" role="img" aria-label="Маяк"></canvas><div class="lid" hidden><span>◇</span></div></div><div class="belt">${Array.from({length:5}, () => '<i></i>').join('')}</div><div class="field"></div><p id="description"></p><button id="advance"></button><p id="status" role="status"></p></div></section>`;
root.querySelectorAll<HTMLCanvasElement>('canvas').forEach(canvas => {
  const scene = Number(canvas.dataset.scene), cells = createScene(scene);
  const context = canvas.getContext('2d')!;
  cells.forEach((color, i) => {
    context.fillStyle = SCENE_PALETTES[scene][color - 1];
    context.fillRect(i % 128, Math.floor(i / 128), 1, 1);
  });
});
let mechanic = 0, step = 0;
let pairSlots = 2, pairRemaining = [0, 1], pairSent: number[] = [];
let colorSent: number | null = null;
const field = root.querySelector<HTMLElement>('.field')!;
const controls = document.createElement('div');
controls.className = 'demo-controls';
field.after(controls);
const labels = ['Отправить ведро', 'Заполнить ведро с ключом', 'Отправить ведро со слоя', 'Отправить ведро вне подноса', 'Отправить ведро с моста', 'Отправить связанную пару', 'Заполнить ведро ◇', 'Заполнить переключатель'];
const limits = [5, 1, 4, 4, 3, 1, 1, 1];
function bucket(color: number, badge = ''): string {
  return `<div class="bucket" style="color:${colors[color % 4]}">${bucketIcon}${badge ? `<b>${badge}</b>` : ''}</div>`;
}
function render(): void {
  controls.innerHTML = '';
  root.querySelectorAll<HTMLButtonElement>('[data-mechanic]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mechanic) === mechanic)));
  root.querySelector('#description')!.textContent = descriptions[mechanic];
  root.querySelector('#advance')!.textContent = step >= limits[mechanic] ? 'Ещё раз' : labels[mechanic];
  root.querySelector('#status')!.textContent = `Действий: ${step}`;
  const lid = root.querySelector<HTMLElement>('.lid')!;
  lid.hidden = mechanic !== 6 || step > 0;
  field.className = `field mechanic-${mechanic}`;
  field.innerHTML = Array.from({length:16}, (_, i) => `<div class="cell">${i < 4 ? '' : bucket(i + 1)}</div>`).join('');
  const set = (i: number, html: string, className = '') => { field.children[i].innerHTML = html; field.children[i].className = `cell ${className}`; };
  const surface = (className: string, contents: string) => {
    const element = document.createElement('div');
    element.className = className;
    element.innerHTML = contents;
    field.append(element);
  };
  if (mechanic === 0) {
    set(5, step < 5 ? `${bucket(step)}<span class="queue">${Array.from({length:4-step}, (_, i) => `<i style="background:${colors[(i+step+1)%4]}"></i>`).join('')}</span><small>${5-step}/5</small>` : '', 'queue-cell');
  } else if (mechanic === 1) {
    set(4, step ? '' : bucket(2, '⚿')); set(2, step ? '<span>Открыто</span>' : '⚿', step ? 'passage' : 'gate');
  } else if (mechanic === 2) {
    [5,6,9,10].forEach(i => set(i, ''));
    surface('tray platform-tray', [0,1,2,3].map(j => `<div>${step === 4 ? bucket(j+2) : j < step ? '' : bucket(j)}</div>`).join(''));
    root.querySelector('#status')!.textContent = step === 4 ? 'Поднялся второй слой' : `Слой 1 · под ним: мятный, коралловый, золотой, лиловый`;
  } else if (mechanic === 3) {
    const tray = document.createElement('div'); tray.className = 'tray';
    tray.innerHTML = [0,1,3,2].map(i => bucket(i)).join('');
    tray.style.transform = `rotate(${step*90}deg)`;
    tray.querySelectorAll<HTMLElement>('.bucket').forEach(el => el.style.transform = `rotate(${-step*90}deg)`);
    [5,6,9,10].forEach(i => set(i, ''));
    field.append(tray);
    [4,7,12,15].slice(0,step).forEach(i => set(i,''));
    root.querySelector('#status')!.textContent = `↻ ${step*90}° · поворот после отправки`;
  } else if (mechanic === 4) {
    [4,5,6].forEach(i => set(i, step === 3 ? '↓' : '', step === 3 ? 'passage' : ''));
    if (step < 3) surface('bridge-deck', [0,1,2].map(j => `<div>${j < step ? '' : bucket(j)}</div>`).join(''));
    root.querySelector('#status')!.textContent = step === 3 ? 'Нижний проход открыт' : `На мосту осталось: ${3-step}`;
  } else if (mechanic === 5) {
    [0,1].forEach(id => set(4 + id, pairRemaining.includes(id) ? `<button class="pick-bucket" data-pair="${id}" aria-label="Отправить ${id === 0 ? 'мятное' : 'коралловое'} ведро">${bucket(id)}</button>` : ''));
    if (pairRemaining.length === 2) surface('bucket-chain', '<svg viewBox="0 0 100 20" aria-label="Цепь между ведрами" role="img"><path d="M2 10h10m76 0h10"/><rect x="10" y="5" width="25" height="10" rx="5"/><rect x="30" y="5" width="25" height="10" rx="5"/><rect x="50" y="5" width="25" height="10" rx="5"/><rect x="70" y="5" width="20" height="10" rx="5"/></svg>');
    controls.innerHTML = `<span>Свободно перед отправкой:</span>${[1,2].map(n => `<button data-slots="${n}" aria-pressed="${pairSlots === n}">${n} ${n === 1 ? 'место' : 'места'}</button>`).join('')}`;
    root.querySelector('#advance')!.textContent = pairRemaining.length === 2 ? 'Отправить мятное ведро' : pairRemaining.length ? 'Освободить слот и отправить оставшееся' : 'Ещё раз';
    root.querySelector('#status')!.textContent = pairRemaining.length === 1 ? 'Цепь разорвана · второе ведро осталось на поле' : pairRemaining.length === 0 ? 'Оба ведра на ленте' : 'Нажми любое ведро пары';
  } else if (mechanic === 6) {
    set(4, step ? '' : bucket(2, '◇'));
  } else {
    set(4, colorSent === null ? `${bucket(alternatingColor(step), '⇄')}<span class="next-color" style="background:${colors[alternatingColor(step+1)]}" aria-label="Следующий цвет"></span>` : '');
    set(5, `${bucket(colorSent===null?alternatingColor(step+1):1-colorSent, colorSent===null?'⇄':'')}`);
    if (colorSent === null) controls.innerHTML = '<button data-send-color>Отправить текущее ведро</button>';
    root.querySelector('#advance')!.textContent = colorSent === null ? 'Отправить другое ведро → сменить цвет' : 'Ещё раз';
    root.querySelector('#status')!.textContent = colorSent === null ? `Ход ${step} · сейчас ${alternatingColor(step) === 0 ? 'мятный' : 'коралловый'}, маленькая метка — следующий` : 'Одно ведро на ленте · оба цвета зафиксированы';
  }
  root.querySelectorAll<HTMLElement>('.belt i').forEach((slot,i) => {
    slot.innerHTML = step && i < (mechanic === 5 ? 2 : 1) && [0,2,3,4,5].includes(mechanic) ? bucket(i + step - 1) : '';
    if (mechanic === 5) {
      const occupied = 5 - pairSlots;
      slot.innerHTML = i < occupied ? bucket(2 + i % 2) : pairSent[i - occupied] !== undefined ? bucket(pairSent[i - occupied]) : '';
    }
    if (mechanic === 7) slot.innerHTML = i === 0 && colorSent !== null ? bucket(colorSent) : '';
  });
}
function reset(): void { step = 0; pairRemaining = [0,1]; pairSent = []; colorSent = null; render(); }
function sendPair(id: number): void {
  const sent = linkedDeparture(pairRemaining, id, pairSlots - pairSent.length);
  pairSent.push(...sent);
  pairRemaining = pairRemaining.filter(item => !sent.includes(item));
  render();
}
field.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-pair]');
  if (button) sendPair(Number(button.dataset.pair));
});
controls.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button');
  if (button?.dataset.slots) { pairSlots = Number(button.dataset.slots); reset(); }
  else if (button?.hasAttribute('data-send-color')) { colorSent = alternatingColor(step); render(); }
});
root.querySelectorAll<HTMLButtonElement>('[data-mechanic]').forEach(button => button.addEventListener('click', () => { mechanic = Number(button.dataset.mechanic); reset(); }));
root.querySelector('#advance')!.addEventListener('click', () => {
  if (mechanic === 5) {
    if (!pairRemaining.length) { reset(); return; }
    if (pairSlots === pairSent.length) pairSlots++;
    sendPair(pairRemaining[0]);
    return;
  }
  if (mechanic === 7) { if (colorSent !== null) reset(); else { step++; render(); } return; }
  step = step >= limits[mechanic] ? 0 : step + 1; render();
});
root.querySelector('#reset')!.addEventListener('click', reset);
render();
