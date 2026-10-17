import { HOUR, SETUP_MS, type Machine, type Maintenance, type Mold, type Order, type Plan, type Slot } from './types';

/* ------------------------------------------------------------------ */
/* Regra 1: duração = quantidade ÷ cavidades × ciclo, + 2 h de setup   */
/*          quando o molde muda em relação à alocação anterior.       */
/* ------------------------------------------------------------------ */

export function productionMs(order: Pick<Order, 'quantity'>, mold: Pick<Mold, 'cavities' | 'cycleSeconds'>): number {
  const shots = Math.ceil(order.quantity / mold.cavities);
  return shots * mold.cycleSeconds * 1000;
}

/** Sem alocação anterior na máquina, conta setup: não sabemos o molde que está montado. */
export function needsSetup(moldId: string, previousMoldId: string | null): boolean {
  return previousMoldId !== moldId;
}

export function slotDurationMs(order: Order, mold: Mold, previousMoldId: string | null): number {
  return productionMs(order, mold) + (needsSetup(mold.id, previousMoldId) ? SETUP_MS : 0);
}

/* ------------------------------------------------------------------ */
/* Regra 2: molde só em injetora com força dentro da faixa do molde.  */
/* ------------------------------------------------------------------ */

export function isCompatible(machine: Pick<Machine, 'tonnage'>, mold: Pick<Mold, 'minTonnage' | 'maxTonnage'>): boolean {
  return machine.tonnage >= mold.minTonnage && machine.tonnage <= mold.maxTonnage;
}

/* ------------------------------------------------------------------ */
/* Regra 3: sem sobreposição na mesma injetora; manutenção bloqueia.  */
/* ------------------------------------------------------------------ */

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/* ------------------------------------------------------------------ */
/* Regra 4: ordem que termina depois da data de entrega fica em risco. */
/* ------------------------------------------------------------------ */

export function isAtRisk(slot: Pick<Slot, 'end'>, order: Pick<Order, 'dueDate'>): boolean {
  return slot.end > order.dueDate;
}

/* ------------------------------------------------------------------ */
/* Índices auxiliares                                                  */
/* ------------------------------------------------------------------ */

export type Index = {
  machine: Map<string, Machine>;
  mold: Map<string, Mold>;
  order: Map<string, Order>;
};

export function indexPlan(plan: Pick<Plan, 'machines' | 'molds' | 'orders'>): Index {
  return {
    machine: new Map(plan.machines.map((m) => [m.id, m])),
    mold: new Map(plan.molds.map((m) => [m.id, m])),
    order: new Map(plan.orders.map((o) => [o.id, o])),
  };
}

function moldOf(ix: Index, orderId: string): Mold {
  const order = ix.order.get(orderId);
  const mold = order && ix.mold.get(order.moldId);
  if (!order || !mold) throw new Error(`Ordem ou molde inexistente: ${orderId}`);
  return mold;
}

/**
 * Recalcula o fim de cada alocação de uma injetora a partir do início, na ordem do tempo,
 * aplicando a regra 1 (o setup depende de quem vem antes). Não mexe nos inícios.
 */
export function normalizeMachine(slots: Slot[], machineId: string, ix: Index): Slot[] {
  const mine = slots.filter((s) => s.machineId === machineId).sort((a, b) => a.start - b.start);
  let prevMold: string | null = null;
  const updated = new Map<string, Slot>();
  for (const s of mine) {
    const order = ix.order.get(s.orderId)!;
    const mold = moldOf(ix, s.orderId);
    const end = s.start + slotDurationMs(order, mold, prevMold);
    updated.set(s.id, end === s.end ? s : { ...s, end });
    prevMold = mold.id;
  }
  return slots.map((s) => updated.get(s.id) ?? s);
}

export function normalizeAll(slots: Slot[], ix: Index): Slot[] {
  const machines = new Set(slots.map((s) => s.machineId));
  let out = slots;
  for (const m of machines) out = normalizeMachine(out, m, ix);
  return out;
}

/* ------------------------------------------------------------------ */
/* Validação de uma alocação (usada no arrastar e soltar e no teclado) */
/* ------------------------------------------------------------------ */

export type Placement = { ok: boolean; reasons: string[]; slots: Slot[]; end: number };

const fmt = (ms: number) => {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
};

