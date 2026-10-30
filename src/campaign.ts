import catalogData from './levels/campaign.json';
import { catalogArtwork, artworkPalette } from './art-catalog';
import { CAMPAIGN_COUNT, CAMPAIGN_VERSION } from './campaign-rules';
import type { CampaignCatalog, CampaignLevel } from './campaign-types';
import type { Level } from './game';
const catalog=catalogData as CampaignCatalog;
if(catalog.version!==CAMPAIGN_VERSION||catalog.levels.length!==CAMPAIGN_COUNT)throw Error('Неполный каталог кампании');
export function campaignLevel(number:number):CampaignLevel {
  if(!Number.isSafeInteger(number)||number<1||number>CAMPAIGN_COUNT)throw Error('Неверный номер уровня');
  const level=catalog.levels[number-1];
  if(level.number!==number||level.art!==(number-1)%100)throw Error('Нарушен порядок кампании');
  return structuredClone(level);
}
export function playableLevel(record:CampaignLevel):Level {
  return {...record,cells:catalogArtwork(record.art),palette:artworkPalette(record.art)};
}
