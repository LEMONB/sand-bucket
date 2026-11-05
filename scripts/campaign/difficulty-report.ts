import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game } from '../../src/game.ts';
import { playableLevel } from '../../src/campaign-art.ts';
import type { CampaignLevel } from '../../src/campaign-types.ts';
import type { Proof } from './solver.ts';
import { POLICY_NAMES, type probePolicy } from './difficulty-audit.ts';

export interface CalibrationEntry {
  number:number; current:string; inputKey:string; mechanics:string[]; record:CampaignLevel;
  palette?:string[]; cells:number[]; proofs:Proof[]; policies:ReturnType<typeof probePolicy>[];
}
export interface DifficultyReview { number:number; inputKey:string; evidenceKey:string; proposed:string; rationale:string }
export function evidenceKey(result:CalibrationEntry):string {
  return createHash('sha256').update(JSON.stringify([result.inputKey,result.proofs,result.policies])).digest('hex');
}
const escape=(text:unknown)=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const outcome=(value:string)=>value==='won'?'Пройден':value==='lost'?'Проигрыш':'Лимит наблюдения';

function artwork(cells:number[],palette:string[]):string {
  let rects='';
  for(let y=0;y<128;y++)for(let x=0;x<128;){
    const color=cells[y*128+x],start=x;
    while(x<128&&cells[y*128+x]===color)x++;
    if(color)rects+=`<rect x="${start}" y="${y}" width="${x-start}" height="1" fill="${palette[color]}"/>`;
  }
  return `<svg class="art" viewBox="0 0 128 128" role="img" aria-label="Песочный рисунок уровня">${rects}</svg>`;
}

function field(record:CampaignLevel):string {
  const game=new Game(playableLevel(record));
  const grid=game.field.map((b,i)=>{
    const marks=[];
    if(game.mechanics.queues.some(q=>q.cell===i))marks.push('Д');
    if(game.mechanics.platforms.some(p=>p.cells.includes(i)))marks.push('П');
    if(game.mechanics.trays.some(t=>t.includes(i)))marks.push('↻');
    if(game.mechanics.gates.some(g=>g.key===b?.id))marks.push('К');
    if(game.mechanics.gates.some(g=>g.cells.includes(i)))marks.push('Замок');
    if(game.mechanics.lids.some(l=>l.key===b?.id))marks.push('Крышка');
    if(game.mechanics.links.some(p=>b&&p.includes(b.id)))marks.push('Связь');
    if(b?.swapWith!==undefined)marks.push('⇄');
    const hidden=b&&game.isHidden(b);
    const color=game.walls.has(i)?'#8b9892':b?(hidden?'#adb7b1':game.palette[b.color]):'#f0ede5';
    return `<div class="cell ${game.paths.has(i)?'available':''}" style="background:${color}">${b?`<b>${b.id+1}${hidden?' ?':''}</b><small>${b.capacity}</small>`:game.walls.has(i)?'▪':''}<small>${marks.join(' ')}</small></div>`;
  }).join('');
  const reserves=[...game.mechanics.queues.map(q=>({name:`Диспенсер у клетки ${q.cell+1}`,buckets:q.buckets,hidden:q.hidden})),
    ...game.mechanics.platforms.map(p=>({name:`Следующий слой платформы`,buckets:p.next,hidden:p.hidden}))];
  return `<div class="grid" style="grid-template-columns:repeat(${game.columns},1fr)">${grid}</div>${reserves.map(r=>`<p class="muted">${r.name}: ${r.buckets.map(b=>`№${b.id+1}${r.hidden?' (цвет скрыт)':''}`).join(', ')}</p>`).join('')}`;
}

