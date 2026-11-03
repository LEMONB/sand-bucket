import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CampaignCatalog } from '../src/campaign-types.ts';
import { playableLevel } from '../src/campaign-art.ts';
import { CAMPAIGN_DIFFICULTIES, campaignPhase } from '../src/campaign-rules.ts';
import { MECHANIC_NAMES } from '../src/mechanic-help.ts';
import { CALIBRATION_LEVELS, POLICY_NAMES, probePolicy } from './campaign/difficulty-audit.ts';
import { replayDecisions } from './campaign/solver.ts';
import { playableKey, verificationHash, readVerified } from './campaign/verification.ts';
import { renderDifficultyReport, type DifficultyReview } from './campaign/difficulty-report.ts';

const root=new URL('../',import.meta.url),directory=new URL('.cache/difficulty/',root);
const source=readFileSync(new URL('src/levels/campaign.json',root),'utf8');
const catalog=JSON.parse(source) as CampaignCatalog;
const checkerHash=verificationHash(file=>readFileSync(new URL(file,root),'utf8'));
const results=[];
mkdirSync(directory,{recursive:true});
for(const number of CALIBRATION_LEVELS){
  const record=catalog.levels[number-1];assert.equal(record.number,number);
  const level=playableLevel(record),inputKey=playableKey(level);
  const key=createHash('sha256').update(checkerHash).update(inputKey).digest('hex');
  const proofs=readVerified(new URL(`.cache/playable/verified/${key}.json`,root),key);
  assert(proofs,`Нет актуальных решений уровня ${number}. Запустите campaign:verify-playable -- --levels ${CALIBRATION_LEVELS.join(',')}`);
  const replayed=proofs.map(proof=>replayDecisions(level,proof.decisions,proof.speed,proof.pause));
  const policies=([1,2] as const).flatMap(speed=>POLICY_NAMES.map((_,policy)=>probePolicy(level,speed,policy)));
  assert.equal(playableKey(level),inputKey,'Аудит изменил игровой уровень');
  results.push({number,current:CAMPAIGN_DIFFICULTIES[campaignPhase(number)],inputKey,
    mechanics:record.kinds.map(k=>MECHANIC_NAMES[k]),record,palette:level.palette,cells:[...level.cells],
    proofs:replayed,policies});
  console.log(JSON.stringify({number,current:results.at(-1)!.current,mechanics:results.at(-1)!.mechanics,
    reactiveWins:policies.filter(p=>p.outcome==='won').length,
    outcomes:policies.map(p=>p.outcome),moves:replayed[0].decisions.length,
    unproductive:replayed.map(p=>p.unproductive)}));
}
assert.equal(readFileSync(new URL('src/levels/campaign.json',root),'utf8'),source);
const report={catalogHash:createHash('sha256').update(source).digest('hex'),checkerHash,policyNames:POLICY_NAMES,results};
const reviews=JSON.parse(readFileSync(new URL('scripts/campaign/difficulty-reviews.json',root),'utf8')) as DifficultyReview[];
const html=renderDifficultyReport(results,reviews,report.catalogHash);
writeFileSync(new URL('evidence.json',directory),JSON.stringify(report));
writeFileSync(new URL('report.html',directory),html);
console.log('Report: .cache/difficulty/report.html; evidence: .cache/difficulty/evidence.json');
