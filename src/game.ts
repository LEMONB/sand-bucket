export const WIDTH = 128;
export const HEIGHT = 128;
export const FIELD_COLUMNS = 4;
export const BELT_LIMIT = 5;
export const LOOP_TICKS = 360;
export const COLLECTION_DEPTH = 5;
export const LAUNCH_TICKS = 36;
export const PALETTE = ['#000000', '#51b8ad', '#ed846e', '#f4cf73', '#b8acd6', '#557ccb', '#84ad53', '#e5b943', '#d370aa'];
export const COLOR_NAMES = ['', 'Мятное', 'Коралловое', 'Золотое', 'Сиреневое', 'Синее', 'Зелёное', 'Жёлтое', 'Розовое'];

export interface BucketSpec {
  id: number;
  color: number;
  capacity: number;
  swapWith?: number;
  hidden?: boolean;
}

export interface Level {
  cells: Uint8Array;
  field: (BucketSpec | null)[];
  columns?: number;
  walls?: number[];
  mechanics?: Mechanics;
  palette?: string[];
}

export interface Bucket extends BucketSpec {
  filled: number;
  arrivalTick: number;
}

export type Status = 'playing' | 'won' | 'lost';
export type LaunchResult = 'ok' | 'full' | 'blocked' | 'empty' | 'finished';
export type Speed = 1 | 2;

export interface GameEvent {
  type: 'launch' | 'arrive' | 'complete' | 'collect';
  tick: number;
  motionTick?: number;
  slot: number;
  bucket: Bucket;
  path?: number[];
  from?: { x: number; y: number };
  amount?: number;
  partnerId?: number;
}

export function exitPaths(field: readonly (BucketSpec | null)[], columns = FIELD_COLUMNS, walls: ReadonlySet<number> = new Set()): Map<number, number[]> {
  const paths = new Map<number, number[]>();
  const parents = new Int16Array(field.length).fill(-2);
  const pending: number[] = [];
  for (let i = 0; i < columns; i++) { pending.push(i); parents[i] = -1; }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const index = pending[cursor];
    if (walls.has(index)) continue;
    if (field[index]) {
      const path = [index];
      while (parents[path[path.length - 1]] !== -1) path.push(parents[path[path.length - 1]]);
      paths.set(index, path);
      continue;
    }
    const x = index % columns;
    for (const next of [index - columns, index + columns, x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1]) {
      if (next >= 0 && next < field.length && parents[next] === -2) {
        parents[next] = index; pending.push(next);
      }
    }
  }
  return paths;
}

export function accessibleCells(field: readonly (BucketSpec | null)[], columns = FIELD_COLUMNS, walls: ReadonlySet<number> = new Set()): Set<number> {
  return new Set(exitPaths(field, columns, walls).keys());
}

export class Game {
  readonly columns: number;
  readonly rows: number;
  readonly walls: Set<number>;
  readonly mechanics: Mechanics;
  readonly palette: string[];
  readonly revealed = new Set<number>();
  readonly held = new Uint8Array(WIDTH * HEIGHT);
  fieldRevision = 0;
  turns = 0;
  busyUntil = 0;
  private pendingField = false;
  readonly events: GameEvent[] = [];
  paths: Map<number, number[]>;
  private settled = false;
  private readonly activeRows = new Uint8Array(HEIGHT).fill(1);
  readonly cells: Uint8Array;
  readonly field: (BucketSpec | null)[];
  readonly slots: (Bucket | null)[] = Array(BELT_LIMIT).fill(null);
  readonly total: number;
  collected = 0;
  tick = 0;
  motionTick = 0;
  status: Status = 'playing';
  revision = 0;

