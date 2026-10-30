import { writeFileSync } from 'node:fs';
import { generateLevel, seedFor } from '../src/generator.ts';
const levels=[];
for(let art=0;art<100;art++){
  for(let columns=4;columns<=7;columns++){
    let level;
    for(let attempt=0;attempt<8&&!level;attempt++){
      try{level=generateLevel(art+1,(seedFor(art+1)+attempt)>>>0,columns);}catch(error){if(attempt===7)throw new Error(`Картина ${art+1}, поле ${columns}×${columns}`,{cause:error});}
    }
    const {cells:_,...saved}=level!;
    levels.push(saved);
  }
  if(art%10===9)console.log(`${art+1}/100 картин: четыре размера поля проверены`);
}
writeFileSync(new URL('../src/levels/art-fallbacks.json', import.meta.url), JSON.stringify(levels)+'\n');
console.log('400 запасных уровней сохранены без дублирования пикселей.');
