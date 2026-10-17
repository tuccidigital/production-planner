import {
  Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger,
} from '@fluentui/react-components';
import { LockClosed16Regular, LockOpen16Regular } from '@fluentui/react-icons';
import { useMemo } from 'react';
import { findConflicts, isAtRisk, productionMs, setupHours, type Conflict, type Index, type RescheduleResult } from '../domain/rules';
import { HOUR, SETUP_MS, type Plan } from '../domain/types';
import { dataHora, horas, numero, pct } from '../format';

const SEMANA = 7 * 24 * HOUR;

export function useKpis(plan: Plan, ix: Index) {
  return useMemo(() => {
    const conflicts = findConflicts(plan, ix);
    const fim = plan.horizonStart + 14 * 24 * HOUR;
    const busy = plan.slots.reduce((a, s) => a + Math.max(0, Math.min(s.end, fim) - Math.max(s.start, plan.horizonStart)), 0);
    const ocup = busy / (plan.machines.length * (fim - plan.horizonStart));
    return {
      conflicts,
      ocupacao: ocup,
      emRisco: conflicts.filter((c) => c.kind === 'risco').length,
      semAlocacao: conflicts.filter((c) => c.kind === 'sem-alocacao').length,
      setupSemana: setupHours(plan.slots, ix, plan.horizonStart, plan.horizonStart + SEMANA),
    };
  }, [plan, ix]);
}

export function Kpis({ k }: { k: ReturnType<typeof useKpis> }) {
  const itens = [
    { rotulo: 'Ocupação média', valor: pct(k.ocupacao), nota: 'próximas 2 semanas' },
    { rotulo: 'Ordens em risco', valor: numero(k.emRisco), nota: 'terminam depois da entrega', alerta: k.emRisco > 0 },
    { rotulo: 'Sem alocação', valor: numero(k.semAlocacao), nota: 'ordens sem injetora', alerta: k.semAlocacao > 0 },
    { rotulo: 'Setup na semana', valor: horas(k.setupSemana), nota: 'trocas de molde' },
  ];
  return (
    <section className="kpis" aria-label="Indicadores">
      {itens.map((i) => (
        <div key={i.rotulo} className={`kpi ${i.alerta ? 'kpi--alerta' : ''}`}>
          <span className="label">{i.rotulo}</span>
          <strong>{i.valor}</strong>
          <span className="muted">{i.nota}</span>
        </div>
      ))}
    </section>
  );
}

const GRUPOS: Array<{ kind: Conflict['kind']; titulo: string }> = [
  { kind: 'molde-incompativel', titulo: 'Molde incompatível' },
  { kind: 'sobreposicao', titulo: 'Sobreposição' },
  { kind: 'manutencao', titulo: 'Na manutenção' },
  { kind: 'risco', titulo: 'Em risco' },
  { kind: 'sem-alocacao', titulo: 'Sem alocação' },
];

