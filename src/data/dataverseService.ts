import type { Plan, Slot } from '../domain/types';
import type { PlanningService } from './service';

/**
 * Implementação para o Code App publicado no Power Platform, lendo e gravando no Dataverse.
 *
 * Ainda não ligada: depende do tenant da Tucci. Quando ele existir:
 *   1. Criar a solução TucciPlanejamento com as tabelas da especificação (docs/ARQUITETURA.md).
 *   2. Na pasta do projeto: `pa app init --environment-id <id> --display-name "Planejador de Produção"`.
 *   3. Para cada tabela: `pa app add data-source --connector dataverse --table tcc_machine`
 *      (repita para tcc_mold, tcc_productionorder, tcc_scheduleslot e tcc_maintenancewindow).
 *      O comando gera os serviços tipados em src/generated/.
 *   4. Implementar load() e saveSlots() abaixo com esses serviços, convertendo para os tipos de domain/types.ts.
 *   5. `npm run build` e `pa app push --solution-id <id-da-solucao>`.
 * Comandos conferidos no @microsoft/power-apps-cli 1.3.0 (`pa app --help`); confira de novo antes de usar.
 */
export class DataversePlanningService implements PlanningService {
  readonly name = 'Dataverse';

  async load(): Promise<Plan> {
    throw new Error('Fonte Dataverse ainda não configurada. Rode `npm run dev:mock` para usar os dados simulados.');
  }

  async saveSlots(_changed: Slot[]): Promise<void> {
    throw new Error('Fonte Dataverse ainda não configurada.');
  }
}
