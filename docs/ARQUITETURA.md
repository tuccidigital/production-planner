# Arquitetura · Planejador de Produção

## Componentes

| Camada | O que faz | Onde |
| --- | --- | --- |
| Interface | React 18 + Fluent UI v9 com o tema Tucci; Gantt próprio (sem biblioteca), arrastar com Pointer Events e teclado | `src/ui`, `src/App.tsx` |
| Estado | Carrega o plano, valida e aplica movimentos, salva o que mudou | `src/state/usePlanner.ts` |
| Domínio | Regras de agendamento, conflitos, indicadores e reagendamento; funções puras, testadas | `src/domain` |
| Dados | Interface `PlanningService` com duas implementações: mock em memória e Dataverse | `src/data` |
| Hospedagem | Code App no Power Platform (`pa app push`) ou build estático para demonstração | `vite.config.ts` com `base: './'` |

## Dados (Dataverse, solução `TucciPlanejamento`, prefixo `tcc`)

| Tabela | Colunas |
| --- | --- |
| `tcc_machine` (Injetora) | código, nome, força de fechamento (t), área, ativa |
| `tcc_mold` (Molde) | código, produto, cavidades, ciclo (s), força mínima (t), força máxima (t) |
| `tcc_productionorder` (Ordem) | número, produto, molde, quantidade, data de entrega, prioridade, estado (Planejada, Em produção, Concluída) |
| `tcc_scheduleslot` (Alocação) | ordem, injetora, início, fim, travada |
| `tcc_maintenancewindow` (Manutenção) | injetora, início, fim, motivo |

O mapeamento para os tipos do app fica em `src/domain/types.ts`. Datas trafegam em UTC e são exibidas no fuso do usuário.

## Ligar ao Dataverse (quando o tenant existir)

Comandos conferidos no `@microsoft/power-apps-cli` 1.3.0 com `pa app --help`. Confira de novo antes de rodar.

1. Criar a solução e as tabelas acima no ambiente de desenvolvimento.
2. `pa app init --environment-id <id> --display-name "Planejador de Produção"`
3. `pa app add data-source --connector dataverse --table tcc_machine` (repetir para as outras quatro tabelas). Gera os serviços tipados em `src/generated/`.
4. Implementar `load()` e `saveSlots()` em `src/data/dataverseService.ts` usando esses serviços.
5. `npm run build` e `pa app push --solution-id <id-da-solucao>`.

## Segurança

- Login e permissões vêm do Power Platform: o app roda com a identidade do usuário e respeita as funções de segurança do Dataverse.
- Sugestão de funções: **PCP** (lê tudo, escreve alocações), **Produção** (só leitura), **Administrador** (cadastros).
- Nada de segredo no código; `.env.example` só tem a escolha da fonte de dados.

## Licenças para o cliente

- Power Apps Premium por usuário (Code App com Dataverse).
- Nenhum conector premium além do Dataverse.

## Decisões

- **Gantt próprio em vez de biblioteca:** controle total do arrastar com validação e da acessibilidade por teclado, e nenhuma licença comercial de componente.
- **Domínio em funções puras:** as regras são testadas sem navegador e podem ser reaproveitadas num fluxo ou numa API.
- **Reagendamento guloso:** simples de explicar ao PCP e rápido para 120 ordens. Troca por solver só se o cliente precisar.
