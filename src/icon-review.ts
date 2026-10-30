import './icon-review.css';
import { bucketIcon } from './bucket-icon';
import { gameIcon, type GameIcon } from './game-icons';

const teal='#58aaa8', coral='#e77d62', yellow='#e4bd68', violet='#a596bb', gray='#9ba49e';
const badge=(icon:GameIcon,color=teal)=>`<span class="badge" style="color:${color}">${gameIcon(icon)}</span>`;
function bucket(x:number,y:number,color:string,mark='',after=false,hidden=false):string {
  return `<div class="bucket ${hidden?'inverted':''}" style="left:${x}px;top:${y}px;color:${color}">${bucketIcon}${mark?after?mark:`<b class="old-mark">${mark}</b>`:''}</div>`;
}
const placed=(x:number,y:number,content:string)=>`<div class="placed" style="left:${x}px;top:${y}px">${content}</div>`;
function previews(colors:string[],after:boolean,hidden=false):string {
  return `<div class="previews ${after?'mini-buckets':'strips'}">${colors.map(color=>after?`<span style="color:${hidden?gray:color}">${bucketIcon}${hidden?'<b>?</b>':''}</span>`:`<i style="background:${hidden?gray:color}">${hidden?'?':''}</i>`).join('')}</div>`;
}
const rows:{title:string;note:string;render:(after:boolean,hidden:boolean)=>string;hidden?:boolean}[]=[
  {title:'Обычное ведро',note:'Убираем вместимость. Цвет и форма ведра остаются знакомыми.',render:a=>bucket(90,37,teal)+(!a?placed(90,29,'<small>1497</small>'):'')},
  {title:'Скрытое ведро',note:'Вопрос остаётся читаемым даже на перевёрнутом ведре. Настоящий цвет не показан.',render:a=>bucket(90,37,gray,a?badge('mystery',gray):'?',a,true)},
  {title:'Ключ и замок',note:'Одинаковый цвет ключа и замка показывает связь. Ключ вынесен к краю ведра, чтобы его цвет не сливался с корпусом.',hidden:true,render:(a,h)=>bucket(35,37,h?gray:coral,a?badge('key',h?gray:coral):'⚿',a)+`<div class="gate" style="left:151px;top:49px">${a?badge('lock',h?gray:coral):'⚿'}</div>`},
  {title:'Ведро с крышкой',note:'Вместо ромба — крышка с ручкой. Такой же знак отмечает закрытый песок.',hidden:true,render:(a,h)=>bucket(30,37,h?gray:yellow,a?badge('lid',h?gray:yellow):'◇',a)+`<div class="sand-patch"><div class="lid-panel">${a?badge('lid',h?gray:yellow):'◇'}</div></div>`},
  {title:'Смена цвета',note:'Стрелки окрашены в следующий цвет. Отдельный цветной кружок больше не нужен; номер пары остаётся.',hidden:true,render:(a,h)=>bucket(45,37,teal,a?badge('swap',h?gray:coral):'⇄',a)+bucket(140,37,h?gray:coral,a?badge('swap',teal):'⇄',a)+placed(50,111,a?'<small>1</small>':`<span class="old-dot" style="background:${h?gray:coral}"></span><small>⇄ 1</small>`)+placed(145,111,a?'<small>1</small>':`<span class="old-dot" style="background:${teal}"></span><small>⇄ 1</small>`)},
  {title:'Связанные вёдра',note:'Два ведра подвешены к общему деревянному коромыслу. Видно, что они составляют одну пару.',render:a=>(a?'<svg class="yoke" viewBox="0 0 150 50" aria-hidden="true"><path class="yoke-hook" d="M17 24v7q0 5 5 5m110-12v7q0 5-5 5"/><path class="yoke-wood" d="M13 24Q75 3 136 24"/><path class="yoke-highlight" d="M15 22Q75 3 134 22"/><path class="yoke-grain" d="M44 16q19-5 35-3m15 2 17 3"/></svg>':'<div class="rope"></div>')+bucket(35,37,teal)+bucket(150,37,violet)},
  {title:'Очередь',note:'Миниатюрные вёдра показывают порядок следующих цветов. Счётчик 3/5 сохраняется.',hidden:true,render:(a,h)=>bucket(90,27,teal)+placed(89,108,previews([coral,yellow],a,h))+placed(140,25,'<small>3/5</small>')},
  {title:'Двухслойная платформа',note:'Слои видны по форме платформы. Убираем отдельный значок и римскую цифру, сохраняем будущие цвета.',hidden:true,render:(a,h)=>`<div class="platform">${a?'':'<b class="roman">Ⅱ</b>'}${placed(43,94,previews([coral,yellow,violet,teal],a,h))}</div>`+bucket(64,33,teal)+bucket(132,33,yellow)},
  {title:'Поворотный поднос',note:'Крупная круговая стрелка читается в игровом размере и показывает вращение по часовой стрелке.',render:a=>'<div class="tray"></div>'+bucket(40,37,teal)+bucket(150,37,coral)+placed(103,59,a?badge('rotate','#598c7c'):'<b class="old-turn">↻</b>')},
  {title:'Мост',note:'Деревянный настил уже обозначает мост. Убираем дублирующий значок.',render:()=>'<div class="bridge"></div>'+bucket(45,28,coral)+bucket(137,28,teal)},
];
function sample(row:typeof rows[number],after:boolean,hidden=false,small=false):string {
  return `<div class="sample ${small?'actual':''}"><div class="scene ${after?'after':'before'}">${row.render(after,hidden)}</div></div>`;
}
const root=document.querySelector<HTMLElement>('#icon-review')!;
root.innerHTML=`<header><a class="brand" href="./">SAND BUCKET <span>/ МАСТЕРСКАЯ</span></a><p class="eyebrow">10 ПАР ДЛЯ СРАВНЕНИЯ</p><h1>Знакомый смысл.<br><em>Более ясные знаки.</em></h1><p class="intro">Слева — как сейчас в игре. Справа — новый вариант. Номера помогут обсудить каждый: «в №3 увеличить ключ».</p><nav aria-label="Перейти к сравнению">${rows.map((r,i)=>`<a href="#icon-${i+1}" title="${r.title}">${String(i+1).padStart(2,'0')}</a>`).join('')}</nav><div class="notice">Предпросмотр · оформление самой игры пока не изменено</div></header>
<div class="comparisons">${rows.map((r,i)=>`<section class="comparison" id="icon-${i+1}" aria-labelledby="title-${i+1}"><div class="row-title"><span class="number">${String(i+1).padStart(2,'0')}</span><div><h2 id="title-${i+1}">${r.title}</h2><p>${r.note}</p></div></div><div class="pair">${[false,true].map(a=>`<div class="version ${a?'new':'old'}"><h3>${a?'После <span>НОВЫЙ ВАРИАНТ</span>':'До <span>СЕЙЧАС В ИГРЕ</span>'}</h3>${sample(r,a)}<div class="size-label">Игровой размер</div>${sample(r,a,false,true)}${r.hidden?`<div class="hidden-example"><div class="size-label">Если цвет скрыт</div>${sample(r,a,true,true)}</div>`:''}</div>`).join('')}</div></section>`).join('')}</div><footer>Цвет — часть значка. Скрытый цвет остаётся скрытым.<br>Никаких изменений уровней или прогресса.</footer>`;
if(rows.length!==10||new Set(rows.map(r=>r.title)).size!==10)throw Error('Сравнение должно содержать десять разных механик и состояний');
