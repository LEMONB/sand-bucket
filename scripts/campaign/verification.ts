import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CampaignCatalog, CampaignLevel } from '../../src/campaign-types.ts';
import { playableLevel } from '../../src/campaign-art.ts';
import { emptyMechanics } from '../../src/mechanics.ts';
import type { Level } from '../../src/game.ts';
import type { Proof } from './solver.ts';

// Generation and artwork code are excluded: their actual output is part of the input key.
export const VERIFICATION_FILES = ['src/game.ts', 'src/mechanics.ts', 'scripts/campaign/solver.ts', 'scripts/campaign-worker.ts', 'scripts/campaign/verification.ts'];
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

export function verificationHash(read: (file: string) => string): string {
  return digest(VERIFICATION_FILES.map(file => `${file}\n${read(file)}`).join('\n'));
}

export function playableKey(level: Level): string {
  return digest(JSON.stringify({
    columns: level.columns ?? 4, walls: [...(level.walls ?? [])].sort((a,b) => a-b),
    field: level.field, mechanics: level.mechanics ?? emptyMechanics(), cells: [...level.cells],
  }));
}

export function verificationOptions(args: string[], count: number): { levels?: number[]; changed?: string; force: boolean } {
  const options: { levels?: number[]; changed?: string; force: boolean } = { force: false };
  for (let i=0; i<args.length; i++) {
    const arg=args[i];
    if (['--all','--pilot','--verify','--verify-playable'].includes(arg) || /^--workers=\d+$/.test(arg)) continue;
    if (arg==='--force' && !options.force) { options.force=true; continue; }
    if (arg==='--levels' && options.levels===undefined) {
      const value=args[++i] ?? '';
      if (!/^\d+(,\d+)*$/.test(value)) throw Error('--levels: укажите номера через запятую');
      options.levels=[...new Set(value.split(',').map(Number))].sort((a,b)=>a-b);
      if (options.levels.some(n=>!Number.isSafeInteger(n)||n<1||n>count)) throw Error(`Номер уровня должен быть от 1 до ${count}`);
      continue;
    }
    if (arg==='--changed' && options.changed===undefined) {
      const value=args[++i];
      if (!value || value.startsWith('-')) throw Error('--changed: укажите Git revision');
      options.changed=value; continue;
    }
    throw Error(`Неизвестный или повторный аргумент: ${arg}`);
  }
  if (options.levels && options.changed) throw Error('Выберите --levels или --changed');
  if ((options.levels || options.changed || options.force) && !args.includes('--verify-playable')) throw Error('--levels, --changed и --force доступны только с --verify-playable');
  return options;
}

export function changedLevels(current: CampaignCatalog, previous: CampaignCatalog, before: (record: CampaignLevel) => Level): number[] {
  const old=new Map(previous.levels.map(record=>[record.number,record]));
  return current.levels.filter(record=>{
    const prior=old.get(record.number);
    return !prior || playableKey(playableLevel(record))!==playableKey(before(prior));
  }).map(record=>record.number);
}

export async function changedSince(root: URL, catalog: CampaignCatalog, ref: string): Promise<number[]> {
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
  const revision=git(['rev-parse','--verify','--end-of-options',`${ref}^{commit}`]).trim();
  const readBefore=(file:string)=>git(['show',`${revision}:${file}`]);
  // A shared rule/checker change invalidates the entire selection, even with unchanged layouts.
  for (const file of VERIFICATION_FILES) {
    let before:string;
    try { before=readBefore(file); } catch { return catalog.levels.map(level=>level.number); }
    if (readFileSync(new URL(file,root),'utf8')!==before) return catalog.levels.map(level=>level.number);
  }
  const previous=JSON.parse(readBefore('src/levels/campaign.json')) as CampaignCatalog;
  if (previous.version!==catalog.version) return catalog.levels.map(level=>level.number);
  const directory=mkdtempSync(join(tmpdir(),'sand-artwork-'));
  try {
    writeFileSync(join(directory,'package.json'),' {"type":"module"}');
    // Snapshot the artwork module graph so changes to one image select every use of that image.
    for (const file of ['campaign-art.ts','art-catalog.ts','art-scenes.ts']) writeFileSync(join(directory,file),readBefore(`src/${file}`));
    const baseline=await import(pathToFileURL(join(directory,'campaign-art.ts')).href) as { playableLevel: (record:CampaignLevel)=>Level };
    return changedLevels(catalog,previous,baseline.playableLevel);
  } finally { rmSync(directory,{recursive:true,force:true}); }
}

export function validProofs(value: unknown): value is Proof[] {
  if (!Array.isArray(value) || value.length!==8) return false;
  const cases=new Set<string>();
  const natural=(n:unknown)=>typeof n==='number' && Number.isSafeInteger(n) && n>=0;
  for (const proof of value) {
    if (!proof || ![1,2].includes(proof.speed) || ![0,120,1800,-1].includes(proof.pause)) return false;
    cases.add(`${proof.speed}:${proof.pause}`);
    if (!natural(proof.ticks) || !natural(proof.nodes) || !natural(proof.unproductive) || !natural(proof.peakSlots) || proof.peakSlots>5) return false;
    if (!Array.isArray(proof.decisions) || !proof.decisions.length || !proof.decisions.every((d:Proof['decisions'][number])=>
      d && natural(d.bucketId) && natural(d.collected) && typeof d.exposed==='boolean' && Array.isArray(d.completed) && d.completed.every(natural))) return false;
  }
  return cases.size===8;
}

export function readVerified(file: URL, key: string): Proof[] | undefined {
  try {
    const saved=JSON.parse(readFileSync(file,'utf8'));
    if (saved.key===key && validProofs(saved.proofs) && saved.checksum===digest(JSON.stringify([key,saved.proofs]))) return saved.proofs;
  } catch { /* Missing, interrupted or invalid certificates are checked again. */ }
}

export function writeVerified(file: URL, key: string, proofs: Proof[]): void {
  if (!validProofs(proofs)) throw Error('Неполный набор доказательств');
  const temp=new URL(`${file.href}.${process.pid}.tmp`);
  writeFileSync(temp,JSON.stringify({key,proofs,checksum:digest(JSON.stringify([key,proofs]))}));
  renameSync(temp,file);
}
