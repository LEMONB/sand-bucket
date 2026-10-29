import './style.css';
import { BELT_LIMIT, COLOR_NAMES, Game, PALETTE, accessibleCells, advanceFrame, type Speed } from './game';
import { createLevel } from './level';
import { GameRenderer, paintSand } from './renderer';

const STORAGE_KEY = 'sand-bucket.progress.v1';
let completed = false;
let storageAvailable = true;
try {
  completed = localStorage.getItem(STORAGE_KEY) === 'complete';
} catch {
  storageAvailable = false;
}

const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const bucketIcon = '<svg viewBox="0 0 64 68" aria-hidden="true"><path d="M17 25c0-24 30-24 30 0" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M8 25h48l-7 38H15z" fill="currentColor"/><ellipse cx="32" cy="25" rx="24" ry="6" fill="currentColor"/><ellipse cx="32" cy="25" rx="18" ry="3" fill="#203d3c" opacity=".2"/><path d="m20 37 3 16" stroke="#fff" opacity=".45" stroke-width="3" stroke-linecap="round"/></svg>';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <section id="menu" class="menu" aria-label="Главное меню">
    <header class="brand"><span class="brand-mark">${bucketIcon}</span><span>SAND BUCKET</span><span class="edition">01 / PLAY</span></header>
    <div class="intro"><span class="eyebrow">МАЛЕНЬКАЯ ПАУЗА</span><h1>Всё течёт.<br><span>Песок тоже.</span></h1><p>Немного цвета. Правильный момент.<br>И ничего лишнего.</p></div>
    <button id="level-card" class="level-card" aria-label="Выбрать уровень 1: Тихий берег" aria-pressed="true">
      <div class="preview-wrap"><canvas id="preview" width="128" height="112" aria-hidden="true"></canvas><span class="level-badge">01</span><span class="selected-badge">✓</span></div>
      <div class="level-description"><div><span class="eyebrow">УРОВЕНЬ 01</span><h2>Тихий берег</h2></div><span id="completed" class="level-state">${completed ? 'Пройден ✓' : 'Начнём здесь'}</span></div>
    </button>
    <button id="play" class="primary">Играть ${arrow}</button>
    <p class="menu-note">Без спешки. Без рекламы.</p>
    <p id="offline-note" class="offline-note" role="status"></p>
  </section>
  <section id="game" class="game" hidden aria-label="Уровень 1: Тихий берег">
    <header class="game-header"><button id="home" class="icon-button" aria-label="Вернуться в меню"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="game-title"><span class="eyebrow">УРОВЕНЬ 01</span><h2>Тихий берег</h2></div><button id="restart" class="icon-button" aria-label="Начать уровень заново"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8a8 8 0 1 1-1 7M5 3v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></header>
    <div class="progress-row"><strong id="percent" aria-label="Собрано песка">0%</strong><span class="slots" aria-label="Занято мест на ленте"><i></i><strong id="slots">0 / 5</strong></span></div>
    <progress id="progress" max="100" value="0" aria-label="Собрано песка"></progress>
    <div class="play-area"><div id="stage" class="stage"></div><div class="belt-tools"><button id="speed" class="speed-button" aria-label="Ускорить игру в два раза" aria-pressed="false">×1</button></div></div>
    <div id="field" class="bucket-field" role="group" aria-label="Поле вёдер, 4 ряда по 4"></div>
    <p id="hint" class="hint" role="status"></p>
    <div id="overlay" class="overlay" hidden><section class="result" role="dialog" aria-modal="true" aria-labelledby="result-title" aria-describedby="result-copy"><div id="result-icon" class="result-icon">✦</div><span id="result-eyebrow" class="eyebrow"></span><h2 id="result-title"></h2><p id="result-copy"></p><button id="result-action" class="primary"></button><button id="result-home" class="text-button">К уровням</button></section></div>
  </section>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const preview = element<HTMLCanvasElement>('preview');
paintSand(preview.getContext('2d')!, createLevel().cells);
const renderer = new GameRenderer();
let game = new Game(createLevel());
let speed: Speed = 1;
let initialized = false;
let loading = false;
let visible = false;
let paused = false;
let accumulator = 0;
let shownStatus = game.status;
let hintUntil = 0;

