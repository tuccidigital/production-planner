---
titulo: Production Planner
resumo: Gantt chart of 38 injection molding machines with drag and drop that checks mold, maintenance and due date on the spot. A React Code App on the Power Platform.
setor: Plastics manufacturing
stack: Power Apps (Code App), React, TypeScript, Fluent UI, Dataverse
ficticio: true
video: /cases/planejador-producao-en.mp4
---

## Problem

Lumina's planning team scheduled 38 injection molding machines in a color-coded spreadsheet. To move an urgent order, Caio Ferraz, the production manager, checked by hand whether the mold fit the machine, whether maintenance was booked and whether the due date still held. One change took an hour, and spreadsheet mistakes only showed up on the shop floor.

## What we built

A Power Apps Code App: a React application hosted on the Power Platform, with sign-in, permissions and data in the client's Dataverse.

1. **Planners drag the order** on the Gantt chart, per machine, zoomed by day or by shift.
2. **Rules check while dragging:** mold tonnage, overlaps, maintenance and the mold change it causes on the next order.
3. **The side panel shows what is left:** orders at risk, without a machine, or on an incompatible mold.
4. **The plan is saved in Dataverse**, respecting locked commitments.

## How it works

- **Live validation.** The target turns green when the order fits and red, with the reason written out, when it does not.
- **Full keyboard support.** Arrow keys move the order by hour or shift and across machines, screen reader included.
- **Automatic rescheduling.** Reorders by due date and priority without touching locked or running orders, and shows before and after before saving.
- **Indicators.** Utilization per machine, orders at risk and setup hours in the week.

## Expected result

On Lumina's fictional data, automatic rescheduling cuts orders at risk from 22 to 15, places the 15 orders that had no machine and removes the 2 molds on incompatible machines. Moving an order goes from manual checking to seconds, with the reason for every rejection on screen.

## Licenses

Power Apps Premium per user (Code App with Dataverse). No other premium connector.

## Effort

Interface, rules and tests: about 2 weeks. Connecting to the client's Dataverse: 3 to 5 more days.

*Fictional company, fictional data.*
