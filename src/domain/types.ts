/** Modelo do planejamento. Datas em milissegundos (epoch) para facilitar a conta. */

export type Machine = {
  id: string;
  code: string; // IJ-07
  name: string;
  tonnage: number; // força de fechamento em toneladas
  area: string;
  active: boolean;
};

export type Mold = {
  id: string;
  code: string; // M-012
  product: string;
  cavities: number;
  cycleSeconds: number;
  minTonnage: number;
  maxTonnage: number;
};

export type OrderStatus = 'Planejada' | 'Em produção' | 'Concluída';

export type Order = {
  id: string;
  number: string; // OP-1043
  product: string;
  moldId: string;
  quantity: number;
  dueDate: number;
  priority: 1 | 2 | 3; // 1 = alta
  status: OrderStatus;
};

export type Slot = {
  id: string;
  orderId: string;
  machineId: string;
  start: number;
  end: number;
  locked: boolean;
};

export type Maintenance = {
  id: string;
  machineId: string;
  start: number;
  end: number;
  reason: string;
};

export type Plan = {
  machines: Machine[];
  molds: Mold[];
  orders: Order[];
  slots: Slot[];
  maintenance: Maintenance[];
  /** Início do horizonte exibido (segunda-feira, 06:00) e o "agora" do cenário. */
  horizonStart: number;
  now: number;
};

export const HOUR = 3_600_000;
export const SETUP_MS = 2 * HOUR;