export function ConflictsPanel({ conflicts, onGo }: { conflicts: Conflict[]; onGo: (c: Conflict) => void }) {
  if (!conflicts.length) return <p className="muted">Nenhum conflito. Plano pronto para a produção.</p>;
  return (
    <div className="conflicts">
      {GRUPOS.map((g) => {
        const lista = conflicts.filter((c) => c.kind === g.kind);
        if (!lista.length) return null;
        return (
          <details key={g.kind} open={g.kind !== 'sem-alocacao' || lista.length < 6}>
            <summary>
              <span>{g.titulo}</span>
              <Badge appearance="tint" color={g.kind === 'risco' || g.kind === 'sem-alocacao' ? 'warning' : 'danger'}>{lista.length}</Badge>
            </summary>
            <ul>
              {lista.map((c, i) => (
                <li key={c.kind + c.orderId + i}>
                  {c.slotId ? (
                    <button type="button" className="link" onClick={() => onGo(c)}>{c.message}</button>
                  ) : (
                    <span>{c.message}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

export function Details({ plan, ix, slotId, onToggleLock }: { plan: Plan; ix: Index; slotId: string; onToggleLock: (id: string) => void }) {
  const s = plan.slots.find((x) => x.id === slotId);
  if (!s) return null;
  const o = ix.order.get(s.orderId)!;
  const mold = ix.mold.get(o.moldId)!;
  const machine = ix.machine.get(s.machineId)!;
  const prod = productionMs(o, mold);
  const setup = s.end - s.start - prod >= SETUP_MS;
  const risco = o.status !== 'Concluída' && isAtRisk(s, o);
  return (
    <div className="details">
      <div className="details-head">
        <h3>{o.number}</h3>
        <Badge appearance="filled" color={risco ? 'danger' : o.status === 'Em produção' ? 'brand' : o.status === 'Concluída' ? 'subtle' : 'success'}>
          {risco ? 'Em risco' : o.status}
        </Badge>
      </div>
      <dl>
        <dt>Produto</dt><dd>{o.product}</dd>
        <dt>Quantidade</dt><dd>{numero(o.quantity)} peças</dd>
        <dt>Molde</dt><dd>{mold.code} · {mold.cavities} cav. · ciclo {mold.cycleSeconds} s · {mold.minTonnage}–{mold.maxTonnage} t</dd>
        <dt>Injetora</dt><dd>{machine.code} · {machine.tonnage} t · {machine.area}</dd>
        <dt>Início</dt><dd>{dataHora(s.start)}</dd>
        <dt>Fim</dt><dd>{dataHora(s.end)}</dd>
        <dt>Entrega</dt><dd>{dataHora(o.dueDate)}</dd>
        <dt>Duração</dt><dd>{horas(prod / HOUR)} de produção{setup ? ' + 2 h de setup' : ''}</dd>
        <dt>Prioridade</dt><dd>{o.priority === 1 ? 'Alta' : o.priority === 2 ? 'Normal' : 'Baixa'}</dd>
      </dl>
      {o.status === 'Planejada' ? (
        <Button icon={s.locked ? <LockOpen16Regular /> : <LockClosed16Regular />} onClick={() => onToggleLock(s.id)}>
          {s.locked ? 'Destravar' : 'Travar no lugar'}
        </Button>
      ) : (
        <p className="muted">Ordens {o.status === 'Em produção' ? 'em produção' : 'concluídas'} não mudam de lugar.</p>
      )}
      <p className="muted hint">Teclado: setas movem 1 h (Shift: 8 h); para cima e para baixo trocam de injetora.</p>
    </div>
  );
}

export function RescheduleDialog({
  plan, ix, result, open, onOpenChange, onApply,
}: {
  plan: Plan; ix: Index; result: RescheduleResult | null; open: boolean; onOpenChange: (o: boolean) => void; onApply: () => void;
}) {
  const antes = useKpis(plan, ix);
  const depoisPlan = useMemo(() => (result ? { ...plan, slots: result.slots } : plan), [plan, result]);
  const depois = useKpis(depoisPlan, ix);
  const linhas = [
    { rotulo: 'Ordens em risco', a: antes.emRisco, d: depois.emRisco },
    { rotulo: 'Sem alocação', a: antes.semAlocacao, d: depois.semAlocacao },
    { rotulo: 'Molde incompatível', a: antes.conflicts.filter((c) => c.kind === 'molde-incompativel').length, d: depois.conflicts.filter((c) => c.kind === 'molde-incompativel').length },
    { rotulo: 'Setup na semana (h)', a: Math.round(antes.setupSemana), d: Math.round(depois.setupSemana) },
  ];
  const mudancas = result ? [...result.placedNow, ...result.moved].slice(0, 8) : [];
  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Reagendar automaticamente</DialogTitle>
          <DialogContent>
            <p>
              Reorganiza as ordens planejadas por prioridade e data de entrega, sem mexer nas travadas nem no que já está em produção.
              Nada é gravado até você aplicar.
            </p>
            {result ? (
              <>
                <table className="cmp">
                  <thead><tr><th>Indicador</th><th>Antes</th><th>Depois</th></tr></thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.rotulo}><td>{l.rotulo}</td><td>{l.a}</td><td><strong>{l.d}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">
                  {result.moved.length} ordens mudam de lugar e {result.placedNow.length} ganham injetora.
                  {result.stillUnallocated.length ? ` ${result.stillUnallocated.length} continuam sem injetora compatível.` : ''}
                </p>
                <ul className="mudancas">
                  {mudancas.map((id) => {
                    const s = result.slots.find((x) => x.orderId === id)!;
                    return <li key={id}>{ix.order.get(id)!.number} → {ix.machine.get(s.machineId)!.code}, {dataHora(s.start)}</li>;
                  })}
                </ul>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancelar</Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={onApply} disabled={!result}>Aplicar</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
