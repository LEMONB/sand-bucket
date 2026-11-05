import { FAST_FILL_SECONDS, type AuditResult } from './capacity-audit.ts';

export function auditReport(results:AuditResult[], seconds=FAST_FILL_SECONDS):string {
  const labels={unchanged:'Изменения не нужны',simple:'Только вместимости: все 4 проверки пройдены','fixed-pairs':'Ограничения фиксированных пар',unconfirmed:'Проходимость не подтверждена'};
  const lines=['Перебалансировка быстрых вёдер', `Порог: строго меньше ${String(seconds).replace('.',',')} с от прибытия до заполнения на ×2, включая шаг сбора.`, 'Выбор: хотя бы один из двух сценариев; текущий разброс цвета больше 1:2.', 'Меняются только выбранные цвета; сумма песка, планировка и пары обмена сохраняются.', 'Неудача ограниченного поиска не доказывает необходимость новой планировки.', ''];
  for(const [status,label] of Object.entries(labels)){
    const rows=results.filter(r=>r.status===status);
    lines.push(`${label}: ${rows.length}`,`Уровни: ${rows.map(r=>r.number).join(', ')||'нет'}`,'');
  }
  for(const r of results.filter(r=>r.status!=='unchanged')){
    lines.push(`Уровень ${r.number}: ${labels[r.status]}; цвета: ${r.colors.join(', ')}`);
    for(const color of r.colors){
      const before=r.rangesBefore.find(g=>g.color===color)!,after=r.rangesAfter?.find(g=>g.color===color);
      const counts=(groups:AuditResult['capacitiesBefore']|undefined)=>groups?.find(g=>g.color===color)?.buckets.map(b=>`${b.id}:${b.capacity}`).join(', ');
      lines.push(`  Цвет ${color}: ${before.min}–${before.max} (${(before.max/before.min).toFixed(3)}:1) → ${after?`${after.min}–${after.max} (${(after.max/after.min).toFixed(3)}:1)`:'нет кандидата'}`);
      lines.push(`    До (id:вместимость): ${counts(r.capacitiesBefore)}`);
      if(r.capacitiesAfter)lines.push(`    После: ${counts(r.capacitiesAfter)}`);
      const minTime=(fills:NonNullable<AuditResult['after']>)=>Math.min(...fills.filter(f=>f.color===color).map(f=>f.seconds)).toFixed(3);
      lines.push(`    Минимальное время: ${minTime(r.before)} с${r.after?` → ${minTime(r.after)} с`:''}`);
    }
    if(r.reason)lines.push(`  ${r.reason}`);
    for(const f of r.failures??[])lines.push(`  ×${f.speed}, пауза ${f.pause}: ${f.reason}`);
    lines.push('');
  }
  return lines.join('\n');
}
