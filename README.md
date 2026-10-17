# P07 · Planejador de Produção

> Portfólio Tucci Digital Solutions. **Dados fictícios** da Lumina Componentes, empresa inventada.

## O problema

O PCP da Lumina planeja 38 injetoras numa planilha colorida. Remanejar uma ordem leva uma hora, porque é preciso conferir à mão se o molde cabe na máquina, se há manutenção marcada e se a ordem ainda cumpre a data de entrega.

## A solução

Um **Code App do Power Apps**: aplicação React + TypeScript construída localmente e hospedada no Power Platform, lendo e gravando no Dataverse. A tela principal é um Gantt por injetora com arrastar e soltar, validação enquanto arrasta, painel de conflitos, indicadores e reagendamento automático que só grava depois de você confirmar.

```
PCP arrasta a ordem  →  regra valida na hora  →  painel mostra o que sobrou  →  plano salvo no Dataverse
```

## Como rodar

Requisitos: Node.js 22+.

```bash
npm install
npm run dev:mock      # dados simulados em http://localhost:3000
npm test              # as 5 regras de agendamento (Vitest)
npm run e2e           # testes de ponta a ponta (Playwright)
npm run build:mock    # build estático com os dados simulados (pasta dist/)
```

No modo mock, o "agora" é fixo em qua 21/10/2026 10:00 para o cenário ser sempre o mesmo.

## Como usar

- **Arrastar** uma barra para outro horário ou outra injetora. O fantasma fica verde quando cabe e vermelho com o motivo quando não cabe (molde incompatível, sobreposição, manutenção, setup que empurra a ordem seguinte).
- **Teclado:** foque uma barra com Tab; setas movem 1 h (Shift: 8 h); para cima e para baixo trocam de injetora; Enter abre o detalhe.
- **Travar** uma ordem no detalhe: o reagendamento automático não mexe nela.
- **Reagendar automaticamente:** mostra antes e depois (ordens em risco, sem alocação, moldes incompatíveis, horas de setup) e só aplica se você confirmar.

## Regras de agendamento (testadas em `src/domain/rules.test.ts`)

1. Duração = quantidade ÷ cavidades × ciclo, mais 2 horas de setup quando o molde muda.
2. Molde só em injetora com força dentro da faixa do molde.
3. Sem sobreposição na mesma injetora; manutenção bloqueia.
4. Ordem que termina depois da data de entrega fica "Em risco".
5. Alocação travada não se move no reagendamento automático.

O reagendamento é guloso: ordena por data de entrega (prioridade alta ganha 1 dia de vantagem, baixa perde 1 dia) e põe cada ordem na injetora compatível onde ela termina mais cedo. No cenário da Lumina: ordens em risco caem de 22 para 15, sem alocação de 15 para 0 e moldes incompatíveis de 2 para 0.

## Estrutura

```
src/domain/     regras, tipos e testes (sem dependência de interface)
src/data/       cenário fictício (seed.ts), fonte mock e fonte Dataverse
src/state/      estado da tela (usePlanner)
src/ui/         Gantt, painéis, indicadores e diálogo de reagendamento
e2e/            testes Playwright e o gravador das telas do vídeo
docs/           arquitetura, case, roteiro de vídeo e gravações
```

## Limitações conhecidas

- A fonte Dataverse está documentada mas não ligada: depende do tenant da Tucci (ver `src/data/dataverseService.ts` e `docs/ARQUITETURA.md`).
- O reagendamento é heurístico, não otimiza globalmente. Para centenas de máquinas ou restrições de mão de obra, o caminho é um solver dedicado.
- Calendário de 24 h, 3 turnos, sem paradas de fim de semana.

## Licença do cliente

Power Apps Premium por usuário, como qualquer app que usa Dataverse.
