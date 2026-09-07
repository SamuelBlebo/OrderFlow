import type { Timestamps } from './common';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export const ORDER_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'out_for_delivery',
  'delivered',
];

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface Order extends Timestamps {
  reference: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  channel: 'whatsapp' | 'manual';
  note: string | null;
}