function buildField(): void {
  element('field').innerHTML = game.field.map((bucket, position) =>
    `<button class="field-bucket" data-position="${position}" style="--color:${PALETTE[bucket!.color]}"><span class="bucket-shape">${bucketIcon}</span></button>`,
  ).join('');
  element('field').querySelectorAll<HTMLButtonElement>('[data-position]').forEach((button) => {
    button.addEventListener('click', () => {
      if (paused || !visible) return;
      const bucket = game.field[Number(button.dataset.position)];
      if (!bucket) return;
      const result = game.launch(bucket.id);
      if (result === 'ok') {
        updateField();
        updateHud();
        element('hint').textContent = '';
      } else if (result === 'full') {
        setHint('Все пять слотов заняты. Подожди, пока ведро наполнится.');
      } else if (result === 'blocked') {
        setHint('Сначала освободи проход к ленте.');
      }
    });
  });
  updateField();
}

function updateField(): void {
  const accessible = accessibleCells(game.field);
  const focused = document.activeElement;
  const buttons = [...element('field').querySelectorAll<HTMLButtonElement>('[data-position]')];
  for (const button of buttons) {
    const position = Number(button.dataset.position);
    const bucket = game.field[position];
    const available = Boolean(bucket) && accessible.has(position);
    button.disabled = !available;
    button.classList.toggle('is-empty', !bucket);
    button.classList.toggle('is-blocked', Boolean(bucket) && !available);
    button.classList.toggle('is-available', available);
    button.setAttribute('aria-label', bucket
      ? `${COLOR_NAMES[bucket.color]} ведро. Ряд ${Math.floor(position / 4) + 1}, место ${position % 4 + 1}. ${available ? 'Есть проход. Отправить на ленту' : 'Перевёрнуто: проход закрыт'}`
      : `Пустое место, ряд ${Math.floor(position / 4) + 1}, место ${position % 4 + 1}`);
  }
  if (focused instanceof HTMLButtonElement && focused.disabled && buttons.includes(focused)) {
    buttons.find((button) => !button.disabled)?.focus({ preventScroll: true });
  }
}

function setSpeed(value: Speed): void {
  speed = value;
  const button = element<HTMLButtonElement>('speed');
  button.textContent = `×${speed}`;
  button.setAttribute('aria-pressed', String(speed === 2));
  button.setAttribute('aria-label', speed === 1 ? 'Ускорить игру в два раза' : 'Вернуть обычную скорость');
}

function setHint(message: string): void {
  element('hint').textContent = message;
  hintUntil = game.tick + 240;
}

function updateHud(): void {
  const percent = Math.floor(game.collected / game.total * 100);
  element('percent').textContent = `${percent}%`;
  element<HTMLProgressElement>('progress').value = percent;
  element('slots').textContent = `${game.buckets.length} / ${BELT_LIMIT}`;
  if (game.tick > hintUntil && game.tick > 240) {
    element('hint').textContent = '';
  }
}

function showDialog(kind: 'paused' | 'won' | 'lost'): void {
  const copy = {
    paused: ['НЕ СПЕШИМ', 'Небольшая пауза', 'Песок подождёт. Продолжим, когда будешь готов.', 'Продолжить'],
    won: ['УРОВЕНЬ ПРОЙДЕН', 'До последней песчинки.', 'Берег стал тише. Можно начать заново — просто ради процесса.', 'Сыграть ещё'],
    lost: ['ПОПРОБУЕМ ЕЩЁ', 'Цвета разминулись.', 'Вёдра не могут добраться до своего песка. Начни с нижних цветов и оставляй свободное место.', 'Попробовать снова'],
  }[kind];
  element('result-eyebrow').textContent = copy[0];
  element('result-title').textContent = copy[1];
  element('result-copy').textContent = copy[2];
  element('result-action').textContent = copy[3];
  element('result-icon').textContent = kind === 'won' ? '✦' : kind === 'paused' ? 'Ⅱ' : '↻';
  element('overlay').hidden = false;
  element('result-action').focus();
  element('result-action').onclick = () => {
    if (kind === 'paused') {
      paused = false;
      accumulator = 0;
      element('overlay').hidden = true;
      renderer.app.ticker.start();
      element('restart').focus();
    } else {
      reset();
    }
  };
}

