import type { Plan, Slot } from '../domain/types';
import type { PlanningService } from './service';
import { buildPlan } from './seed';

/** Dados simulados da Lumina em memória, com uma pequena espera para parecer rede. */
export class MockPlanningService implements PlanningService {
  readonly name = 'Dados simulados';
  private plan: Plan = buildPlan();

  async load(): Promise<Plan> {
    await new Promise((r) => setTimeout(r, 150));
    return structuredClone(this.plan);
  }

  async saveSlots(changed: Slot[]): Promise<void> {
    const byId = new Map(changed.map((s) => [s.id, s]));
    const kept = this.plan.slots.filter((s) => !byId.has(s.id));
    this.plan = { ...this.plan, slots: [...kept, ...changed] };
    await new Promise((r) => setTimeout(r, 80));
  }
}
