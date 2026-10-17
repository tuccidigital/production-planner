/**
 * Cenário fictício da Lumina Componentes: 38 injetoras, 60 moldes, 120 ordens para 4 semanas
 * e 10 janelas de manutenção. Gerado com semente fixa: sempre o mesmo resultado.
 */
import { indexPlan, isCompatible, productionMs, pushForward, reschedule } from '../domain/rules';
import { HOUR, type Machine, type Maintenance, type Mold, type Order, type Plan, type Slot } from '../domain/types';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Segunda-feira, 19/10/2026, 06:00 (início do turno A, horário de Brasília). */
export const HORIZON_START = Date.parse('2026-10-19T06:00:00-03:00');
/** "Agora" do cenário: quarta-feira, 21/10/2026, 10:00. */
export const NOW = Date.parse('2026-10-21T10:00:00-03:00');

const TONNAGES = [80, 100, 120, 150, 180, 220, 250, 300, 350, 450];

const PRODUTOS = [
  'Tampa de liquidificador', 'Base de ventilador', 'Puxador de gaveta', 'Caixa de fusível', 'Gaveta de geladeira',
  'Prateleira de porta', 'Botão de fogão', 'Hélice de ventilador', 'Pé nivelador', 'Dobradiça plástica',
  'Corrediça de gaveta', 'Tampa de micro-ondas', 'Copo medidor', 'Suporte de prateleira', 'Grade de exaustor',
  'Painel de lavadora', 'Filtro de fiapos', 'Tampa de reservatório', 'Bandeja de gelo', 'Rodízio de móvel',
  'Capa de motor', 'Espaçador de vidro', 'Conector de cabo', 'Manopla de forno', 'Tampa de pilha',
  'Moldura de display', 'Guia de cabo', 'Calço de transporte', 'Clipe de fixação', 'Batente de porta',
];

const MOTIVOS = [
  'troca de resistência', 'revisão hidráulica', 'calibração de termopar', 'troca de bico', 'preventiva mensal',
  'limpeza de rosca', 'troca de óleo', 'ajuste de placa', 'inspeção elétrica', 'troca de vedação',
];

export function buildPlan(): Plan {
  const rnd = mulberry32(20261019);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  const machines: Machine[] = Array.from({ length: 38 }, (_, i) => {
    const tonnage = TONNAGES[Math.min(TONNAGES.length - 1, Math.floor((i / 38) * TONNAGES.length))];
    const code = `IJ-${String(i + 1).padStart(2, '0')}`;
    return { id: `m${i + 1}`, code, name: `Injetora ${code}`, tonnage, area: i < 14 ? 'Galpão A' : i < 28 ? 'Galpão B' : 'Galpão C', active: true };
  });

  const molds: Mold[] = Array.from({ length: 60 }, (_, i) => {
    // Faixa de força cobrindo de 2 a 4 classes de injetora, para sempre haver alternativa.
    const lo = between(0, TONNAGES.length - 3);
    const hi = Math.min(TONNAGES.length - 1, lo + between(1, 3));
    return {
      id: `mo${i + 1}`,
      code: `M-${String(i + 1).padStart(3, '0')}`,
      product: PRODUTOS[i % PRODUTOS.length],
      cavities: pick([1, 2, 4, 8]),
      cycleSeconds: between(18, 70),
      minTonnage: TONNAGES[lo],
      maxTonnage: TONNAGES[hi],
    };
  });

  const days = (n: number) => n * 24 * HOUR;
  const orders: Order[] = Array.from({ length: 120 }, (_, i) => {
    const mold = molds[between(0, molds.length - 1)];
    // Quantidade que dá entre 40 h e 170 h de máquina (lotes de semanas inteiras são comuns em injeção).
    const targetHours = between(40, 170);
    const shotsPerHour = 3600 / mold.cycleSeconds;
    const quantity = Math.max(500, Math.round((targetHours * shotsPerHour * mold.cavities) / 100) * 100);
    const due = HORIZON_START + days(between(4, 27)) + between(0, 2) * 8 * HOUR;
    const r = rnd();
    return {
      id: `o${i + 1}`,
      number: `OP-${1001 + i}`,
      product: mold.product,
      moldId: mold.id,
      quantity,
      dueDate: due,
      priority: (r < 0.15 ? 1 : r < 0.65 ? 2 : 3) as 1 | 2 | 3,
      status: 'Planejada',
    };
  });

  const maintenance: Maintenance[] = Array.from({ length: 10 }, (_, i) => {
    const machine = machines[(i * 7 + 3) % machines.length];
    const start = HORIZON_START + days(between(2, 12)) + between(0, 2) * 8 * HOUR;
    return { id: `mt${i + 1}`, machineId: machine.id, start, end: start + between(4, 12) * HOUR, reason: MOTIVOS[i % MOTIVOS.length] };
  });

  // Plano "da planilha": feito à mão por prioridade, sem olhar a data de entrega com cuidado,
  // para 105 das 120 ordens. É o ponto de partida que o reagendamento automático melhora.
  const base: Plan = { machines, molds, orders, slots: [], maintenance, horizonStart: HORIZON_START, now: HORIZON_START };
  const ix = indexPlan(base);
  const planejadas = [...orders].sort((a, b) => a.dueDate - b.dueDate).slice(0, 105);
  const r = reschedule({ ...base, orders: planejadas }, ix, (o) => o.priority * 1e13 + o.dueDate);
  let slots: Slot[] = r.slots;

  // Imperfeições típicas de planilha: dois moldes em injetora incompatível e travas de compromisso.
  const incompativeis = slots.slice(10, 40).filter((s) => {
    const mold = ix.mold.get(ix.order.get(s.orderId)!.moldId)!;
    return machines.some((m) => !isCompatible(m, mold));
  }).slice(0, 2);
  for (const s of incompativeis) {
    const mold = ix.mold.get(ix.order.get(s.orderId)!.moldId)!;
    const errada = machines.find((m) => !isCompatible(m, mold) && !slots.some((o) => o.machineId === m.id))
      ?? machines.find((m) => !isCompatible(m, mold))!;
    const start = Math.max(...slots.filter((o) => o.machineId === errada.id).map((o) => o.end), HORIZON_START + days(4));
    slots = slots.map((o) => (o.id === s.id ? { ...o, machineId: errada.id, start } : o));
    slots = pushForward(slots, s.machineId, ix, maintenance);
    slots = pushForward(slots, errada.id, ix, maintenance);
  }
  const travar = new Set(slots.filter((_, i) => i % 13 === 5).map((s) => s.id));
  slots = slots.map((s) => (travar.has(s.id) ? { ...s, locked: true } : s));

  // Estado das ordens em relação ao "agora".
  const finalOrders = orders.map((o) => {
    const s = slots.find((x) => x.orderId === o.id);
    if (!s) return o;
    const status: Order['status'] = s.end <= NOW ? 'Concluída' : s.start <= NOW ? 'Em produção' : 'Planejada';
    return { ...o, status };
  });

  return { machines, molds, orders: finalOrders, slots, maintenance, horizonStart: HORIZON_START, now: NOW };
}

/** Horas de máquina da ordem sem setup (útil na interface). */
export function horasDeMaquina(order: Order, mold: Mold) {
  return productionMs(order, mold) / HOUR;
}
