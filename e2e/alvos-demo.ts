/**
 * Calcula, pelas próprias regras do domínio, a ordem e os dois destinos da demonstração de arraste:
 * um que não cabe (molde incompatível) e um que cabe. Saída: docs/gravacoes/alvos.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildPlan } from '../src/data/seed';
import { indexPlan, isAtRisk, isCompatible, validatePlacement } from '../src/domain/rules';
import { HOUR } from '../src/domain/types';

const plan = buildPlan();
const ix = indexPlan(plan);
const linha = new Map(plan.machines.map((m, i) => [m.id, i]));
const meia = HOUR / 2;

let escolha: Record<string, unknown> | null = null;
for (const s of [...plan.slots].sort((a, b) => a.start - b.start)) {
  const o = ix.order.get(s.orderId)!;
  if (o.status !== 'Planejada' || s.locked || isAtRisk(s, o) || s.start < plan.now + 24 * HOUR) continue;
  const mold = ix.mold.get(o.moldId)!;
  if (!isCompatible(ix.machine.get(s.machineId)!, mold)) continue;
  const r0 = linha.get(s.machineId)!;
  const perto = plan.machines.filter((m) => Math.abs(linha.get(m.id)! - r0) <= 6 && m.id !== s.machineId);
  const ruim = perto.find((m) => !isCompatible(m, mold));
  if (!ruim) continue;
  for (const m of perto.filter((mm) => isCompatible(mm, mold))) {
    for (let t = Math.ceil((s.start - 24 * HOUR) / meia) * meia; t <= s.start + 48 * HOUR; t += meia) {
      if (t < plan.now) continue;
      const v = validatePlacement(plan, ix, { orderId: s.orderId, machineId: m.id, start: t, slotId: s.id });
      if (v.ok) {
        escolha = { ordem: o.number, slotStart: s.start, ruim: { maquina: ruim.code, start: s.start }, bom: { maquina: m.code, start: t } };
        break;
      }
    }
    if (escolha) break;
  }
  if (escolha) break;
}
if (!escolha) throw new Error('Nenhuma ordem serve para a demonstração.');
mkdirSync('docs/gravacoes', { recursive: true });
writeFileSync('docs/gravacoes/alvos.json', JSON.stringify(escolha, null, 2));
console.log(escolha);
