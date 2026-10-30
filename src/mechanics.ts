import type { BucketSpec } from './game';

export interface Queue { cell: number; buckets: BucketSpec[] }
export interface Platform { cells: number[]; next: BucketSpec[] }
export interface Bridge { cells: number[]; passage: number[] }
export interface Gate { cells: number[]; key: number }
export interface Lid { x: number; y: number; width: number; height: number; key: number }
export interface Mechanics {
  queues: Queue[];
  platforms: Platform[];
  bridges: Bridge[];
  trays: number[][];
  gates: Gate[];
  lids: Lid[];
  links: number[][];
}
export function emptyMechanics(): Mechanics {
  return { queues: [], platforms: [], bridges: [], trays: [], gates: [], lids: [], links: [] };
}
export const MECHANIC_NAMES = ['Очередь', 'Ключ и замок', 'Платформа', 'Поднос', 'Мост', 'Связанные ведра', 'Крышка', 'Смена цвета'];
export const MECHANIC_HINTS = [
  'В очереди до пяти ведер. Следующие цвета видны у основания.',
  'Заполни ведро с ключом — откроется отмеченный проход.',
  'Отправь все ведра с подноса, чтобы появился следующий слой.',
  'После каждой отправки поднос поворачивается по часовой стрелке.',
  'Отправь все ведра с моста, чтобы открыть нижний проход.',
  'Нажми доступное ведро пары — за ним уйдёт и закрытое. Если свободно одно место, уходит нажатое ведро и цепь разрывается.',
  'Заполни ведро с ромбом, чтобы освободить песок под крышкой.',
  'Два ведра с одинаковой меткой ⇄ обмениваются цветами после каждого хода. У них одинаковая вместимость. После отправки одного оба сохраняют текущие цвета.',
];
