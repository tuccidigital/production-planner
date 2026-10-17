import { LockClosed12Filled } from '@fluentui/react-icons';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { isAtRisk, isCompatible, occupancy, type Index, type Placement } from '../domain/rules';
import { HOUR, type Plan, type Slot } from '../domain/types';
import { dataHora, diaCurto, pct } from '../format';
import type { Zoom } from '../state/usePlanner';
import { tucci } from '../theme';

const DIAS_VISIVEIS = 28; // 4 semanas de ordens; a tela mostra ~2 semanas e rola
const ROW = 38;
const HEADER = 52;
const LABEL_W = 208;
const SNAP = HOUR / 2;

type Props = {
  plan: Plan;
  ix: Index;
  zoom: Zoom;
  selectedId: string | null;
  focusRequest: { id: string; n: number } | null;
  onSelect: (id: string | null) => void;
  validate: (slotId: string, machineId: string, start: number) => Placement | null;
  onMove: (slotId: string, machineId: string, start: number) => boolean;
  onAnnounce: (msg: string) => void;
};

type Drag = { slotId: string; pointerId: number; x0: number; y0: number; start0: number; row0: number; dx: number; dy: number; moved: boolean };

export function Gantt({ plan, ix, zoom, selectedId, focusRequest, onSelect, validate, onMove, onAnnounce }: Props) {
  const pxH = zoom === 'dia' ? 5 : 15;
  const viewStart = plan.horizonStart;
  const viewEnd = viewStart + DIAS_VISIVEIS * 24 * HOUR;
  const width = ((viewEnd - viewStart) / HOUR) * pxH;
  const x = (t: number) => ((t - viewStart) / HOUR) * pxH;
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const rows = plan.machines;
  const rowOf = useMemo(() => new Map(rows.map((m, i) => [m.id, i])), [rows]);

  // Ao abrir, rola até o "agora".
  useEffect(() => {
    scroller.current?.scrollTo({ left: Math.max(0, x(plan.now) - 240) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Pedido externo (painel de conflitos) para mostrar e focar uma barra.
  useEffect(() => {
    if (!focusRequest) return;
    const el = document.getElementById(`slot-${focusRequest.id}`);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, [focusRequest]);

  const ghost = useMemo(() => {
    if (!drag || !drag.moved) return null;
    const slot = plan.slots.find((s) => s.id === drag.slotId)!;
    const start = Math.round((drag.start0 + (drag.dx / pxH) * HOUR) / SNAP) * SNAP;
    const row = Math.max(0, Math.min(rows.length - 1, drag.row0 + Math.round(drag.dy / ROW)));
    const machine = rows[row];
    const v = validate(slot.id, machine.id, start);
    return { start, row, machine, v, slot };
  }, [drag, plan.slots, pxH, rows, validate]);

  const onPointerDown = (e: PointerEvent, s: Slot) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ slotId: s.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, start0: s.start, row0: rowOf.get(s.machineId)!, dx: 0, dy: 0, moved: false });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
  };
  const onPointerUp = (e: PointerEvent, s: Slot) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const mesmoLugar = ghost && ghost.machine.id === s.machineId && Math.abs(ghost.start - s.start) < SNAP;
    if (!drag.moved) onSelect(s.id);
    else if (ghost && !mesmoLugar) onMove(s.id, ghost.machine.id, ghost.start);
    setDrag(null);
  };

  const onKeyDown = (e: KeyboardEvent, s: Slot) => {
    const passo = e.shiftKey ? 8 * HOUR : HOUR;
    const row = rowOf.get(s.machineId)!;
    let alvo: { machineId: string; start: number } | null = null;
    if (e.key === 'ArrowRight') alvo = { machineId: s.machineId, start: s.start + passo };
    if (e.key === 'ArrowLeft') alvo = { machineId: s.machineId, start: s.start - passo };
    if (e.key === 'ArrowUp' && row > 0) alvo = { machineId: rows[row - 1].id, start: s.start };
    if (e.key === 'ArrowDown' && row < rows.length - 1) alvo = { machineId: rows[row + 1].id, start: s.start };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(s.id);
      return;
    }
    if (!alvo) return;
    e.preventDefault();
    const ok = onMove(s.id, alvo.machineId, alvo.start);
    if (ok) requestAnimationFrame(() => document.getElementById(`slot-${s.id}`)?.focus());
    else onAnnounce('');
  };

  // Cabeçalho: dias e, no zoom por turno, os três turnos.
  const dias = Array.from({ length: DIAS_VISIVEIS }, (_, i) => viewStart + i * 24 * HOUR);

  return (
    <div className="gantt" ref={scroller} role="region" aria-label="Gráfico de Gantt por injetora">
      <div className="gantt-inner" style={{ width: LABEL_W + width, height: HEADER + rows.length * ROW }}>
        {/* cabeçalho */}
        <div className="gantt-header" style={{ height: HEADER, width: LABEL_W + width }}>
          <div className="gantt-corner" style={{ width: LABEL_W }}>Injetora · ocupação</div>
          {dias.map((d) => (
            <div key={d} className="gantt-day" style={{ left: LABEL_W + x(d), width: 24 * pxH }}>
              <span>{diaCurto(d)}</span>
              {zoom === 'turno' ? (
                <div className="gantt-shifts">
                  {['A', 'B', 'C'].map((t) => <span key={t} style={{ width: 8 * pxH }}>Turno {t}</span>)}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* grade de fundo */}
        <div className="gantt-body" style={{ top: HEADER, left: LABEL_W, width, height: rows.length * ROW }}>
          {dias.map((d) => <div key={d} className="gantt-gridline" style={{ left: x(d) }} />)}
          {zoom === 'turno'
            ? dias.flatMap((d) => [8, 16].map((h) => <div key={`${d}-${h}`} className="gantt-gridline gantt-gridline--shift" style={{ left: x(d + h * HOUR) }} />))
            : null}
          {plan.maintenance.map((m) => (
            <div
              key={m.id}
              className="gantt-maint"
              style={{ left: x(m.start), width: x(m.end) - x(m.start), top: rowOf.get(m.machineId)! * ROW + 4, height: ROW - 8 }}
              title={`Manutenção: ${m.reason} (${dataHora(m.start)} a ${dataHora(m.end)})`}
            >
              <span>Manutenção</span>
            </div>
          ))}
          <div className="gantt-now" style={{ left: x(plan.now) }} aria-hidden>
            <span>Agora</span>
          </div>
        </div>

        {/* linhas e barras */}
        {rows.map((m, i) => {
          const occ = occupancy(plan.slots, m.id, viewStart, viewStart + 14 * 24 * HOUR);
          return (
            <div key={m.id} className="gantt-row" style={{ top: HEADER + i * ROW, height: ROW }}>
              <div className="gantt-label" style={{ width: LABEL_W }}>
                <strong>{m.code}</strong>
                <span className="muted">{m.tonnage} t</span>
                <span className="gantt-occ" title={`Ocupação nas 2 semanas: ${pct(occ)}`}>
                  <span style={{ width: `${occ * 100}%` }} />
                </span>
                <span className="muted gantt-occ-txt">{pct(occ)}</span>
              </div>
            </div>
          );
        })}

        <div className="gantt-bars" style={{ top: HEADER, left: LABEL_W, width, height: rows.length * ROW }}>
          {plan.slots.map((s) => {
            const order = ix.order.get(s.orderId)!;
            const mold = ix.mold.get(order.moldId)!;
            const machine = ix.machine.get(s.machineId)!;
            const risco = order.status !== 'Concluída' && isAtRisk(s, order);
            const incompat = !isCompatible(machine, mold);
            const dragging = drag?.slotId === s.id && drag.moved;
            const estado = risco ? 'Em risco' : order.status;
            const left = x(s.start);
            const w = Math.max(6, x(s.end) - x(s.start));
            if (x(s.end) < 0 || left > width) return null;
            const label = `${order.number}, ${order.product}, ${machine.code}, ${dataHora(s.start)} a ${dataHora(s.end)}, entrega ${dataHora(order.dueDate)}, ${estado}${incompat ? ', molde incompatível' : ''}${s.locked ? ', travada' : ''}`;
            return (
              <button
                key={s.id}
                id={`slot-${s.id}`}
                type="button"
                className={[
                  'bar',
                  `bar--${order.status === 'Planejada' ? 'planejada' : order.status === 'Em produção' ? 'producao' : 'concluida'}`,
                  risco ? 'bar--risco' : '',
                  incompat ? 'bar--incompat' : '',
                  selectedId === s.id ? 'bar--sel' : '',
                  dragging ? 'bar--dragging' : '',
                ].join(' ')}
                style={{ left, width: w, top: rowOf.get(s.machineId)! * ROW + 5, height: ROW - 10 }}
                aria-label={label}
                title={label}
                onPointerDown={(e) => onPointerDown(e, s)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(e, s)}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => onKeyDown(e, s)}
              >
                {s.locked ? <LockClosed12Filled className="bar-lock" /> : null}
                <span className="bar-txt">{order.number}</span>
                {risco && w > 120 ? <span className="bar-flag">Em risco</span> : null}
              </button>
            );
          })}

          {ghost ? (
            <div
              className={`ghost ${ghost.v?.ok ? 'ghost--ok' : 'ghost--no'}`}
              style={{ left: x(ghost.start), width: Math.max(6, x(ghost.v?.end ?? ghost.start + (ghost.slot.end - ghost.slot.start)) - x(ghost.start)), top: ghost.row * ROW + 3, height: ROW - 6 }}
              aria-hidden
            >
              <div className="ghost-tip">
                <strong>{ghost.v?.ok ? `Cabe na ${ghost.machine.code}` : `Não cabe na ${ghost.machine.code}`}</strong>
                <span>{dataHora(ghost.start)}</span>
                {ghost.v && !ghost.v.ok ? ghost.v.reasons.map((r) => <span key={r} className="ghost-reason">{r}</span>) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <style>{`
        .gantt-maint{background-image:repeating-linear-gradient(135deg, ${tucci.surfaceSunk} 0 6px, #CBCFC6 6px 12px)}
      `}</style>
    </div>
  );
}
