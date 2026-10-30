import type { BucketSpec } from './game';
import type { Mechanics } from './mechanics';
export interface CampaignLevel {
  number:number;
  art:number;
  seed:number;
  columns:number;
  walls:number[];
  field:(BucketSpec|null)[];
  mechanics?:Mechanics;
  kinds:number[];
  family:number;
}
export interface CampaignCatalog { version:number; fingerprint:string; levels:CampaignLevel[] }
