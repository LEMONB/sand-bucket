import { version } from '../package.json';
import './style.css';
import './interface.css';
import './mechanics.css';
import { FieldView } from './field-view';
import { ART_TITLES } from './art-catalog';
import { MECHANIC_HINTS } from './mechanics';
import { bucketIcon } from './bucket-icon';
import { Game, advanceFrame, type Speed } from './game';
import { campaignLevel, playableLevel } from './campaign';
import { CAMPAIGN_COUNT, CAMPAIGN_DIFFICULTIES, campaignPhase } from './campaign-rules';
import type { CampaignLevel } from './campaign-types';
import { GameRenderer, paintSand } from './renderer';
import { BeltView } from './belt-view';
import { ProgressStore } from './progress';
import { resultReady } from './result-timing';
import { GameUpdates, readUpdateResume } from './updates';
import { createLossScenario, createPuzzleScenario, PUZZLE_TITLES, PUZZLE_DESCRIPTIONS, type PuzzleScenario } from './dev-scenarios';

let storage: Pick<Storage,'getItem'|'setItem'>;
try { storage=localStorage; } catch { storage={getItem(){throw Error();},setItem(){throw Error();}}; }
const progress=new ProgressStore(storage);
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<p id="update-note" class="update-note" role="status" hidden>Обновление готово. Применится при переходе в меню или запуске уровня.</p><section id="menu" class="menu" aria-label="Главное меню">
<header class="brand"><span class="brand-mark">${bucketIcon}</span><span>SAND BUCKET</span></header>
<div class="intro"><span class="eyebrow">МАЛЕНЬКАЯ ПАУЗА</span><h1>Всё течёт.<br><span>Песок тоже.</span></h1><p>Новый узор. Знакомое спокойствие.</p></div>
<div class="level-card"><div class="preview-wrap"><canvas id="preview" width="128" height="128" aria-hidden="true"></canvas><span id="menu-number" class="level-badge"></span></div><div class="level-description"><h2 id="menu-title"></h2><span id="menu-difficulty" class="level-state"></span></div></div>
<label class="level-picker">Выбрать уровень <select id="level-select" aria-label="Выбрать доступный уровень"></select></label><button id="play" class="primary">Играть →</button><p class="menu-note">Без спешки. Без рекламы.</p><p id="offline-note" class="offline-note" role="status"></p><footer class="app-version">v${version}</footer></section>
<section id="game" class="mock-game" hidden aria-label="Игра">
<header class="mock-header"><button id="restart" class="icon-button" aria-label="Начать уровень заново">↻</button><button id="home" class="icon-button" aria-label="Вернуться в меню">‹</button><span id="level-number" class="mock-brand"></span><button id="mechanic-help" aria-label="Правила механик"><span id="difficulty"></span> ⓘ</button></header>
<div class="mock-status"><span id="percent">0%</span><progress id="progress" max="100" value="0" aria-label="Собрано песка"></progress><span id="count">0 / 5</span></div>
<div id="sand" class="mock-sand" role="img" aria-label="Поле песка"></div><div class="belt-row"><div id="belt" class="mock-belt" aria-label="Конвейер, пять мест"></div><button id="demo-speed" aria-label="Ускорить в два раза" aria-pressed="false"><span>×1</span></button></div><div id="field" class="mock-field" role="group" aria-label="Поле вёдер"></div><span id="hint" class="sr-only" role="status"></span>
</section><div id="overlay" class="overlay" hidden><section class="result" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-icon">✦</div><h2 id="result-title"></h2><p id="result-copy"></p><button id="result-action" class="primary"></button><button id="result-home" class="text-button">В меню</button></section></div>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const sand=new GameRenderer(),belt=new BeltView(el('belt'),el('field'),el('sand'));
const requestedScenario=import.meta.env.DEV?new URLSearchParams(location.search).get('scenario'):null;
const puzzleScenario=requestedScenario&&Object.hasOwn(PUZZLE_TITLES,requestedScenario)?requestedScenario as PuzzleScenario:null;
const lossScenario=import.meta.env.DEV&&new URLSearchParams(location.search).get('scenario')==='loss';
const requestedLevel=import.meta.env.DEV?Number(new URLSearchParams(location.search).get('level')):0;
let devLevel=Number.isSafeInteger(requestedLevel)&&requestedLevel>0&&requestedLevel<=CAMPAIGN_COUNT?requestedLevel:0;
const resumeURL=new URL(location.href);
const resume=readUpdateResume(resumeURL,progress.unlocked);
if(resume.attempted)history.replaceState(history.state,'',resumeURL.href);
let updates:GameUpdates|undefined;
let selectedLevel=devLevel||resume.destination?.level||progress.unlocked;
let record:CampaignLevel=campaignLevel(selectedLevel);
let game=new Game(playableLevel(record));
let initialized=false,loading=false,visible=false,paused=false,finished=false,wonSaved=false;
let lossElapsed=0;
let accumulator=0, speed:Speed=progress.data.speed, lastPercent=-1,lastCount=-1;
const fieldView=new FieldView(el('field'),el('sand'));
const shownMechanics=new Set(progress.data.seenMechanics);
function storageNote():void {if(!progress.available)el('offline-note').textContent='Браузер не разрешает сохранять прогресс.';}
function menu():void {
  el('menu-number').textContent=String(selectedLevel);
  el('menu-title').textContent=progress.completed?'Кампания пройдена':`Уровень ${selectedLevel} из ${CAMPAIGN_COUNT}`;
  el('menu-difficulty').textContent=CAMPAIGN_DIFFICULTIES[campaignPhase(selectedLevel)];
  const picker=el<HTMLSelectElement>('level-select');
  picker.innerHTML=Array.from({length:progress.unlocked},(_,i)=>`<option value="${i+1}">${i+1}${i+1<progress.data.number?' ✓':''}</option>`).join('');
  picker.value=String(selectedLevel);
  el('play').textContent=progress.completed||selectedLevel<progress.data.number?'Переиграть →':'Играть →';
  const preview=playableLevel(campaignLevel(selectedLevel));
  paintSand(el<HTMLCanvasElement>('preview').getContext('2d')!,preview.cells,preview.palette);
  storageNote();
}

