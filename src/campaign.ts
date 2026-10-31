import catalogData from './levels/campaign.json';
import { CAMPAIGN_COUNT, CAMPAIGN_VERSION } from './campaign-rules';
import type { CampaignCatalog, CampaignLevel } from './campaign-types';
export { playableLevel } from './campaign-art';
const catalog=catalogData as CampaignCatalog;
if(catalog.version!==CAMPAIGN_VERSION||catalog.levels.length!==CAMPAIGN_COUNT)throw Error('Неполный каталог кампании');
export function campaignLevel(number:number):CampaignLevel {
  if(!Number.isSafeInteger(number)||number<1||number>CAMPAIGN_COUNT)throw Error('Неверный номер уровня');
  const level=catalog.levels[number-1];
  if(level.number!==number||level.art!==(number-1)%100)throw Error('Нарушен порядок кампании');
  return structuredClone(level);
}