  constructor(level: Level) {
    this.columns = level.columns ?? FIELD_COLUMNS;
    this.rows = level.field.length / this.columns;
    this.walls = new Set(level.walls ?? []);
    this.mechanics = structuredClone(level.mechanics ?? emptyMechanics());
    this.palette = level.palette ? [...level.palette] : [...PALETTE];
    if (this.palette.length !== PALETTE.length || this.palette.some(c => !/^#[0-9a-f]{6}$/i.test(c))) throw new Error('Неверная палитра');
    if (!Number.isInteger(this.columns) || this.columns < 4 || this.columns > 9 || !Number.isInteger(this.rows) || this.rows < 3 || this.rows > 7 ||
        level.cells.length !== WIDTH * HEIGHT) {
      throw new Error('Неверный размер уровня');
    }
    if ([...this.walls].some(i => !Number.isInteger(i) || i < 0 || i >= level.field.length || level.field[i] !== null)) {
      throw new Error('Неверные стены уровня');
    }
    const sand = Array(PALETTE.length).fill(0);
    const space = Array(PALETTE.length).fill(0);
    const ids = new Set<number>();
    for (const color of level.cells) {
      if (color >= PALETTE.length) {
        throw new Error('Неизвестный цвет песка');
      }
      sand[color]++;
    }
    const allBuckets = [...level.field, ...this.mechanics.queues.flatMap(q => q.buckets), ...this.mechanics.platforms.flatMap(p => p.next)];
    for (const bucket of allBuckets) {
      if (!bucket) continue;
      if (!Number.isInteger(bucket.id) || bucket.id < 0 || ids.has(bucket.id) ||
          !Number.isInteger(bucket.color) || bucket.color < 1 || bucket.color >= PALETTE.length ||
          !Number.isInteger(bucket.capacity) || bucket.capacity <= 0 ||
          (bucket.hidden !== undefined && typeof bucket.hidden !== 'boolean') ||
          (bucket.swapWith !== undefined && (!Number.isInteger(bucket.swapWith) || bucket.swapWith < 0 || bucket.swapWith === bucket.id))) {
        throw new Error('Неверные параметры ведра');
      }
      ids.add(bucket.id);
      space[bucket.color] += bucket.capacity;
    }
    if (sand.slice(1).some((count,i)=>count!==space[i+1])) {
      throw new Error('Количество песка не совпадает с вместимостью вёдер');
    }
    for(const bucket of allBuckets)if(bucket?.swapWith!==undefined){
      const partner=level.field.find(b=>b?.id===bucket.swapWith);
      if(!level.field.includes(bucket)||!partner||partner.swapWith!==bucket.id||partner.capacity!==bucket.capacity||partner.color===bucket.color)
        throw new Error('Неверная пара переключателей');
    }
    this.cells = level.cells.slice();
    this.field = level.field.map((bucket) => bucket ? { ...bucket } : null);
    this.validateMechanics(ids);
    this.paths = new Map();
    this.refreshField();
    this.total = sand.slice(1).reduce((a, b) => a + b, 0);
    if (!this.total) this.status = 'won';
  }

  private validateMechanics(ids: Set<number>): void {
    const used = new Set<number>();
    const region = (cells: number[]) => {
      if (!cells.length || new Set(cells).size!==cells.length || cells.some(i => !Number.isInteger(i) || i < 0 || i >= this.field.length || used.has(i) || this.walls.has(i))) throw new Error('Пересекающиеся или неверные области');
      cells.forEach(i => used.add(i));
    };
    for (const q of this.mechanics.queues) {
      if(q.hidden !== undefined && typeof q.hidden !== 'boolean')throw Error('Неверная видимость очереди');
      region([q.cell]);
      if (!this.field[q.cell] || q.buckets.length < 1 || q.buckets.length > 4) throw new Error('Неверная очередь');
    }
    for (const p of this.mechanics.platforms) {
      if(p.hidden !== undefined && typeof p.hidden !== 'boolean')throw Error('Неверная видимость платформы');
      region(p.cells);
      if (p.cells.length !== p.next.length || p.cells.some(i => !this.field[i])) throw new Error('Неверная платформа');
    }
    for (const t of this.mechanics.trays) {
      region(t);
      const [a,b,c,d] = t;
      if (t.length !== 4 || a % this.columns === this.columns-1 || b !== a+1 || c !== b+this.columns || d !== a+this.columns || t.some(i => this.walls.has(i) || this.field[i]?.swapWith!==undefined)) throw new Error('Неверный поднос');
    }
    for (const g of this.mechanics.gates) { region(g.cells); if (!ids.has(g.key) || g.cells.some(i=>this.field[i])) throw new Error('Неверный замок'); }
    const linked = new Set<number>();
    for (const pair of this.mechanics.links) {
      if (pair.length !== 2 || pair.some(id => !ids.has(id) || linked.has(id))) throw new Error('Неверная пара');
      pair.forEach(id => linked.add(id));
      if (new Set(pair).size !== 2 || pair.some(id=>!this.field.some((b,i)=>b?.id===id&&!used.has(i)))) throw new Error('Пара пересекает область');
    }
    for (const lid of this.mechanics.lids) {
      if (!ids.has(lid.key) || [lid.x,lid.y,lid.width,lid.height].some(v=>!Number.isInteger(v)) || lid.x<0 || lid.y<0 || lid.width<1 || lid.height<1 || lid.x+lid.width>WIDTH || lid.y+lid.height>HEIGHT) throw new Error('Неверная крышка');
      for(let y=lid.y;y<lid.y+lid.height;y++) for(let x=lid.x;x<lid.x+lid.width;x++) {
        const i=y*WIDTH+x;
        if(this.held[i]) throw new Error('Пересекающиеся крышки');
        this.held[i]=1;
      }
    }
  }

  refreshField(): void {
    const walls = new Set(this.walls);
    this.mechanics.gates.forEach(g=>g.cells.forEach(i=>walls.add(i)));
    this.paths = exitPaths(this.field, this.columns, walls);
    for(const index of this.paths.keys())this.revealed.add(this.field[index]!.id);
    this.fieldRevision++;
  }

  isHidden(bucket: BucketSpec): boolean {
    return bucket.hidden === true && !this.revealed.has(bucket.id);
  }

  clone(): Game {
    return Object.assign(Object.create(Game.prototype) as Game, structuredClone(this));
  }

  private finishFieldMove(): void {
    for (const q of this.mechanics.queues) if (!this.field[q.cell] && q.buckets.length) this.field[q.cell] = q.buckets.shift()!;
    for (const p of this.mechanics.platforms) if (p.next.length && p.cells.every(i=>!this.field[i])) {
      p.cells.forEach((i,j)=>{this.field[i]=p.next[j];}); p.next=[];
    }
    for (const cells of this.mechanics.trays) {
      const buckets=cells.map(i=>this.field[i]);
      cells.forEach((i,j)=>{this.field[i]=buckets[(j+3)%4];});
    }
    for(const bucket of this.field)if(bucket?.swapWith!==undefined&&bucket.id<bucket.swapWith){
      const partner=this.field.find(b=>b?.id===bucket.swapWith)!;
      [bucket.color,partner.color]=[partner.color,bucket.color];
    }
    this.pendingField=false; this.refreshField();
  }

  private unlock(id: number): void {
    const before=this.mechanics.gates.length+this.mechanics.lids.length;
    this.mechanics.gates=this.mechanics.gates.filter(g=>g.key!==id);
    this.mechanics.lids=this.mechanics.lids.filter(l=>{
      if(l.key!==id)return true;
      for(let y=l.y;y<l.y+l.height;y++)this.held.fill(0,y*WIDTH+l.x,y*WIDTH+l.x+l.width);
      this.activeRows.fill(1,Math.max(0,l.y-1),l.y+l.height);
      this.settled=false; return false;
    });
    if(before!==this.mechanics.gates.length+this.mechanics.lids.length)this.refreshField();
  }

  get buckets(): Bucket[] {
    return this.slots.filter((bucket): bucket is Bucket => bucket !== null);
  }

  /** Shared phase and fixed offsets keep all five slots evenly spaced. */
  slotPosition(slot: number): number {
    return ((this.tick % LOOP_TICKS) / LOOP_TICKS + slot / BELT_LIMIT) % 1;
  }

  launch(bucketId: number): LaunchResult {
    if (this.status !== 'playing') return 'finished';
    if (this.motionTick < this.busyUntil) return 'blocked';
    const index = this.field.findIndex((bucket) => bucket?.id === bucketId);
    if (index < 0) return 'empty';
    if (!this.paths.has(index)) return 'blocked';
    const slot = this.slots.indexOf(null);
    if (slot < 0) return 'full';
    const pair=this.mechanics.links.find(p=>p.includes(bucketId));
    const partner=pair?.find(id=>id!==bucketId);
    const partnerIndex=pair?this.field.findIndex(b=>b?.id===partner):-1;
    const indexes=[index];
    if(partnerIndex>=0&&this.slots.filter(b=>!b).length>=2) indexes.push(partnerIndex);
    if(pair)this.mechanics.links=this.mechanics.links.filter(p=>p!==pair);
    for(const position of indexes) {
      const departing=this.field[position]!;
      if(departing.swapWith!==undefined){
        const partner=this.field.find(b=>b?.id===departing.swapWith)!;
        delete partner.swapWith;delete departing.swapWith;
      }
      const free=this.slots.indexOf(null);
      this.slots[free]={...this.field[position]!,filled:0,arrivalTick:this.motionTick+LAUNCH_TICKS};
      this.events.push({type:'launch',tick:this.tick,motionTick:this.motionTick,slot:free,bucket:{...this.slots[free]},path:this.paths.get(position)??[position,...this.paths.get(index)!],partnerId:indexes.length===2?pair?.find(id=>id!==this.slots[free]!.id):undefined});
      this.field[position]=null;
    }
    this.turns++;
    const changes=this.mechanics.queues.length+this.mechanics.platforms.length+this.mechanics.trays.length+Number(this.field.some(b=>b?.swapWith!==undefined));
    if(changes) { this.pendingField=true; this.busyUntil=this.motionTick+LAUNCH_TICKS+10; }
    this.refreshField();
    return 'ok';
  }

  step(motionDelta=1): void {
    if (this.status !== 'playing') return;
    this.tick++;
    const previousMotion=this.motionTick;this.motionTick+=motionDelta;
    if(this.pendingField && this.motionTick>=this.busyUntil-10)this.finishFieldMove();
    let changed = false;
    for (let slot = 0; slot < BELT_LIMIT; slot++) {
      const bucket = this.slots[slot];
      if (!bucket || this.motionTick < bucket.arrivalTick) continue;
      if (previousMotion < bucket.arrivalTick && this.motionTick >= bucket.arrivalTick) this.events.push({ type: 'arrive', tick: this.tick, slot, bucket: { ...bucket } });
      const beforeFill = bucket.filled;
      let sourceX = 0, sourceY = 0;
      const center = Math.floor(this.slotPosition(slot) * WIDTH);
      for (let y = HEIGHT - 1; y >= HEIGHT - COLLECTION_DEPTH && bucket.filled < bucket.capacity; y--) {
        for (let x = Math.max(0, center - 7); x <= Math.min(WIDTH - 1, center + 7) && bucket.filled < bucket.capacity; x++) {
          const index = y * WIDTH + x;
          if (!this.held[index] && this.cells[index] === bucket.color) {
            sourceX += x; sourceY += y;
            this.cells[index] = 0;
            this.activeRows[y]=1;
            if(y>0)this.activeRows[y-1]=1;
            bucket.filled++;
            this.collected++;
            changed = true;
          }
        }
      }
      const amount = bucket.filled - beforeFill;
      if (amount) this.events.push({ type: 'collect', tick: this.tick, slot, bucket: { ...bucket }, amount, from: { x: (sourceX / amount + .5) / WIDTH, y: (sourceY / amount + .5) / HEIGHT } });
      if (bucket.filled === bucket.capacity) {
        this.events.push({ type: 'complete', tick: this.tick, slot, bucket: { ...bucket } });
        this.slots[slot] = null;
        this.unlock(bucket.id);
      }
    }

    const collected = changed;
    let moved = false;
    if (!this.settled || collected) {
      // Bottom-up traversal lets each grain move at most one row per simulation tick.
      for (let y = HEIGHT - 2; y >= 0; y--) {
        if(!this.activeRows[y])continue;
        this.activeRows[y]=0;
        for (let i = 0; i < WIDTH; i++) {
          const x = this.tick % 2 ? i : WIDTH - 1 - i;
          const index = y * WIDTH + x;
          if (this.cells[index] === 0 || this.held[index]) continue;
          let target = index + WIDTH;
          if (this.cells[target] !== 0 || this.held[target]) {
            const direction = (x + this.tick) % 2 ? 1 : -1;
            if (x + direction >= 0 && x + direction < WIDTH && this.cells[target + direction] === 0 && !this.held[target+direction]) {
              target += direction;
            } else if (x - direction >= 0 && x - direction < WIDTH && this.cells[target - direction] === 0 && !this.held[target-direction]) {
              target -= direction;
            } else {
              continue;
            }
          }
          this.cells[target] = this.cells[index];
          this.cells[index] = 0;
          this.activeRows[y]=this.activeRows[y+1]=1;
          if(y>0)this.activeRows[y-1]=1;
          changed = true;
          moved = true;
        }
      }
      this.settled = !moved;
    }
    if (changed) this.revision++;
    if (this.collected === this.total) {
      this.status = 'won';
    } else if (this.settled && !this.pendingField && !this.slots.some(b=>b&&b.arrivalTick>this.motionTick)) {
      const free=this.slots.filter(b=>!b).length;
      const canLaunch=free>0&&this.paths.size>0;
      if(!canLaunch){
        const colors=new Set(this.slots.filter(b=>b).map(b=>b!.color));
        let canCollect=false;
        for(let i=(HEIGHT-COLLECTION_DEPTH)*WIDTH;i<this.cells.length&&!canCollect;i++)
          canCollect=!this.held[i]&&colors.has(this.cells[i]);
        if(!canCollect)this.status='lost';
      }
    }
  }
}

/** Speed changes physics frequency; bucket travel always uses the same real-time clock. */
export function advanceFrame(game: Game, seconds: number, speed: Speed, remainder: number): number {
  remainder += Math.max(0, Math.min(seconds, 0.1)) * speed;
  while (remainder + 1e-10 >= 1 / 60) {
    game.step(2/speed);
    remainder -= 1 / 60;
  }
  return Math.max(0, remainder);
}
import { emptyMechanics, type Mechanics } from './mechanics.ts';
