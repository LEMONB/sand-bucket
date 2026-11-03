import { expect, it } from 'vitest';
import { CALIBRATION_LEVELS, probePolicy, reactiveChoices } from '../scripts/campaign/difficulty-audit';
import { Game, HEIGHT, WIDTH, type Level } from '../src/game';
import { evidenceKey, renderDifficultyReport, type CalibrationEntry } from '../scripts/campaign/difficulty-report';
import { campaignLevel, playableLevel } from '../src/campaign';

function level():Level {
  const cells=new Uint8Array(WIDTH*HEIGHT);cells.fill(1,(HEIGHT-5)*WIDTH);
  const field:Level['field']=Array(16).fill(null);
  field[0]={id:0,color:1,capacity:WIDTH*5};
  return {cells,field};
}

it('uses the agreed four complete groups without duplicates',()=>{
  expect(CALIBRATION_LEVELS).toEqual([0,100,200,300].flatMap(n=>[1,2,3,4,5].map(i=>n+i)));
});

it.each([1,2] as const)('replays all reactive policies deterministically at speed %i without mutating the level',speed=>{
  const source=level(),before=structuredClone(source);
  for(let policy=0;policy<4;policy++){
    const result=probePolicy(source,speed,policy);
    expect(result.outcome).toBe('won');
    expect(result).toEqual(probePolicy(source,speed,policy));
  }
  expect(source).toEqual(before);
});

it('reports a search limit as unresolved, not a loss or an impossible level',()=>{
  expect(probePolicy(level(),1,0,1).outcome).toBe('unresolved');
});

it('waits rather than sending a duplicate color or a bucket for covered sand',()=>{
  const source=level();source.cells[0]=2;
  source.field[1]={id:1,color:2,capacity:1};
  const game=new Game(source);
  expect(reactiveChoices(game).map(b=>b.id)).toEqual([0]);
  game.launch(0);
  expect(reactiveChoices(game)).toEqual([]);
});

it('does not read a hidden linked partner to choose a departure',()=>{
  const game=new Game(level());
  const partner={id:1,color:1,capacity:1,hidden:true};
  game.field[4]=partner;game.mechanics.links.push([0,1]);
  expect(game.isHidden(partner)).toBe(true);
  expect(reactiveChoices(game)).toEqual([]);
});

it('invalidates review evidence when a policy outcome changes, but not when UI copy changes',()=>{
  const source={inputKey:'gameplay',proofs:[],policies:[probePolicy(level(),1,0)]} as unknown as CalibrationEntry;
  expect(evidenceKey({...source,current:'Новое название'})).toBe(evidenceKey(source));
  expect(evidenceKey({...source,policies:[{...source.policies[0],outcome:'unresolved'}]})).not.toBe(evidenceKey(source));
});

it('shows current evidence without reusing a stale difficulty rating',()=>{
  const record=campaignLevel(1),gameplay=playableLevel(record);
  const result:CalibrationEntry={number:1,current:'<script>',inputKey:'current',mechanics:[],record,
    palette:gameplay.palette,cells:[...gameplay.cells],
    proofs:[{speed:1,pause:0,decisions:[],ticks:0,peakSlots:0,unproductive:0,nodes:0}],policies:[]};
  const html=renderDifficultyReport([result],[{number:1,inputKey:'old',evidenceKey:'stale',proposed:'Старая категория',rationale:'Старое обоснование'}],'catalog');
  expect(html).toContain('Нужна новая оценка');
  expect(html).not.toContain('Старая категория');expect(html).not.toContain('Старое обоснование');
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
});
