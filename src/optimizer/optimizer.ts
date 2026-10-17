// Auto-seat optimizer: greedy constraint-aware construction followed by simulated annealing.
// Pure and synchronous so it can run in a Web Worker and in unit tests.
import { tablesNearby } from '../rules/conflicts';
import type { Guest, Rule, Table } from '../model/types';

export interface OptimizerOptions {
  /** 'fill' keeps everyone currently seated in place; 'all' re-plans every unlocked guest. */
  mode: 'fill' | 'all';
  includePending: boolean;
  /** 0..2 */
  groupWeight: number;
  /** 0..2 */
  balanceWeight: number;
  /** group ids that should be spread out rather than kept together */
  mixGroups: string[];
  seed?: number;
  iterations?: number;
}

export interface OptimizerInput {
  guests: Pick<
    Guest,
    'id' | 'groupId' | 'partyId' | 'locked' | 'tableId' | 'seat' | 'rsvp' | 'firstName' | 'lastName'
  >[];
  tables: Pick<Table, 'id' | 'name' | 'capacity' | 'locked' | 'x' | 'y' | 'w' | 'h' | 'shape'>[];
  rules: Rule[];
  options: OptimizerOptions;
}

export interface OptimizerResult {
  assignments: Record<string, { tableId: string; seat: number } | null>;
  score: number;
  breakdown: { rules: number; groups: number; balance: number; seated: number };
  issues: string[];
  stats: {
    placed: number;
    unplaced: number;
    rulesTotal: number;
    rulesBroken: number;
    iterations: number;
    ms: number;
  };
}

type Progress = (fraction: number) => void;

const HARD = 1000;
const UNSEATED = 4000;
const PARTY_SPLIT = 150;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Unit {
  guests: string[];
  size: number;
  /** [groupIndex, count] */
  comp: [number, number][];
}

/** A pairwise constraint between two "endpoints": a unit index (>=0) or a fixed table (-(t+1)). */
interface WRule {
  a: number;
  b: number;
  kind: 'together' | 'apart';
  scope: 'table' | 'nearby';
  weight: number;
  label: string;
}

