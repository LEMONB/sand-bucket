export const CAMPAIGN_COUNT = 400;
export const CAMPAIGN_VERSION = 1;
export const CAMPAIGN_DIFFICULTIES = ['Знакомство', 'Развитие', 'Сочетание', 'Испытание', 'Передышка'];
export function campaignPhase(number: number): number { return (number - 1) % 5; }
export function campaignKinds(number: number): number[] {
  const wave = Math.floor((number - 1) / 5), phase = campaignPhase(number);
  if (!wave || phase === 4) return [];
  const focus = (wave - 1) % 8;
  const kinds = [focus];
  if (wave > 1 && phase >= 2) {
    const second = wave <= 8 ? focus - 1 : (focus + 5) % 8;
    kinds.push(second);
  }
  return kinds.filter(kind=>kind!==4);
}
export function campaignColumns(number: number): number {
  return [6, 7, 7, 8, 6][campaignPhase(number)] + Number(number > 200);
}

export function campaignRows(number: number): number {
  return campaignColumns(number) - 3;
}
