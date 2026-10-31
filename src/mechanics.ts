import type { BucketSpec } from './game';

export interface Queue { cell: number; buckets: BucketSpec[]; hidden?: boolean }
export interface Platform { cells: number[]; next: BucketSpec[]; hidden?: boolean }
export interface Gate { cells: number[]; key: number }
export interface Lid { x: number; y: number; width: number; height: number; key: number }
export interface Mechanics {
  queues: Queue[];
  platforms: Platform[];
  // Legacy catalog field; mechanic ID 4 stays reserved for saved progress.
  bridges: { cells: number[]; passage: number[] }[];
  trays: number[][];
  gates: Gate[];
  lids: Lid[];
  links: number[][];
}
export function emptyMechanics(): Mechanics {
  return { queues: [], platforms: [], bridges: [], trays: [], gates: [], lids: [], links: [] };
}
export const MECHANIC_NAMES = ['Очередь', 'Ключ и замок', 'Платформа', 'Поднос', '', 'Связанные ведра', 'Крышка', 'Смена цвета', 'Скрытые цвета'];
export const MECHANIC_HINTS = [
  'В очереди до пяти ведер. Следующие ведра показаны у основания; знак ? скрывает цвет.',
  'Заполни ведро с ключом — откроется отмеченный проход.',
  'Отправь все ведра с платформы, чтобы появился следующий слой. Его цвета могут быть скрыты знаком ?.',
  'После каждой отправки поднос поворачивается по часовой стрелке.',
  '',
  'Нажми доступное ведро пары — за ним уйдёт и закрытое. Если свободно одно место, уходит нажатое ведро и цепь разрывается.',
  'Заполни ведро с ромбом, чтобы освободить песок под крышкой.',
  'Два ведра с одинаковой меткой ⇄ обмениваются цветами после каждого хода. У них одинаковая вместимость. После отправки одного оба сохраняют текущие цвета.',
  'Цвет ведра со знаком ? откроется, когда к нему появится свободный путь. В скрытых очередях и платформах цвета раскрываются при появлении вёдер. При повторе цвета те же.',
];