export function optimize(input: OptimizerInput, onProgress?: Progress): OptimizerResult {
  const t0 = Date.now();
  const { options } = input;
  const rand = mulberry32(options.seed ?? 12345);
  const guestById = new Map(input.guests.map((g) => [g.id, g]));
  const name = (id: string) => {
    const g = guestById.get(id);
    return g ? `${g.firstName} ${g.lastName}`.trim() : 'Someone';
  };
  const tables = input.tables;
  const T = tables.length;
  const tIndex = new Map(tables.map((t, i) => [t.id, i]));
  const BIN = T; // "not seated" pseudo-table

  const seatable = (g: OptimizerInput['guests'][number]) =>
    g.rsvp === 'attending' || (options.includePending && g.rsvp === 'pending');

  // ---- fixed guests (locked, at locked tables, or kept in 'fill' mode)
  const fixedTable = new Map<string, number>();
  const fixedSeats: Set<number>[] = tables.map(() => new Set());
  for (const g of input.guests) {
    if (!g.tableId || g.seat == null || !tIndex.has(g.tableId)) continue;
    const ti = tIndex.get(g.tableId)!;
    const t = tables[ti];
    if (g.locked || t.locked || options.mode === 'fill' || !seatable(g)) {
      fixedTable.set(g.id, ti);
      fixedSeats[ti].add(g.seat);
    }
  }
  const free = tables.map((t, i) =>
    t.locked ? 0 : Math.max(0, t.capacity - [...fixedSeats[i]].filter((s) => s < t.capacity).length),
  );

  // ---- groups
  const groupIds = [...new Set(input.guests.map((g) => g.groupId).filter((x): x is string => !!x))];
  const G = groupIds.length;
  const gIndex = new Map(groupIds.map((g, i) => [g, i]));
  const mix = groupIds.map((g) => options.mixGroups.includes(g));

  // ---- units: households of guests to place
  const toPlace = input.guests.filter((g) => seatable(g) && !fixedTable.has(g.id));
  const partyMap = new Map<string, string[]>();
  const units: Unit[] = [];
  const issues: string[] = [];
  for (const g of toPlace) {
    if (g.partyId) {
      const arr = partyMap.get(g.partyId);
      if (arr) arr.push(g.id);
      else partyMap.set(g.partyId, [g.id]);
    } else units.push(makeUnit([g.id]));
  }
  const maxFree = Math.max(0, ...free);
  const splitParties: string[][] = [];
  for (const ids of partyMap.values()) {
    if (ids.length <= maxFree) units.push(makeUnit(ids));
    else {
      splitParties.push(ids);
      for (const id of ids) units.push(makeUnit([id]));
      issues.push(`${ids.map(name).join(', ')} had to be split: no table has ${ids.length} free seats.`);
    }
  }
  function makeUnit(ids: string[]): Unit {
    const comp = new Map<number, number>();
    for (const id of ids) {
      const gi = guestById.get(id)?.groupId;
      if (gi != null && gIndex.has(gi)) comp.set(gIndex.get(gi)!, (comp.get(gIndex.get(gi)!) ?? 0) + 1);
    }
    return { guests: ids, size: ids.length, comp: [...comp] };
  }
  const U = units.length;
  const unitOf = new Map<string, number>();
  units.forEach((u, i) => u.guests.forEach((id) => unitOf.set(id, i)));

  // ---- weighted rules
  const endpoint = (id: string): number | null => {
    if (unitOf.has(id)) return unitOf.get(id)!;
    if (fixedTable.has(id)) return -(fixedTable.get(id)! + 1);
    return null; // not attending -> rule irrelevant
  };
  const wrules: WRule[] = [];
  let rulesTotal = 0;
  for (const r of input.rules) {
    const a = endpoint(r.a);
    const b = endpoint(r.b);
    if (a == null || b == null) continue;
    rulesTotal++;
    const label =
      r.kind === 'together'
        ? `${name(r.a)} & ${name(r.b)} together${r.scope === 'nearby' ? ' (nearby)' : ''}`
        : `${name(r.a)} & ${name(r.b)} apart${r.scope === 'nearby' ? ' (not nearby)' : ''}`;
    if (a === b) {
      if (r.kind === 'apart')
        issues.push(`Can't keep ${name(r.a)} and ${name(r.b)} apart — they are in the same household.`);
      continue;
    }
    if (a < 0 && b < 0) continue; // both fixed; nothing we can do
    wrules.push({ a, b, kind: r.kind, scope: r.scope, weight: HARD, label });
  }
  // split households and households partly fixed elsewhere want to be together
  for (const ids of splitParties) {
    for (let i = 1; i < ids.length; i++)
      wrules.push({
        a: unitOf.get(ids[0])!,
        b: unitOf.get(ids[i])!,
        kind: 'together',
        scope: 'table',
        weight: PARTY_SPLIT,
        label: '',
      });
  }
  for (const g of toPlace) {
    if (!g.partyId) continue;
    const fixedMate = input.guests.find((m) => m.partyId === g.partyId && fixedTable.has(m.id));
    if (fixedMate)
      wrules.push({
        a: unitOf.get(g.id)!,
        b: endpoint(fixedMate.id)!,
        kind: 'together',
        scope: 'table',
        weight: PARTY_SPLIT,
        label: '',
      });
  }
  const rulesOfUnit: number[][] = units.map(() => []);
  wrules.forEach((r, i) => {
    if (r.a >= 0) rulesOfUnit[r.a].push(i);
    if (r.b >= 0 && r.b !== r.a) rulesOfUnit[r.b].push(i);
  });

  const near: boolean[][] = tables.map((a) => tables.map((b) => a === b || tablesNearby(a, b)));

  // ---- state
  const tableOf = new Int32Array(U).fill(BIN);
  const used = new Int32Array(T + 1); // seats used by placed units
  const counts = new Float64Array((T + 1) * Math.max(1, G)); // group counts per table (fixed + placed)
  const groupSize = new Float64Array(Math.max(1, G));
  for (const g of input.guests) {
    if (!g.groupId || !gIndex.has(g.groupId)) continue;
    const gi = gIndex.get(g.groupId)!;
    if (fixedTable.has(g.id)) {
      counts[fixedTable.get(g.id)! * G + gi]++;
      groupSize[gi]++;
    } else if (unitOf.has(g.id)) groupSize[gi]++;
  }
  const totalCap = free.reduce((a, b) => a + b, 0);
  const totalNeed = units.reduce((a, u) => a + u.size, 0);
  const fixedCount = fixedSeats.map((s) => s.size);
  const capAll = tables.map((t) => (t.locked ? 0 : t.capacity));
  const mu = Math.min(
    1,
    (totalNeed + fixedCount.reduce((a, b, i) => a + (tables[i].locked ? 0 : b), 0)) /
      Math.max(
        1,
        capAll.reduce((a, b) => a + b, 0),
      ),
  );
  const gw = options.groupWeight * 20;
  const bw = options.balanceWeight * 6;

  const tableOfEndpoint = (e: number) => (e >= 0 ? tableOf[e] : -e - 1);
  function ruleCost(r: WRule): number {
    const ta = tableOfEndpoint(r.a);
    const tb = tableOfEndpoint(r.b);
    if (ta === BIN || tb === BIN) return 0;
    const same = ta === tb;
    const nb = same || near[ta][tb];
    const bad = r.kind === 'together' ? (r.scope === 'table' ? !same : !nb) : r.scope === 'table' ? same : nb;
    return bad ? r.weight : 0;
  }
  // group cost for one (table, group) cell
  function cellCost(t: number, gi: number): number {
    if (t === BIN) return 0;
    const c = counts[t * G + gi];
    const n = groupSize[gi];
    if (n < 2) return 0;
    return mix[gi] ? (gw * (c * (c - 1))) / 2 / n : (gw * c * (n - c)) / 2 / n;
  }
  function balanceCost(t: number): number {
    if (t === BIN || capAll[t] === 0) return 0;
    const occ = (used[t] + fixedCount[t]) / capAll[t];
    return bw * capAll[t] * (occ - mu) * (occ - mu);
  }
  const binCost = (t: number, size: number) => (t === BIN ? UNSEATED * size : 0);

  /** Cost delta of moving the given units to the given tables (simultaneously). */
  function moveDelta(moves: [number, number][]): number {
    const touchedT = new Set<number>();
    const touchedCells = new Set<number>();
    const touchedRules = new Set<number>();
    for (const [u, to] of moves) {
      touchedT.add(tableOf[u]);
      touchedT.add(to);
      for (const [gi] of units[u].comp) {
        touchedCells.add(tableOf[u] * G + gi);
        touchedCells.add(to * G + gi);
      }
      for (const r of rulesOfUnit[u]) touchedRules.add(r);
    }
    const local = () => {
      let c = 0;
      for (const t of touchedT) c += balanceCost(t);
      for (const cell of touchedCells) c += cellCost(Math.floor(cell / G), cell % G);
      for (const r of touchedRules) c += ruleCost(wrules[r]);
      for (const [u] of moves) c += binCost(tableOf[u], units[u].size);
      return c;
    };
    const before = local();
    const prev = moves.map(([u]) => tableOf[u]);
    for (const [u, to] of moves) apply(u, to);
    const after = local();
    moves.forEach(([u], i) => apply(u, prev[i]));
    return after - before;
  }
  function apply(u: number, to: number) {
    const from = tableOf[u];
    if (from === to) return;
    const unit = units[u];
    used[from] -= unit.size;
    used[to] += unit.size;
    for (const [gi, n] of unit.comp) {
      counts[from * G + gi] -= n;
      counts[to * G + gi] += n;
    }
    tableOf[u] = to;
  }
  for (const u of units) used[BIN] += u.size;
  for (const u of units) for (const [gi, n] of u.comp) counts[BIN * G + gi] += n;
  const room = (t: number) => (t === BIN ? Infinity : free[t] - used[t]);

  // ---- construction: most constrained units first
  const order = units
    .map((_, i) => i)
    .sort(
      (a, b) =>
        rulesOfUnit[b].length - rulesOfUnit[a].length || units[b].size - units[a].size || rand() - 0.5,
    );
  order.forEach((u, k) => {
    let best = BIN;
    let bestD = Infinity;
    for (let t = 0; t < T; t++) {
      if (room(t) < units[u].size) continue;
      const d = moveDelta([[u, t]]);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    apply(u, best);
    if (k % 50 === 0) onProgress?.((0.15 * k) / Math.max(1, U));
  });

  // ---- simulated annealing
  const iterations = options.iterations ?? Math.min(250_000, Math.max(20_000, U * 400));
  let temp = 50;
  const tEnd = 0.05;
  const cool = Math.pow(tEnd / temp, 1 / iterations);
  for (let it = 0; it < iterations && U > 0 && T > 0; it++) {
    const u = Math.floor(rand() * U);
    const from = tableOf[u];
    let moves: [number, number][];
    if (rand() < 0.5) {
      const to = rand() < 0.03 ? BIN : Math.floor(rand() * T);
      if (to === from || room(to) < units[u].size) {
        temp *= cool;
        continue;
      }
      moves = [[u, to]];
    } else {
      const v = Math.floor(rand() * U);
      const tv = tableOf[v];
      if (v === u || tv === from) {
        temp *= cool;
        continue;
      }
      const du = units[u].size - units[v].size;
      if (room(tv) < du || room(from) < -du) {
        temp *= cool;
        continue;
      }
      moves = [
        [u, tv],
        [v, from],
      ];
    }
    const d = moveDelta(moves);
    if (d <= 0 || rand() < Math.exp(-d / temp)) for (const [x, to] of moves) apply(x, to);
    temp *= cool;
    if (it % 5000 === 0) onProgress?.(0.15 + (0.85 * it) / iterations);
  }

  // ---- seat ordering within tables: keep units contiguous, group-mates next to each other
  const assignments: OptimizerResult['assignments'] = {};
  for (const g of toPlace) assignments[g.id] = null;
  const byTable: number[][] = tables.map(() => []);
  for (let u = 0; u < U; u++) if (tableOf[u] !== BIN) byTable[tableOf[u]].push(u);
  byTable.forEach((us, t) => {
    const cap = tables[t].capacity;
    us.sort(
      (a, b) =>
        (units[a].comp[0]?.[0] ?? 999) - (units[b].comp[0]?.[0] ?? 999) || units[b].size - units[a].size,
    );
    const freeSeats: number[] = [];
    for (let s = 0; s < cap; s++) if (!fixedSeats[t].has(s)) freeSeats.push(s);
    let k = 0;
    for (const u of us)
      for (const id of units[u].guests) assignments[id] = { tableId: tables[t].id, seat: freeSeats[k++] };
  });

  // ---- scoring & explanation
  let broken = 0;
  for (const r of wrules) {
    if (r.weight === HARD && ruleCost(r) > 0) {
      broken++;
      issues.push(`Couldn't satisfy: ${r.label}.`);
    }
  }
  const unplaced = units.reduce((a, u, i) => a + (tableOf[i] === BIN ? u.size : 0), 0);
  if (unplaced > 0) {
    issues.push(
      totalNeed > totalCap
        ? `${unplaced} guest${unplaced === 1 ? '' : 's'} left unseated — you need ${totalNeed - totalCap} more seat${totalNeed - totalCap === 1 ? '' : 's'}.`
        : `${unplaced} guest${unplaced === 1 ? '' : 's'} left unseated — households couldn't fit in the remaining gaps. Try adding a table.`,
    );
  }
  // group cohesion: how many groupmates share your table vs the best possible
  let gSum = 0;
  let gN = 0;
  for (let gi = 0; gi < G; gi++) {
    if (mix[gi] || groupSize[gi] < 2) continue;
    for (let t = 0; t < T; t++) {
      const c = counts[t * G + gi];
      if (c <= 0) continue;
      const best = Math.min(groupSize[gi], tables[t].capacity) - 1;
      gSum += c * (best > 0 ? (c - 1) / best : 1);
      gN += c;
    }
  }
  const groupsScore = gN ? gSum / gN : 1;
  const fills = tables
    .map((_, i) => (capAll[i] ? (used[i] + fixedCount[i]) / capAll[i] : null))
    .filter((x): x is number => x != null);
  const sd = fills.length ? Math.sqrt(fills.reduce((a, f) => a + (f - mu) ** 2, 0) / fills.length) : 0;
  const balance = Math.max(0, 1 - sd * 2);
  const rulesScore = rulesTotal ? (rulesTotal - broken) / rulesTotal : 1;
  const seated = totalNeed ? (totalNeed - unplaced) / totalNeed : 1;
  const score = Math.round(100 * (0.4 * rulesScore + 0.3 * groupsScore + 0.15 * balance + 0.15 * seated));
  onProgress?.(1);
  return {
    assignments,
    score: broken > 0 ? Math.min(score, 89) : score,
    breakdown: { rules: rulesScore, groups: groupsScore, balance, seated },
    issues,
    stats: {
      placed: totalNeed - unplaced,
      unplaced,
      rulesTotal,
      rulesBroken: broken,
      iterations,
      ms: Date.now() - t0,
    },
  };
}
