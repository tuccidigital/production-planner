import { Button, MessageBar, MessageBarBody, Spinner, Tab, TabList } from '@fluentui/react-components';
import { ArrowSync20Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import { createService, type PlanningService } from './data/service';
import { reschedule, type Conflict, type RescheduleResult } from './domain/rules';
import { usePlanner, type Zoom } from './state/usePlanner';
import { Gantt } from './ui/Gantt';
import { ConflictsPanel, Details, Kpis, RescheduleDialog, useKpis } from './ui/Panels';

export function App() {
  const [service, setService] = useState<PlanningService | null>(null);
  useEffect(() => {
    createService().then(setService);
  }, []);
  const p = usePlanner(service);

  if (p.error) {
    return (
      <Shell fonte={service?.name}>
        <MessageBar intent="error"><MessageBarBody>{p.error}</MessageBarBody></MessageBar>
      </Shell>
    );
  }
  if (!p.plan || !p.ix) {
    return (
      <Shell fonte={service?.name}>
        <Spinner label="Carregando o plano..." />
      </Shell>
    );
  }
  return <Planner p={{ ...p, plan: p.plan, ix: p.ix }} fonte={service?.name} />;
}

type PlannerState = ReturnType<typeof usePlanner>;
type Ready = Omit<PlannerState, 'plan' | 'ix'> & { plan: NonNullable<PlannerState['plan']>; ix: NonNullable<PlannerState['ix']> };

function Planner({ p, fonte }: { p: Ready; fonte?: string }) {
  const k = useKpis(p.plan, p.ix);
  const [dialog, setDialog] = useState(false);
  const [proposta, setProposta] = useState<RescheduleResult | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  const abrirReagendar = () => {
    setProposta(reschedule(p.plan, p.ix));
    setDialog(true);
  };
  const irPara = (c: Conflict) => {
    if (!c.slotId) return;
    p.setSelectedId(c.slotId);
    setFocus({ id: c.slotId, n: Date.now() });
  };

  return (
    <Shell fonte={fonte}>
      <div className="toolbar">
        <div>
          <h1>Planejamento das injetoras</h1>
          <p className="muted">Arraste uma ordem para outra injetora ou horário. A validação mostra na hora se cabe e por quê.</p>
        </div>
        <div className="toolbar-actions">
          <TabList selectedValue={p.zoom} onTabSelect={(_, d) => p.setZoom(d.value as Zoom)} size="small" aria-label="Zoom">
            <Tab value="dia">Dia</Tab>
            <Tab value="turno">Turno</Tab>
          </TabList>
          <Button appearance="primary" icon={<ArrowSync20Regular />} onClick={abrirReagendar}>Reagendar automaticamente</Button>
        </div>
      </div>
      <Kpis k={k} />
      <div className="workspace">
        <Gantt
          plan={p.plan}
          ix={p.ix}
          zoom={p.zoom}
          selectedId={p.selectedId}
          focusRequest={focus}
          onSelect={p.setSelectedId}
          validate={p.validate}
          onMove={p.move}
          onAnnounce={() => undefined}
        />
        <aside className="side">
          {p.selectedId ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Ordem selecionada</h2>
                <Button size="small" appearance="subtle" onClick={() => p.setSelectedId(null)}>Fechar</Button>
              </div>
              <Details plan={p.plan} ix={p.ix} slotId={p.selectedId} onToggleLock={p.toggleLock} />
            </section>
          ) : null}
          <section className="panel">
            <h2>Conflitos</h2>
            <ConflictsPanel conflicts={k.conflicts} onGo={irPara} />
          </section>
        </aside>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{p.message}</div>
      {p.message ? <div className="toast" role="presentation">{p.message}{p.saving ? ' Salvando...' : ''}</div> : null}
      <RescheduleDialog
        plan={p.plan}
        ix={p.ix}
        result={proposta}
        open={dialog}
        onOpenChange={setDialog}
        onApply={() => {
          if (proposta) p.applyReschedule(proposta);
          setDialog(false);
        }}
      />
    </Shell>
  );
}

function Shell({ children, fonte }: { children: React.ReactNode; fonte?: string }) {
  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-brand">
          <img src={`${import.meta.env.BASE_URL}marca/tucci-symbol-reverse.svg`} alt="" width={22} height={24} />
          <span className="appbar-title">Planejador de Produção</span>
          <span className="appbar-sub">Lumina Componentes</span>
        </div>
        <span className="pill-ficticio">Dados fictícios{fonte ? ` · ${fonte}` : ''}</span>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
