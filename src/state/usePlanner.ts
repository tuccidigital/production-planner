import { useCallback, useEffect, useMemo, useState } from 'react';
import { indexPlan, pushForward, validatePlacement, type Placement, type RescheduleResult } from '../domain/rules';
import type { Plan, Slot } from '../domain/types';
import type { PlanningService } from '../data/service';

export type Zoom = 'dia' | 'turno';

export function usePlanner(service: PlanningService | null) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>('dia');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!service) return;
    service.load().then(setPlan).catch((e: Error) => setError(e.message));
  }, [service]);

  const ix = useMemo(() => (plan ? indexPlan(plan) : null), [plan]);

  const persist = useCallback(
    async (before: Slot[], after: Slot[]) => {
      if (!service) return;
      const old = new Map(before.map((s) => [s.id, s]));
      const changed = after.filter((s) => {
        const o = old.get(s.id);
        return !o || o.start !== s.start || o.end !== s.end || o.machineId !== s.machineId || o.locked !== s.locked;
      });
      if (!changed.length) return;
      setSaving(true);
      try {
        await service.saveSlots(changed);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [service],
  );

  const validate = useCallback(
    (slotId: string, machineId: string, start: number): Placement | null => {
      if (!plan || !ix) return null;
      const slot = plan.slots.find((s) => s.id === slotId);
      if (!slot) return null;
      return validatePlacement(plan, ix, { orderId: slot.orderId, machineId, start, slotId, locked: slot.locked });
    },
    [plan, ix],
  );

  /** Move uma alocação se couber; senão, anuncia o motivo e não muda nada. */
  const move = useCallback(
    (slotId: string, machineId: string, start: number): boolean => {
      if (!plan || !ix) return false;
      const slot = plan.slots.find((s) => s.id === slotId);
      if (!slot) return false;
      const order = ix.order.get(slot.orderId)!;
      if (slot.locked) {
        setMessage(`${order.number} está travada. Destrave para mover.`);
        return false;
      }
      if (order.status !== 'Planejada') {
        setMessage(`${order.number} está ${order.status.toLowerCase()} e não pode ser movida.`);
        return false;
      }
      const r = validatePlacement(plan, ix, { orderId: slot.orderId, machineId, start, slotId, locked: slot.locked });
      if (!r.ok) {
        setMessage(`Não cabe: ${r.reasons.join('; ')}.`);
        return false;
      }
      let slots = r.slots;
      if (slot.machineId !== machineId) slots = pushForward(slots, slot.machineId, ix, plan.maintenance);
      const machine = ix.machine.get(machineId)!;
      setMessage(`${order.number} movida para a ${machine.code}.`);
      persist(plan.slots, slots);
      setPlan({ ...plan, slots });
      return true;
    },
    [plan, ix, persist],
  );

  const toggleLock = useCallback(
    (slotId: string) => {
      if (!plan || !ix) return;
      const slots = plan.slots.map((s) => (s.id === slotId ? { ...s, locked: !s.locked } : s));
      const s = slots.find((x) => x.id === slotId)!;
      setMessage(`${ix.order.get(s.orderId)!.number} ${s.locked ? 'travada' : 'destravada'}.`);
      persist(plan.slots, slots);
      setPlan({ ...plan, slots });
    },
    [plan, ix, persist],
  );

  const applyReschedule = useCallback(
    (r: RescheduleResult) => {
      if (!plan) return;
      persist(plan.slots, r.slots);
      setPlan({ ...plan, slots: r.slots });
      setMessage(`Reagendamento aplicado: ${r.moved.length} ordens movidas e ${r.placedNow.length} alocadas.`);
    },
    [plan, persist],
  );

  return { plan, ix, error, selectedId, setSelectedId, zoom, setZoom, message, setMessage, saving, validate, move, toggleLock, applyReschedule };
}
