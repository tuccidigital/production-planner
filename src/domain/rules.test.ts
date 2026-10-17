import { describe, expect, it } from 'vitest';
import { buildPlan, NOW } from '../data/seed';
import {
  findConflicts, indexPlan, isAtRisk, isCompatible, normalizeMachine, overlaps, productionMs, reschedule,
  setupHours, slotDurationMs, validatePlacement,
} from './rules';
import { HOUR, SETUP_MS, type Machine, type Mold, type Order, type Plan, type Slot } from './types';

const T0 = Date.parse('2026-10-19T06:00:00-03:00');
const molde = (o: Partial<Mold> = {}): Mold => ({ id: 'mo1', code: 'M-001', product: 'Tampa', cavities: 4, cycleSeconds: 36, minTonnage: 150, maxTonnage: 250, ...o });
const ordem = (o: Partial<Order> = {}): Order => ({ id: 'o1', number: 'OP-1001', product: 'Tampa', moldId: 'mo1', quantity: 4000, dueDate: T0 + 48 * HOUR, priority: 2, status: 'Planejada', ...o });
const injetora = (o: Partial<Machine> = {}): Machine => ({ id: 'm1', code: 'IJ-01', name: 'Injetora IJ-01', tonnage: 180, area: 'Galpão A', active: true, ...o });

function cenario(extra: Partial<Plan> = {}): Plan {
  return {
    machines: [injetora(), injetora({ id: 'm2', code: 'IJ-02', tonnage: 450 })],
    molds: [molde(), molde({ id: 'mo2', code: 'M-002', minTonnage: 80, maxTonnage: 200 })],
    orders: [ordem(), ordem({ id: 'o2', number: 'OP-1002', moldId: 'mo2' }), ordem({ id: 'o3', number: 'OP-1003' })],
    slots: [],
    maintenance: [],
    horizonStart: T0,
    now: T0,
    ...extra,
  };
}

describe('Regra 1: duração = quantidade ÷ cavidades × ciclo, + 2 h de setup quando o molde muda', () => {
  it('calcula a produção pelo número de golpes', () => {
    // 4000 / 4 = 1000 golpes × 36 s = 36000 s = 10 h
    expect(productionMs(ordem(), molde())).toBe(10 * HOUR);
  });
  it('arredonda golpes para cima', () => {
    expect(productionMs(ordem({ quantity: 4001 }), molde())).toBe(1001 * 36 * 1000);
  });
  it('soma 2 h de setup quando o molde muda ou não há alocação anterior', () => {
    expect(slotDurationMs(ordem(), molde(), null)).toBe(10 * HOUR + SETUP_MS);
    expect(slotDurationMs(ordem(), molde(), 'mo2')).toBe(10 * HOUR + SETUP_MS);
    expect(slotDurationMs(ordem(), molde(), 'mo1')).toBe(10 * HOUR);
  });
  it('a normalização aplica o setup pela ordem do tempo', () => {
    const p = cenario();
    const ix = indexPlan(p);
    const slots: Slot[] = [
      { id: 'a', orderId: 'o1', machineId: 'm1', start: T0, end: 0, locked: false },
      { id: 'b', orderId: 'o3', machineId: 'm1', start: T0 + 12 * HOUR, end: 0, locked: false },
    ];
    const n = normalizeMachine(slots, 'm1', ix);
    expect(n[0].end - n[0].start).toBe(12 * HOUR); // primeira: com setup
    expect(n[1].end - n[1].start).toBe(10 * HOUR); // mesmo molde: sem setup
  });
});

describe('Regra 2: molde só em injetora com força dentro da faixa', () => {
  it('aceita dentro da faixa, inclusive nos limites', () => {
    expect(isCompatible({ tonnage: 150 }, molde())).toBe(true);
    expect(isCompatible({ tonnage: 250 }, molde())).toBe(true);
  });
  it('recusa fora da faixa e explica o motivo', () => {
    expect(isCompatible({ tonnage: 450 }, molde())).toBe(false);
    const p = cenario();
    const r = validatePlacement(p, indexPlan(p), { orderId: 'o1', machineId: 'm2', start: T0 });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toBe('Molde M-001 exige 150–250 t; a IJ-02 tem 450 t');
  });
});

describe('Regra 3: sem sobreposição; manutenção bloqueia', () => {
  it('detecta sobreposição de intervalos', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 9, end: 20 })).toBe(true);
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });
  it('recusa alocação em cima de outra ordem', () => {
    const p = cenario({ slots: [{ id: 'a', orderId: 'o1', machineId: 'm1', start: T0, end: T0 + 12 * HOUR, locked: false }] });
    const r = validatePlacement(p, indexPlan(p), { orderId: 'o2', machineId: 'm1', start: T0 + 6 * HOUR });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('Sobrepõe a OP-1001 na IJ-01');
  });
  it('recusa alocação dentro da manutenção', () => {
    const p = cenario({ maintenance: [{ id: 'mt', machineId: 'm1', start: T0 + 4 * HOUR, end: T0 + 8 * HOUR, reason: 'troca de bico' }] });
    const r = validatePlacement(p, indexPlan(p), { orderId: 'o1', machineId: 'm1', start: T0 });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/^Manutenção na IJ-01 de .* \(troca de bico\)$/);
  });
  it('percebe quando o setup novo empurra a ordem seguinte para cima da outra', () => {
    const p = cenario({
      slots: [
        { id: 'a', orderId: 'o1', machineId: 'm1', start: T0, end: T0 + 12 * HOUR, locked: false },
        { id: 'b', orderId: 'o3', machineId: 'm1', start: T0 + 12 * HOUR, end: T0 + 22 * HOUR, locked: false },
      ],
      orders: [ordem(), ordem({ id: 'o2', number: 'OP-1002', moldId: 'mo2', quantity: 400 }), ordem({ id: 'o3', number: 'OP-1003' }), ordem({ id: 'o4', number: 'OP-1004' })],
    });
    p.slots.push({ id: 'c', orderId: 'o4', machineId: 'm1', start: T0 + 22 * HOUR, end: T0 + 32 * HOUR, locked: false });
    // Move a OP-1003 para depois de uma ordem de outro molde: ela passa a ter setup e invade a OP-1004.
    const ix = indexPlan(p);
    const r = validatePlacement(p, ix, { orderId: 'o2', machineId: 'm1', start: T0 + 12 * HOUR, slotId: 'novo' });
    expect(r.ok).toBe(false);
  });
});

