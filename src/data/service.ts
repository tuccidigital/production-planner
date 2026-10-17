import type { Plan, Slot } from '../domain/types';

/**
 * Fonte de dados do planejador. No modo mock (`npm run dev:mock`) tudo fica em memória;
 * publicado como Code App, a implementação Dataverse lê e grava as tabelas tcc_*.
 */
export interface PlanningService {
  readonly name: string;
  load(): Promise<Plan>;
  /** Grava as alocações alteradas (inseridas ou movidas). */
  saveSlots(changed: Slot[]): Promise<void>;
}

export async function createService(): Promise<PlanningService> {
  if (import.meta.env.MODE === 'mock' || import.meta.env.VITE_FONTE === 'mock') {
    const { MockPlanningService } = await import('./mockService');
    return new MockPlanningService();
  }
  const { DataversePlanningService } = await import('./dataverseService');
  return new DataversePlanningService();
}