export function renderDifficultyReport(results:CalibrationEntry[],reviews:DifficultyReview[],catalogHash:string):string {
  assert.equal(results.length,reviews.length);
  assert.equal(new Set(reviews.map(r=>r.number)).size,reviews.length);
  reviews=results.map(result=>{
    const review=reviews.find(r=>r.number===result.number);
    assert(review,`Рецензия уровня ${result.number} отсутствует`);
    return review.inputKey===result.inputKey&&review.evidenceKey===evidenceKey(result)?review:{...review,
      proposed:'Нужна новая оценка',rationale:'Уровень или результаты проверок изменились после калибровки. Прежняя оценка не применяется; ниже приведены актуальные измерения.'};
  });
  const summary=results.map(r=>{
    const review=reviews.find(v=>v.number===r.number)!;
    return `<tr><td><a href="#level-${r.number}">${r.number}</a></td><td>${escape(r.current)}</td><td>${escape(review.proposed)}</td><td>${r.policies.filter(p=>p.outcome==='won').length}/8</td><td>${escape(review.rationale)}</td></tr>`;
  }).join('');
  const cards=results.map(r=>{
    const review=reviews.find(v=>v.number===r.number)!;
    const reference=r.proofs.find(p=>p.speed===1&&p.pause===0)!;
    const openings=reference.decisions.flatMap((d,i)=>!d.exposed?[`ход ${i+1}, ведро №${d.bucketId+1}`]:[]);
    return `<article id="level-${r.number}"><h2>Уровень ${r.number} · ${escape(review.proposed)}</h2>
<p>Сейчас: ${escape(r.current)}. Механики: ${escape(r.mechanics.join(', ')||'базовые правила')}.</p><p>${escape(review.rationale)}</p>
<div class="boards">${artwork(r.cells,r.palette!)}<div>${field(r.record)}</div></div>
<p>Найденное решение: ${reference.decisions.length} отправок. Пик занятости по сохранённым решениям: ${Math.min(...r.proofs.map(p=>p.peakSlots))}–${Math.max(...r.proofs.map(p=>p.peakSlots))} из 5.</p>
<p>${openings.length?`В решении ×1 без дополнительных пауз встречаются отправки без доступного внизу цвета: ${openings.join('; ')}. Это наблюдение об одном решении, а не доказательство обязательности этих ходов.`:'В решении ×1 без дополнительных пауз каждое выбранное ведро соответствует доступному внизу цвету.'}</p>
<details><summary>Проверенные решения: обе скорости и четыре режима ожидания</summary><div class="table-wrap"><table><thead><tr><th>Скорость</th><th>Пауза, тики</th><th>Отправок</th><th>Пик мест</th><th>Без доступного цвета</th></tr></thead><tbody>${r.proofs.map(p=>`<tr><td>×${p.speed}</td><td>${p.pause===-1?'Переменная':p.pause}</td><td>${p.decisions.length}</td><td>${p.peakSlots}</td><td>${p.unproductive}</td></tr>`).join('')}</tbody></table></div></details>
<details><summary>Порядок прохождения ×1 и условия ожидания</summary><p>Номера соответствуют схеме. Не отправляй всё сразу: условия — часть найденного решения.</p><ol>${reference.decisions.map(d=>`<li>Ведро <b>№${d.bucketId+1}</b>; собрано ≥ ${d.collected}; завершены: ${d.completed.map(id=>id+1).join(', ')||'нет'}${d.exposed?'; дождаться доступного цвета внизу':''}.</li>`).join('')}</ol></details>
<details><summary>Четыре простые стратегии — восемь запусков</summary><div class="table-wrap"><table><thead><tr><th>Выбор ведра</th><th>Скорость</th><th>Итог</th><th>Собрано</th><th>Последние отправки</th></tr></thead><tbody>${r.policies.map(p=>`<tr><td>${POLICY_NAMES[p.policy]}</td><td>×${p.speed}</td><td>${outcome(p.outcome)}</td><td>${Math.floor(p.collected/p.total*100)}%</td><td>${p.moves.slice(-3).map(m=>m.bucketId+1).join(' → ')}</td></tr>`).join('')}</tbody></table></div></details>
<p><a href="http://localhost:5173/sand-bucket/?level=${r.number}">Играть уровень ${r.number} на локальном сервере</a></p></article>`;
  }).join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Калибровка сложности — 20 уровней</title>
<style>body{margin:0;background:#f5f1e9;color:#233e35;font:16px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:24px}h1{font-size:clamp(26px,5vw,42px);line-height:1.2}h2{line-height:1.3}a{color:#1b6659}article,.intro{background:#fffdf8;border:1px solid #d6ded3;border-radius:18px;padding:24px;margin:24px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #d6ded3}th{background:#edf0e7}.table-wrap{overflow-x:auto}.boards{display:grid;grid-template-columns:minmax(150px,280px) minmax(0,1fr);gap:24px;align-items:start}.art{width:100%;border-radius:12px;shape-rendering:crispEdges}.grid{display:grid;gap:4px}.cell{min-height:45px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid transparent;border-radius:6px;color:white;text-shadow:0 1px 3px #000}.cell small{font-size:11px}.cell.available{border-color:#263c34}.muted{font-size:13px;color:#5e6b61}details{margin:12px 0}summary{cursor:pointer;font-weight:600}li{margin:6px 0}.hash{overflow-wrap:anywhere}@media(max-width:650px){main{padding:12px}article,.intro{padding:16px}.boards{grid-template-columns:1fr}.art{max-width:240px}.cell{min-height:38px}.cell small{font-size:10px}}</style>
<main><h1>Одна шкала сложности для всей кампании</h1><p>20 существующих уровней · предварительная оценка для обсуждения · уровни и игровые подписи не изменены</p>
<section class="intro"><h2>Общая шкала</h2><p>Для игрока, знакомого с используемыми механиками. Номер уровня, новизна правил, размер поля и длительность сами по себе не повышают категорию.</p><dl><dt><b>Очень лёгкий</b></dt><dd>Очевидные подходящие ходы, порядок редко создаёт проблему.</dd><dt><b>Лёгкий</b></dt><dd>Простое освобождение проходов, большой запас допустимых решений.</dd><dt><b>Средний</b></dt><dd>Планирование нескольких отправок и свободных мест.</dd><dt><b>Сложный</b></dt><dd>Цепочки зависимостей, существенные последствия неверного порядка.</dd><dt><b>Очень сложный</b></dt><dd>Требовательная последовательность действий, мало безопасных альтернатив.</dd></dl></section>
<section class="intro"><h2>Как читать сравнение</h2><p>Предлагаемые категории — гипотезы по наблюдаемым решениям, не автоматически вычисленный рейтинг. Особенно важно проверить уровни 1, 5, 103, 105, 205 и 305 в игре.</p>
<p>Каждая простая стратегия берёт доступное ведро под текущий цвет песка, избегает повторения цвета на ленте и не заглядывает в скрытые цвета или будущие состояния. Отличается только предпочтение: верхнее левое, нижнее правое, меньшее или большее ведро. Проверены ×1 и ×2 без дополнительных задержек между решениями.</p>
<p>Результат 8/8 означает успех этих восьми запусков, а не 100% вероятность победы человека. «Лимит наблюдения» — стратегия не завершила уровень за 30 000 тиков; это не проигрыш и не доказательство непроходимости. Стратегия может ждать подходящий цвет, вместо того чтобы открыть проход другим ведром.</p>
<p>Все сохранённые решения повторно проиграны при ×1 и ×2 без задержки и с переменным ожиданием перед ходом. Найденное решение не доказывает, что проще пройти нельзя.</p>
<p>На схемах крупное число — номер ведра только для отчёта, мелкое — вместимость, рамка — доступный проход. Д — диспенсер, П — платформа, ↻ — поднос, ⇄ — смена цвета, ? — скрытый цвет. В игре отладочные номера не добавлены.</p>
<p>Чтобы играть по ссылкам, запусти <code>npm run dev -- --port 5173</code>. Переход по номеру работает только в режиме разработки.</p></section>
<h2>Предлагаемые категории</h2><div class="table-wrap"><table><thead><tr><th>Уровень</th><th>Сейчас</th><th>Предложение</th><th>Стратегии</th><th>Обоснование</th></tr></thead><tbody>${summary}</tbody></table></div>
<section class="intro"><h2>Что эта выборка пока не проверяет</h2><p>Здесь нет подтверждённых эталонов «Сложный» и «Очень сложный». Их нельзя назначать ради заполнения шкалы. Выборка также не охватывает ключи, платформы, связанные вёдра и крышки; перед оценкой всей кампании потребуется калибровка этих случаев.</p><p>Первые появления механик в текущей кампании: диспенсер — 6, ключ — 11, платформа — 16, поднос — 21, связанные вёдра — 31, крышка — 36, смена цвета — 41, скрытые цвета — 47. Эти вводные уровни не входят в согласованные 20 примеров и здесь не оценивались.</p></section>
${cards}<p class="muted hash">SHA-256 исходного каталога: ${escape(catalogHash)}. Полные исходные результаты: evidence.json рядом с отчётом.</p></main></html>`;
}