describe('Regra 4: ordem que termina depois da entrega fica em risco', () => {
  it('marca em risco só quando o fim passa da entrega', () => {
    expect(isAtRisk({ end: T0 + 49 * HOUR }, ordem())).toBe(true);
    expect(isAtRisk({ end: T0 + 48 * HOUR }, ordem())).toBe(false);
  });
  it('aparece no painel de conflitos com as horas de atraso', () => {
    const p = cenario({ slots: [{ id: 'a', orderId: 'o1', machineId: 'm1', start: T0 + 40 * HOUR, end: T0 + 52 * HOUR, locked: false }] });
    const c = findConflicts(p).filter((x) => x.kind === 'risco');
    expect(c).toHaveLength(1);
    expect(c[0].message).toBe('OP-1001 termina 4 h depois da entrega');
  });
});

describe('Regra 5: o reagendamento automático não move alocações travadas', () => {
  it('mantém a travada no lugar e encaixa as outras em volta', () => {
    const travada: Slot = { id: 'a', orderId: 'o1', machineId: 'm1', start: T0 + 20 * HOUR, end: T0 + 32 * HOUR, locked: true };
    const p = cenario({ slots: [travada] });
    const r = reschedule(p);
    const depois = r.slots.find((s) => s.id === 'a')!;
    expect(depois.start).toBe(travada.start);
    expect(depois.machineId).toBe('m1');
    expect(r.stillUnallocated).toEqual([]);
    const m1 = r.slots.filter((s) => s.machineId === 'm1').sort((a, b) => a.start - b.start);
    for (let i = 1; i < m1.length; i++) expect(overlaps(m1[i - 1], m1[i])).toBe(false);
  });
  it('prioridade alta é alocada antes', () => {
    const p = cenario({ machines: [injetora()], orders: [ordem({ priority: 3 }), ordem({ id: 'o3', number: 'OP-1003', priority: 1, dueDate: T0 + 96 * HOUR })] });
    const r = reschedule(p);
    const alta = r.slots.find((s) => s.orderId === 'o3')!;
    const baixa = r.slots.find((s) => s.orderId === 'o1')!;
    expect(alta.start).toBeLessThan(baixa.start);
  });
  it('não aloca ordem sem injetora compatível', () => {
    const p = cenario({ machines: [injetora({ tonnage: 450 })] });
    const r = reschedule(p);
    expect(r.stillUnallocated).toContain('o1');
  });
});

describe('Cenário da Lumina', () => {
  const plan = buildPlan();
  const ix = indexPlan(plan);
  it('tem os volumes da especificação', () => {
    expect(plan.machines).toHaveLength(38);
    expect(plan.molds).toHaveLength(60);
    expect(plan.orders).toHaveLength(120);
    expect(plan.maintenance).toHaveLength(10);
    expect(Math.min(...plan.machines.map((m) => m.tonnage))).toBe(80);
    expect(Math.max(...plan.machines.map((m) => m.tonnage))).toBe(450);
  });
  it('todo molde cabe em pelo menos duas injetoras', () => {
    for (const mold of plan.molds) expect(plan.machines.filter((m) => isCompatible(m, mold)).length).toBeGreaterThanOrEqual(2);
  });
  it('tem conflitos para o painel mostrar', () => {
    const kinds = new Set(findConflicts(plan, ix).map((c) => c.kind));
    expect(kinds.has('sem-alocacao')).toBe(true);
    expect(kinds.has('molde-incompativel')).toBe(true);
  });
  it('reagendar aloca todas, reduz as ordens em risco e zera moldes incompatíveis', () => {
    const antes = findConflicts(plan, ix);
    const r = reschedule(plan, ix);
    const depois = findConflicts({ ...plan, slots: r.slots }, ix);
    const conta = (l: typeof antes, k: string) => l.filter((c) => c.kind === k).length;
    expect(r.stillUnallocated).toEqual([]);
    expect(conta(depois, 'risco')).toBeLessThan(conta(antes, 'risco'));
    expect(conta(depois, 'molde-incompativel')).toBe(0);
    expect(conta(depois, 'sem-alocacao')).toBe(0);
  });
  it('reagendar resolve molde incompatível e não cria sobreposição', () => {
    const r = reschedule(plan, ix);
    const depois = findConflicts({ ...plan, slots: r.slots }, ix);
    expect(depois.filter((c) => c.kind === 'sobreposicao' || c.kind === 'manutencao')).toEqual([]);
    expect(setupHours(r.slots, ix, plan.horizonStart, plan.horizonStart + 7 * 24 * HOUR)).toBeGreaterThan(0);
    expect(plan.now).toBe(NOW);
  });
});