function setSpeed(value:Speed):void {
  speed=value;if(!puzzleScenario)progress.setSpeed(value);
  const button=el('demo-speed');button.firstElementChild!.textContent=`×${value}`;button.setAttribute('aria-pressed',String(value===2));
  button.setAttribute('aria-label',value===1?'Ускорить в два раза':'Вернуть обычную скорость');storageNote();
}
function updateField():void { fieldView.draw(game); }
function buildField():void { fieldView.reset(game); }
function explainMechanics(onlyNew=false):void {
  if(puzzleScenario){
    paused=true;sand.app.ticker.stop();
    dialog(PUZZLE_TITLES[puzzleScenario],PUZZLE_DESCRIPTIONS[puzzleScenario],'Играть',()=>{paused=false;el('overlay').hidden=true;accumulator=0;sand.app.ticker.start();});
    return;
  }
  const kinds=[...new Set(record.kinds??[])].filter(k=>!onlyNew||!shownMechanics.has(k));
  if(!kinds.length)return;
  paused=true;sand.app.ticker.stop();
  dialog('Новый ход',kinds.map(k=>MECHANIC_HINTS[k].replace('с ромбом','со значком крышки').replace('цепь разрывается','связь разрывается')).join(' '),'Играть',()=>{paused=false;el('overlay').hidden=true;accumulator=0;sand.app.ticker.start();});
  kinds.forEach(k=>shownMechanics.add(k));if(!devLevel&&!lossScenario)progress.markMechanicsSeen(kinds);storageNote();
}
function hud():void {
  const percent=Math.floor(game.collected/game.total*100),count=game.slots.reduce((n,b)=>n+Number(Boolean(b)),0);
  if(percent!==lastPercent){lastPercent=percent;el('percent').textContent=`${percent}%`;el<HTMLProgressElement>('progress').value=percent;}
  if(count!==lastCount){lastCount=count;el('count').textContent=`${count} / 5`;}
}
function reset():void {
  if(updates?.apply({level:record.number,play:true}))return;
  game=new Game(puzzleScenario?createPuzzleScenario(puzzleScenario):lossScenario?createLossScenario():playableLevel(record));accumulator=0;lossElapsed=0;paused=false;finished=false;wonSaved=false;lastPercent=-1;lastCount=-1;
  root.style.setProperty('--columns',String(game.columns));el('overlay').hidden=true;
  el('level-number').textContent=puzzleScenario?PUZZLE_TITLES[puzzleScenario]:`УРОВЕНЬ ${record.number}`;el('difficulty').textContent=puzzleScenario?'Образец':lossScenario?'Проверка проигрыша':CAMPAIGN_DIFFICULTIES[campaignPhase(record.number)];
  el<HTMLButtonElement>('restart').disabled=false;el('hint').textContent='';belt.reset();sand.reset();buildField();belt.measure();if(lossScenario){for(let id=0;id<5;id++)game.launch(id);updateField();}sand.draw(game);belt.draw(game,0,speed);hud();sand.app.ticker.start();
}
function dialog(title:string,copy:string,action:string,callback:()=>void):void {
  el('overlay').classList.toggle('is-win',game.status==='won');
  el('result-title').textContent=title;el('result-copy').textContent=copy;el('result-action').textContent=action;
  el<HTMLButtonElement>('result-action').onclick=callback;el('overlay').hidden=false;el('result-action').focus();
}
function pause():void {
  if(!visible||paused||game.status!=='playing')return;
  paused=true;accumulator=0;sand.app.ticker.stop();
  dialog('Небольшая пауза','Песок подождёт.','Продолжить',()=>{paused=false;el('overlay').hidden=true;accumulator=0;sand.app.ticker.start();el('restart').focus();});
}
async function start():Promise<void> {
  if(updates?.apply({level:selectedLevel,play:true}))return;
  if(loading)return;loading=true;const play=el<HTMLButtonElement>('play');play.disabled=true;play.textContent='Готовим песок…';
  el<HTMLButtonElement>('result-action').disabled=true;
  try {
    if(!puzzleScenario)record=campaignLevel(selectedLevel);
    if(!initialized){
      await sand.init(el('sand'));initialized=true;
      sand.app.ticker.add(ticker=>{
        if(!visible||paused||document.hidden){accumulator=0;return;}
        const dt=Math.min(ticker.deltaMS/1000,.1);
        const wasLost=game.status==='lost';
        accumulator=advanceFrame(game,ticker.deltaMS/1000,speed,accumulator);
        sand.draw(game);belt.draw(game,dt,speed);updateField();el('field').classList.toggle('is-changing',game.motionTick<game.busyUntil);hud();
        lossElapsed=wasLost?lossElapsed+dt:0;
        if(game.status==='won'&&!wonSaved){
          wonSaved=true;el<HTMLButtonElement>('restart').disabled=true;
          if(!devLevel&&!puzzleScenario&&!lossScenario){
            const advances=record.number===progress.data.number;
            progress.advance(record.number);if(advances)selectedLevel=progress.unlocked;
          }
          menu();
        }
        if(!finished&&resultReady(game.status,belt.busy,lossElapsed)){
          finished=true;sand.app.ticker.stop();
          if(game.status==='won'&&puzzleScenario)dialog('До последней песчинки.',PUZZLE_TITLES[puzzleScenario],'Повторить',reset);
          else if(game.status==='won'&&record.number===CAMPAIGN_COUNT)dialog('Все 400 уровней пройдены!','Можно вернуться к любимым рисункам.','Выбрать уровень',home);
          else if(game.status==='won')dialog('До последней песчинки.','Следующий узор уже ждёт.','Следующий',()=>{selectedLevel=record.number+1;void start();});
          else dialog('Цвета разминулись.','Освободи путь к нужным цветам и попробуй другой порядок.','Попробовать снова',reset);
        }
      });
      sand.app.canvas.addEventListener('webglcontextlost',()=>{
        paused=true;sand.app.ticker.stop();dialog('Нужно обновить игру','Этот заход начнётся заново, номер уровня и скорость сохранены.','Обновить',()=>location.reload());
      });
    }
    visible=true;el('menu').hidden=true;el('game').hidden=false;root.classList.add('playing');reset();el('restart').focus();
    el('sand').setAttribute('aria-label',puzzleScenario?PUZZLE_TITLES[puzzleScenario]:ART_TITLES[record.art??0]);
    if(!puzzleScenario&&!lossScenario&&(record.kinds??[]).some(k=>!shownMechanics.has(k)))explainMechanics(true);
  } catch(error){
    console.error(error);el('offline-note').textContent='Не удалось запустить игру. Обнови страницу.';
  } finally {loading=false;play.disabled=false;play.textContent=progress.completed?'Переиграть →':'Играть →';el<HTMLButtonElement>('result-action').disabled=false;}
}
function home():void {
  if(updates?.apply({level:selectedLevel,play:false}))return;
  visible=false;paused=false;belt.reset();if(initialized)sand.app.ticker.stop();el('overlay').hidden=true;el('game').hidden=true;el('menu').hidden=false;root.classList.remove('playing');menu();el('play').focus();
}
el('field').addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-position]');if(!button||!visible||paused||game.status!=='playing')return;
  const bucket=game.field[Number(button.dataset.position)];if(!bucket)return;
  const result=game.launch(bucket.id);
  if(result==='ok'){updateField();hud();el('hint').textContent='';}
  else if(result==='full')el('hint').textContent='Все пять мест заняты. Подожди заполнения ведра.';
});
el('level-select').addEventListener('change',()=>{selectedLevel=Number(el<HTMLSelectElement>('level-select').value);menu();});
el('play').addEventListener('click',()=>void start());el('home').addEventListener('click',home);el('result-home').addEventListener('click',home);
el('restart').addEventListener('click',()=>{if(!loading&&game.status==='playing')reset();});
el('demo-speed').addEventListener('click',()=>{if(visible&&!paused&&game.status==='playing')setSpeed(speed===1?2:1);});
el('mechanic-help').addEventListener('click',()=>{if(visible&&!paused&&game.status==='playing')explainMechanics();});
window.addEventListener('resize',()=>{if(visible){fieldView.resize(game);belt.measure();belt.draw(game,0,speed);}});
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
if(import.meta.env.PROD){
  updates=new GameUpdates(()=>!visible&&!loading?{level:selectedLevel,play:false}:null,resume.attempted,text=>{
    if(progress.available)el('offline-note').textContent=text;
  },ready=>{ el('update-note').hidden=!ready; });
  void updates.start();
}
if(puzzleScenario||lossScenario||devLevel||resume.destination?.play)void start();
