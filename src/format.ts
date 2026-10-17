const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const pad = (n: number) => String(n).padStart(2, '0');

export function dataHora(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function diaCurto(ms: number): string {
  const d = new Date(ms);
  return `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function horas(h: number): string {
  return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function numero(n: number): string {
  return n.toLocaleString('pt-BR');
}

/** Turno pelo horário de início: A 06–14, B 14–22, C 22–06. */
export function turno(ms: number): 'A' | 'B' | 'C' {
  const h = new Date(ms).getHours();
  return h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'C';
}