/**
 * Simula colocar a ordem na injetora a partir de `start` (movendo `slotId`, se informado)
 * e diz se cabe. Considera o efeito do setup na alocação seguinte da mesma injetora.
 */
export function validatePlacement(
  plan: Pick<Plan, 'slots' | 'maintenance'>,
  ix: Index,
  args: { orderId: string; machineId: string; start: number; slotId?: string; locked?: boolean },
): Placement {
  const reasons: string[] = [];
  const machine = ix.machine.get(args.machineId);
  const order = ix.order.get(args.orderId);
  if (!machine || !order) return { ok: false, reasons: ['Injetora ou ordem inexistente'], slots: plan.slots, end: args.start };
  const mold = moldOf(ix, args.orderId);

  if (!machine.active) reasons.push(`${machine.code} está desativada`);
  if (!isCompatible(machine, mold)) {
    reasons.push(`Molde ${mold.code} exige ${mold.minTonnage}–${mold.maxTonnage} t; a ${machine.code} tem ${machine.tonnage} t`);
  }

  const id = args.slotId ?? `novo-${args.orderId}`;
  const moved: Slot = {
    id,
    orderId: args.orderId,
    machineId: args.machineId,
    start: args.start,
    end: args.start, // recalculado na normalização
    locked: args.locked ?? false,
  };
  const others = plan.slots.filter((s) => s.id !== id);
  const simulated = normalizeMachine([...others, moved], args.machineId, ix);
  const placed = simulated.find((s) => s.id === id)!;

  const sameMachine = simulated.filter((s) => s.machineId === args.machineId);
  for (const s of sameMachine) {
    if (s.id === id) continue;
    if (overlaps(placed, s)) {
      reasons.push(`Sobrepõe a ${ix.order.get(s.orderId)?.number ?? 'outra ordem'} na ${machine.code}`);
    }
  }
  // O setup recalculado pode empurrar a alocação seguinte para cima de outra.
  const sorted = sameMachine.sort((a, b) => a.start - b.start);
  const k = sorted.findIndex((s) => s.id === id);
  const next = sorted[k + 1];
  const afterNext = sorted[k + 2];
  if (next && afterNext && overlaps(next, afterNext)) {
    reasons.push(`O setup extra empurra a ${ix.order.get(next.orderId)?.number} para cima da ${ix.order.get(afterNext.orderId)?.number}`);
  }
  // Tirar a ordem da injetora de origem pode fazer a seguinte precisar de setup e invadir outra.
  const original = args.slotId ? plan.slots.find((s) => s.id === args.slotId) : undefined;
  if (original && original.machineId !== args.machineId) {
    const origem = normalizeMachine(others, original.machineId, ix).filter((s) => s.machineId === original.machineId).sort((a, b) => a.start - b.start);
    const antes = new Set(overlappingIds(plan.slots.filter((s) => s.machineId === original.machineId)));
    for (const sid of overlappingIds(origem)) {
      if (!antes.has(sid)) {
        const o = ix.order.get(origem.find((s) => s.id === sid)!.orderId);
        reasons.push(`Sem esta ordem, a ${o?.number} passa a ter setup na ${ix.machine.get(original.machineId)?.code} e invade a seguinte`);
        break;
      }
    }
  }
  const wasInMaintenance = new Set(
    plan.slots.filter((s) => plan.maintenance.some((m) => m.machineId === s.machineId && overlaps(s, m))).map((s) => s.id),
  );
  for (const m of plan.maintenance) {
    if (m.machineId !== args.machineId) continue;
    if (overlaps(placed, m)) {
      reasons.push(`Manutenção na ${machine.code} de ${fmt(m.start)} a ${fmt(m.end)} (${m.reason})`);
    }
    for (const s of sameMachine) {
      if (s.id !== id && !wasInMaintenance.has(s.id) && overlaps(s, m)) {
        reasons.push(`O setup extra empurra a ${ix.order.get(s.orderId)?.number} para dentro da manutenção`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons, slots: simulated, end: placed.end };
}

/** Ids das alocações que se sobrepõem a alguma outra da mesma lista (mesma injetora). */
function overlappingIds(list: Slot[]): string[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const ids: string[] = [];
  for (let i = 1; i < sorted.length; i++) if (overlaps(sorted[i - 1], sorted[i])) ids.push(sorted[i].id);
  return ids;
}

/**
 * Empurra para frente as alocações de uma injetora até não haver sobreposição nem manutenção
 * no caminho. Usado para consertar o plano depois de uma mudança em lote.
 */
export function pushForward(slots: Slot[], machineId: string, ix: Index, maintenance: Maintenance[]): Slot[] {
  let out = normalizeMachine(slots, machineId, ix);
  for (let guard = 0; guard < 200; guard++) {
    const mine = out.filter((s) => s.machineId === machineId).sort((a, b) => a.start - b.start);
    let changed = false;
    for (let i = 0; i < mine.length && !changed; i++) {
      const s = mine[i];
      const prevEnd = i > 0 ? mine[i - 1].end : -Infinity;
      let start = Math.max(s.start, prevEnd);
      const m = maintenance.find((w) => w.machineId === machineId && overlaps({ start, end: start + (s.end - s.start) }, w));
      if (m) start = m.end;
      if (start !== s.start) {
        out = normalizeMachine(out.map((x) => (x.id === s.id ? { ...x, start } : x)), machineId, ix);
        changed = true;
      }
    }
    if (!changed) return out;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Conflitos do plano (painel lateral)                                 */
/* ------------------------------------------------------------------ */

export type ConflictKind = 'risco' | 'sem-alocacao' | 'molde-incompativel' | 'sobreposicao' | 'manutencao';
export type Conflict = { kind: ConflictKind; orderId: string; slotId?: string; message: string };

export function findConflicts(plan: Plan, ix = indexPlan(plan)): Conflict[] {
  const out: Conflict[] = [];
  const allocated = new Set(plan.slots.map((s) => s.orderId));
  for (const o of plan.orders) {
    if (o.status !== 'Concluída' && !allocated.has(o.id)) {
      out.push({ kind: 'sem-alocacao', orderId: o.id, message: `${o.number} sem injetora` });
    }
  }
  for (const s of plan.slots) {
    const order = ix.order.get(s.orderId)!;
    const machine = ix.machine.get(s.machineId)!;
    const mold = moldOf(ix, s.orderId);
    if (!isCompatible(machine, mold)) {
      out.push({ kind: 'molde-incompativel', orderId: order.id, slotId: s.id, message: `${order.number}: molde ${mold.code} (${mold.minTonnage}–${mold.maxTonnage} t) na ${machine.code} (${machine.tonnage} t)` });
    }
    if (order.status !== 'Concluída' && isAtRisk(s, order)) {
      const atraso = Math.ceil((s.end - order.dueDate) / HOUR);
      out.push({ kind: 'risco', orderId: order.id, slotId: s.id, message: `${order.number} termina ${atraso} h depois da entrega` });
    }
    for (const m of plan.maintenance) {
      if (m.machineId === s.machineId && overlaps(s, m)) {
        out.push({ kind: 'manutencao', orderId: order.id, slotId: s.id, message: `${order.number} cai na manutenção da ${machine.code}` });
      }
    }
  }
  const byMachine = new Map<string, Slot[]>();
  for (const s of plan.slots) byMachine.set(s.machineId, [...(byMachine.get(s.machineId) ?? []), s]);
  for (const [machineId, list] of byMachine) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (overlaps(sorted[i - 1], sorted[i])) {
        const a = ix.order.get(sorted[i - 1].orderId)!;
        const b = ix.order.get(sorted[i].orderId)!;
        out.push({ kind: 'sobreposicao', orderId: b.id, slotId: sorted[i].id, message: `${a.number} e ${b.number} se sobrepõem na ${ix.machine.get(machineId)!.code}` });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

export function occupancy(slots: Slot[], machineId: string, from: number, to: number): number {
  const span = to - from;
  if (span <= 0) return 0;
  const busy = slots
    .filter((s) => s.machineId === machineId)
    .reduce((acc, s) => acc + Math.max(0, Math.min(s.end, to) - Math.max(s.start, from)), 0);
  return Math.min(1, busy / span);
}

export function setupHours(slots: Slot[], ix: Index, from: number, to: number): number {
  const byMachine = new Map<string, Slot[]>();
  for (const s of slots) byMachine.set(s.machineId, [...(byMachine.get(s.machineId) ?? []), s]);
  let total = 0;
  for (const list of byMachine.values()) {
    let prev: string | null = null;
    for (const s of [...list].sort((a, b) => a.start - b.start)) {
      const mold = moldOf(ix, s.orderId);
      if (s.start >= from && s.start < to && needsSetup(mold.id, prev)) total += SETUP_MS;
      prev = mold.id;
    }
  }
  return total / HOUR;
}

/* ------------------------------------------------------------------ */
/* Reagendamento automático (guloso por prioridade e data de entrega) */
/* Regra 5: alocação travada não se move.                              */
/* ------------------------------------------------------------------ */

export type RescheduleResult = {
  slots: Slot[];
  moved: string[]; // orderIds que mudaram de lugar
  placedNow: string[]; // ordens que estavam sem alocação e ganharam uma
  stillUnallocated: string[];
};

const HALF_HOUR = HOUR / 2;
const roundUp = (t: number, step = HALF_HOUR) => Math.ceil(t / step) * step;

/** Ordem de atendimento: data de entrega, com 1 dia de vantagem para prioridade alta e 1 de atraso para baixa. */
export function urgencia(o: Pick<Order, 'dueDate' | 'priority'>): number {
  return o.dueDate + (o.priority - 2) * 24 * HOUR;
}

export function reschedule(plan: Plan, ix = indexPlan(plan), chave: (o: Order) => number = urgencia): RescheduleResult {
  // Fica parado: travadas e o que já está em produção (começou antes de "agora").
  const fixed = plan.slots.filter((s) => s.locked || ix.order.get(s.orderId)?.status === 'Em produção' || s.start < plan.now);
  const fixedOrders = new Set(fixed.map((s) => s.orderId));
  const pending = plan.orders
    .filter((o) => o.status !== 'Concluída' && !fixedOrders.has(o.id))
    .sort((a, b) => chave(a) - chave(b) || a.priority - b.priority || a.number.localeCompare(b.number));

  let current = [...fixed];
  const earliest = roundUp(plan.now);
  const placedIds: string[] = [];
  const unallocated: string[] = [];

  for (const order of pending) {
    const mold = ix.mold.get(order.moldId)!;
    let best: { start: number; end: number; machineId: string; setup: boolean } | null = null;
    for (const machine of plan.machines) {
      if (!machine.active || !isCompatible(machine, mold)) continue;
      const blocks = [
        ...current.filter((s) => s.machineId === machine.id).map((s) => s.end),
        ...plan.maintenance.filter((m) => m.machineId === machine.id).map((m) => m.end),
      ];
      const candidates = [earliest, ...blocks.filter((t) => t > earliest)].map((t) => roundUp(t)).sort((a, b) => a - b);
      for (const start of candidates) {
        const r = validatePlacement({ slots: current, maintenance: plan.maintenance }, ix, { orderId: order.id, machineId: machine.id, start });
        if (!r.ok) continue;
        const prev = current
          .filter((s) => s.machineId === machine.id && s.end <= start)
          .sort((a, b) => b.end - a.end)[0];
        const setup = needsSetup(mold.id, prev ? ix.order.get(prev.orderId)!.moldId : null);
        if (!best || r.end < best.end || (r.end === best.end && !setup && best.setup)) {
          best = { start, end: r.end, machineId: machine.id, setup };
        }
        break; // o primeiro encaixe é o mais cedo nesta injetora
      }
    }
    if (!best) {
      unallocated.push(order.id);
      continue;
    }
    const before = plan.slots.find((s) => s.orderId === order.id);
    const slot: Slot = { id: before?.id ?? `s-${order.id}`, orderId: order.id, machineId: best.machineId, start: best.start, end: best.end, locked: false };
    current = normalizeMachine([...current, slot], best.machineId, ix);
    placedIds.push(order.id);
  }

  const beforeById = new Map(plan.slots.map((s) => [s.orderId, s]));
  const moved = placedIds.filter((id) => {
    const b = beforeById.get(id);
    const a = current.find((s) => s.orderId === id)!;
    return b && (b.machineId !== a.machineId || b.start !== a.start);
  });
  const placedNow = placedIds.filter((id) => !beforeById.has(id));
  return { slots: current, moved, placedNow, stillUnallocated: unallocated };
}