function saveCompletion(): void {
  completed = true;
  element('completed').textContent = 'Пройден ✓';
  try {
    localStorage.setItem(STORAGE_KEY, 'complete');
  } catch {
    storageAvailable = false;
    element('offline-note').textContent = 'Браузер не разрешает сохранять прогресс.';
  }
}

function reset(): void {
  game = new Game(createLevel());
  setSpeed(1);
  shownStatus = 'playing';
  accumulator = 0;
  paused = false;
  hintUntil = 240;
  element('overlay').hidden = true;
  renderer.reset();
  renderer.draw(game);
  buildField();
  updateHud();
  element('hint').textContent = '';
  renderer.app.ticker.start();
}

async function start(): Promise<void> {
  if (loading) {
    return;
  }
  loading = true;
  const play = element<HTMLButtonElement>('play');
  play.disabled = true;
  play.textContent = 'Готовим песок…';
  try {
    if (!initialized) {
      await renderer.init(element('stage'));
      initialized = true;
      renderer.app.ticker.add((ticker) => {
        if (!visible || paused || document.hidden) {
          accumulator = 0;
          return;
        }
        accumulator = advanceFrame(game, ticker.deltaMS / 1000, speed, accumulator);
        renderer.draw(game);
        updateHud();
        if (shownStatus !== game.status) {
          shownStatus = game.status;
          if (game.status === 'won') {
            saveCompletion();
          }
          if (game.status !== 'playing') {
            showDialog(game.status);
            renderer.app.ticker.stop();
          }
        }
      });
      renderer.app.canvas.addEventListener('webglcontextlost', () => {
        renderer.app.ticker.stop();
        paused = true;
        showDialog('paused');
        element('result-title').textContent = 'Нужно обновить игру';
        element('result-copy').textContent = 'Браузер освободил память графики. Этот заход начнётся заново, отметка прохождения сохранится.';
        element('result-action').textContent = 'Обновить';
        element('result-action').onclick = () => location.reload();
      });
    }
    visible = true;
    element('menu').hidden = true;
    element('game').hidden = false;
    reset();
    element('home').focus();
  } catch (error) {
    element('offline-note').textContent = 'Не удалось запустить WebGL. Обнови страницу и проверь, включено ли аппаратное ускорение браузера.';
    console.error(error);
  } finally {
    loading = false;
    play.disabled = false;
    play.innerHTML = `Играть ${arrow}`;
  }
}

function home(): void {
  visible = false;
  paused = false;
  element('overlay').hidden = true;
  element('game').hidden = true;
  element('menu').hidden = false;
  if (initialized) {
    renderer.app.ticker.stop();
  }
  element('play').focus();
}

element('play').addEventListener('click', () => void start());
element('level-card').addEventListener('click', () => element('play').focus());
element('home').addEventListener('click', home);
element('result-home').addEventListener('click', home);
element('restart').addEventListener('click', reset);
element('speed').addEventListener('click', () => {
  if (visible && !paused && game.status === 'playing') setSpeed(speed === 1 ? 2 : 1);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && initialized && visible && game.status === 'playing') {
    paused = true;
    accumulator = 0;
    renderer.app.ticker.stop();
    showDialog('paused');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && !element('overlay').hidden) {
    const first = element('result-action');
    const last = element('result-home');
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === 'Escape' && visible && game.status === 'playing' && !paused) {
    paused = true;
    renderer.app.ticker.stop();
    showDialog('paused');
  }
});

if (!storageAvailable) {
  element('offline-note').textContent = 'Браузер не разрешает сохранять прогресс.';
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        if (storageAvailable) {
          element('offline-note').textContent = 'Можно играть без интернета';
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              element('offline-note').textContent = 'Есть обновление. Закрой все окна игры и открой её снова.';
            }
          });
        });
      }).catch(() => {
        element('offline-note').textContent = 'Офлайн-загрузка недоступна. Пока играй с интернетом.';
      });
  });
}
