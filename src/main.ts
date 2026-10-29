import './style.css';
import './interface.css';
import { bucketIcon } from './bucket-icon';
import { Game, PALETTE, COLOR_NAMES, advanceFrame, type Speed } from './game';
import { asLevel, DIFFICULTIES, difficulty, type GeneratedLevel } from './generator';
import { fallbackLevel } from './level';
import { GameRenderer, paintSand } from './renderer';
import { BeltView } from './belt-view';
import { ProgressStore } from './progress';
import { LevelLoader } from './level-loader';

let storage: Pick<Storage,'getItem'|'setItem'>;
try { storage=localStorage; } catch { storage={getItem(){throw Error();},setItem(){throw Error();}}; }
const progress=new ProgressStore(storage),loader=new LevelLoader(progress);
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<section id="menu" class="menu" aria-label="Главное меню">
<header class="brand"><span class="brand-mark">${bucketIcon}</span><span>SAND BUCKET</span></header>
<div class="intro"><span class="eyebrow">МАЛЕНЬКАЯ ПАУЗА</span><h1>Всё течёт.<br><span>Песок тоже.</span></h1><p>Новый узор. Знакомое спокойствие.</p></div>
<div class="level-card"><div class="preview-wrap"><canvas id="preview" width="128" height="128" aria-hidden="true"></canvas><span id="menu-number" class="level-badge"></span></div><div class="level-description"><h2 id="menu-title"></h2><span id="menu-difficulty" class="level-state"></span></div></div>
<button id="play" class="primary">Играть →</button><p class="menu-note">Без спешки. Без рекламы.</p><p id="offline-note" class="offline-note" role="status"></p></section>
<section id="game" class="mock-game" hidden aria-label="Игра">
<header class="mock-header"><button id="restart" class="icon-button" aria-label="Начать уровень заново">↻</button><button id="home" class="icon-button" aria-label="Вернуться в меню">‹</button><span id="level-number" class="mock-brand"></span><span id="difficulty"></span></header>
<div class="mock-status"><span id="percent">0%</span><progress id="progress" max="100" value="0" aria-label="Собрано песка"></progress><span id="count">0 / 5</span><button id="demo-speed" aria-label="Ускорить в два раза" aria-pressed="false"><span>×1</span></button></div>
<div id="sand" class="mock-sand" role="img" aria-label="Поле песка"></div><div id="belt" class="mock-belt" aria-label="Конвейер, пять мест"></div><div id="field" class="mock-field" role="group" aria-label="Поле вёдер"></div><span id="hint" class="sr-only" role="status"></span>
</section><div id="overlay" class="overlay" hidden><section class="result" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-icon">✦</div><h2 id="result-title"></h2><p id="result-copy"></p><button id="result-action" class="primary"></button><button id="result-home" class="text-button">В меню</button></section></div>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const sand=new GameRenderer(),belt=new BeltView(el('belt'),el('field'));
let record:GeneratedLevel=progress.data.current??fallbackLevel(progress.data.number);
let game=new Game(asLevel(record));
let initialized=false,loading=false,visible=false,paused=false,finished=false,wonSaved=false;
let accumulator=0, speed:Speed=progress.data.speed, lastPercent=-1,lastCount=-1;
let buttons:HTMLButtonElement[]=[];
function storageNote():void {if(!progress.available)el('offline-note').textContent='Браузер не разрешает сохранять прогресс.';}
function menu():void {
  el('menu-number').textContent=String(progress.data.number);
  el('menu-title').textContent=`Уровень ${progress.data.number}`;
  el('menu-difficulty').textContent=DIFFICULTIES[difficulty(progress.data.number)];
  paintSand(el<HTMLCanvasElement>('preview').getContext('2d')!,asLevel(progress.data.current??fallbackLevel(progress.data.number)).cells);
  storageNote();
}
function setSpeed(value:Speed):void {
  speed=value;progress.setSpeed(value);
  const button=el('demo-speed');button.firstElementChild!.textContent=`×${value}`;button.setAttribute('aria-pressed',String(value===2));
  button.setAttribute('aria-label',value===1?'Ускорить в два раза':'Вернуть обычную скорость');storageNote();
}
function updateField():void {
  for(const button of buttons){
    const position=Number(button.dataset.position),bucket=game.field[position],available=Boolean(bucket)&&game.paths.has(position);
    button.disabled=!available;
    button.classList.toggle('is-empty',!bucket);button.classList.toggle('is-blocked',Boolean(bucket)&&!available);button.classList.toggle('is-available',available);
    button.setAttribute('aria-label',bucket?`${COLOR_NAMES[bucket.color]} ведро, ряд ${Math.floor(position/game.columns)+1}, место ${position%game.columns+1}, ${available?'доступно':'проход закрыт'}`:'Пустое место');
  }
  const focused=document.activeElement;
  if(focused instanceof HTMLButtonElement&&focused.disabled&&buttons.includes(focused))buttons.find(b=>!b.disabled)?.focus({preventScroll:true});
}
function buildField():void {
  el('field').innerHTML=game.field.map((bucket,i)=>game.walls.has(i)?'<div class="mock-wall" role="img" aria-label="Стена"></div>':`<button class="field-bucket" data-position="${i}" style="--color:${PALETTE[bucket!.color]}"><span class="bucket-shape">${bucketIcon}</span></button>`).join('');
  buttons=[...el('field').querySelectorAll<HTMLButtonElement>('button')];updateField();
}
function hud():void {
  const percent=Math.floor(game.collected/game.total*100),count=game.slots.reduce((n,b)=>n+Number(Boolean(b)),0);
  if(percent!==lastPercent){lastPercent=percent;el('percent').textContent=`${percent}%`;el<HTMLProgressElement>('progress').value=percent;}
  if(count!==lastCount){lastCount=count;el('count').textContent=`${count} / 5`;}
}
function reset():void {
  game=new Game(asLevel(record));accumulator=0;paused=false;finished=false;wonSaved=false;lastPercent=-1;lastCount=-1;
  root.style.setProperty('--columns',String(game.columns));el('overlay').hidden=true;
  el('level-number').textContent=`УРОВЕНЬ ${record.number}`;el('difficulty').textContent=DIFFICULTIES[difficulty(record.number)];
  el<HTMLButtonElement>('restart').disabled=false;el('hint').textContent='';belt.reset();sand.reset();buildField();belt.measure();sand.draw(game);belt.draw(game,0);hud();sand.app.ticker.start();
}
function dialog(title:string,copy:string,action:string,callback:()=>void):void {
  el('result-title').textContent=title;el('result-copy').textContent=copy;el('result-action').textContent=action;
  el<HTMLButtonElement>('result-action').onclick=callback;el('overlay').hidden=false;el('result-action').focus();
}
function pause():void {
  if(!visible||paused||game.status!=='playing')return;
  paused=true;accumulator=0;sand.app.ticker.stop();
  dialog('Небольшая пауза','Песок подождёт.','Продолжить',()=>{paused=false;el('overlay').hidden=true;accumulator=0;sand.app.ticker.start();el('restart').focus();});
}
async function start():Promise<void> {
  if(loading)return;loading=true;const play=el<HTMLButtonElement>('play');play.disabled=true;play.textContent='Готовим песок…';
  el<HTMLButtonElement>('result-action').disabled=true;
  try {
    record=await loader.get(progress.data.number);
    if(!initialized){
      await sand.init(el('sand'));initialized=true;
      sand.app.ticker.add(ticker=>{
        if(!visible||paused||document.hidden){accumulator=0;return;}
        const dt=Math.min(ticker.deltaMS/1000,.1)*speed;
        accumulator=advanceFrame(game,ticker.deltaMS/1000,speed,accumulator);
        sand.draw(game);belt.draw(game,dt);hud();
        if(game.status==='won'&&!wonSaved){wonSaved=true;el<HTMLButtonElement>('restart').disabled=true;progress.advance();menu();}
        if(game.status!=='playing'&&!finished&&!belt.busy){
          finished=true;sand.app.ticker.stop();
          if(game.status==='won')dialog('До последней песчинки.','Следующий узор уже ждёт.','Следующий',()=>void start());
          else dialog('Цвета разминулись.','Освободи путь к нужным цветам и попробуй другой порядок.','Попробовать снова',reset);
        }
      });
      sand.app.canvas.addEventListener('webglcontextlost',()=>{
        paused=true;sand.app.ticker.stop();dialog('Нужно обновить игру','Этот заход начнётся заново, номер уровня и скорость сохранены.','Обновить',()=>location.reload());
      });
    }
    visible=true;el('menu').hidden=true;el('game').hidden=false;root.classList.add('playing');reset();el('restart').focus();
    void loader.get(progress.data.number+1);
  } catch(error){
    console.error(error);el('offline-note').textContent='Не удалось запустить игру. Обнови страницу.';
  } finally {loading=false;play.disabled=false;play.textContent='Играть →';el<HTMLButtonElement>('result-action').disabled=false;}
}
function home():void {
  visible=false;paused=false;belt.reset();if(initialized)sand.app.ticker.stop();el('overlay').hidden=true;el('game').hidden=true;el('menu').hidden=false;root.classList.remove('playing');menu();el('play').focus();
}
el('field').addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-position]');if(!button||!visible||paused||game.status!=='playing')return;
  const bucket=game.field[Number(button.dataset.position)];if(!bucket)return;
  const result=game.launch(bucket.id);
  if(result==='ok'){updateField();hud();el('hint').textContent='';}
  else if(result==='full')el('hint').textContent='Все пять мест заняты. Подожди заполнения ведра.';
});
el('play').addEventListener('click',()=>void start());el('home').addEventListener('click',home);el('result-home').addEventListener('click',home);
el('restart').addEventListener('click',()=>{if(!loading&&game.status==='playing')reset();});
el('demo-speed').addEventListener('click',()=>{if(visible&&!paused&&game.status==='playing')setSpeed(speed===1?2:1);});
window.addEventListener('resize',()=>{if(visible){belt.measure();belt.draw(game,0);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')pause();
  if(event.key==='Tab'&&!el('overlay').hidden){
    const first=el('result-action'),last=el('result-home');
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
setSpeed(speed);menu();
if(import.meta.env.PROD&&'serviceWorker'in navigator){
  window.addEventListener('load',()=>{
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL}).then(async registration=>{
      await navigator.serviceWorker.ready;if(progress.available)el('offline-note').textContent='Можно играть без интернета';
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller)el('offline-note').textContent='Есть обновление. Закрой все окна игры и открой снова.';
      });});
    }).catch(()=>{el('offline-note').textContent='Офлайн-загрузка недоступна. Пока играй с интернетом.';});
  });
}
