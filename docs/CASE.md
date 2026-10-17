---
titulo: Planejador de Produção
resumo: Gantt das 38 injetoras com arrastar e soltar que valida molde, manutenção e prazo na hora. Code App em React no Power Platform.
setor: Indústria de transformação de plástico
stack: Power Apps (Code App), React, TypeScript, Fluent UI, Dataverse
ficticio: true
video: /cases/planejador-producao.mp4
---

## Problema

O PCP da Lumina planejava 38 injetoras numa planilha colorida. Para remanejar uma ordem urgente, Caio Ferraz, gerente de Produção, conferia à mão se o molde cabia na máquina, se havia manutenção marcada e se a entrega ainda fechava. Uma troca levava uma hora, e erro de planilha só aparecia no chão de fábrica.

## O que construímos

Um Code App do Power Apps: uma aplicação React hospedada no Power Platform, com login, permissões e dados no Dataverse do cliente.

1. **PCP arrasta a ordem** no Gantt, por injetora, com zoom por dia ou por turno.
2. **A regra valida enquanto arrasta:** força do molde, sobreposição, manutenção e o setup que a troca de molde provoca na ordem seguinte.
3. **O painel mostra o que sobrou:** ordens em risco, sem injetora e com molde incompatível.
4. **Plano salvo no Dataverse**, com as travas de compromisso respeitadas.

## Como funciona

- **Gantt com validação ao vivo.** O destino fica verde quando cabe e vermelho com o motivo escrito quando não cabe.
- **Teclado completo.** Setas movem a ordem por hora ou por turno e trocam de injetora; tudo com leitor de tela.
- **Reagendamento automático.** Reorganiza por data de entrega e prioridade, sem mexer no que está travado ou em produção, e mostra antes e depois antes de gravar.
- **Indicadores.** Ocupação por injetora, ordens em risco e horas de setup na semana.

## Resultado esperado

Com os dados fictícios da Lumina, o reagendamento automático reduz as ordens em risco de 22 para 15, aloca as 15 ordens que estavam sem injetora e elimina os 2 moldes em máquina incompatível. Remanejar uma ordem passa de conferência manual para segundos, com o motivo de cada recusa na tela.

## Licenças necessárias

Power Apps Premium por usuário (Code App com Dataverse). Nenhum outro conector premium.

## Quanto tempo levou

Interface, regras e testes: cerca de 2 semanas de trabalho. A ligação com o Dataverse no ambiente do cliente: mais 3 a 5 dias.

*Empresa fictícia, dados fictícios.*
