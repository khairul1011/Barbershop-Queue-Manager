import { WhatsAppRequest } from '../types';

export type PaymentStatusVariant = 'emerald' | 'amber' | 'gray';

/**
 * Single source of truth for what color bucket a payment status falls into
 * — mirrors the convention in queueStatus.ts.
 */
export function getPaymentStatusVariant(
  paymentStatus: WhatsAppRequest['paymentStatus']
): PaymentStatusVariant {
  switch (paymentStatus) {
    case 'paid': return 'emerald';
    case 'unpaid': return 'amber';
    default: return 'gray';
  }
}
