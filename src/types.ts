export type QueueStatus = 'Confirmed' | 'Estimated' | 'Pending Reply' | 'Completed';

export interface QueueEntry {
  id: string;
  customerName: string;
  status: QueueStatus;
  timeRange: string; // e.g. "~14:00-14:45"
  queueNumber?: number; // e.g. 3 (Antrian ke-3)
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  scheduledDate?: string; // YYYY-MM-DD format
  service: string;
  barber: string;
  phone: string;
  durationMinutes: number;
  startedAt?: string;
  completedAt?: string;
  paymentMethod?: 'cash' | 'qris' | null; // diisi saat "Selesaikan Sesi", menandakan sisa pembayaran telah lunas
  sourceRequestId?: string | null; // referensi ke whatsapp_requests apabila booking berasal dari WA (untuk menghitung sisa pembayaran setelah dikurangi DP)
  paymentTransactionId?: string | null; // payment_request_id Xendit apabila sisa pembayaran dilakukan melalui QRIS dashboard
  paymentQrAmount?: number | null; // nominal yang benar-benar dibayarkan melalui QR tersebut (dapat berbeda dari harga penuh apabila terdapat DP)
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

// Gerbang DP terpisah dari RequestStatus di atas — payment_status menentukan
// KAPAN sebuah request ditampilkan untuk di-approve/reject, sedangkan RequestStatus
// tetap sepenuhnya merupakan keputusan barber dan tidak berubah sama sekali.
export type PaymentStatus = 'unpaid' | 'paid' | 'expired' | 'failed';

export interface WhatsAppRequest {
  id: string;
  senderName: string;
  senderPhone: string;
  receivedTime: string;
  message: string;
  extractedDay: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  extractedTime: string; // e.g. "14:00" or "Afternoon"
  extractedService: string;
  extractedBarber?: string | null;
  status: RequestStatus;
  paymentStatus: PaymentStatus;
  dpAmount: number | null;
  paymentExpiresAt: string | null;
}

export interface Barber {
  id: string;
  name: string;
  avatar: string;
  status: 'active' | 'break' | 'off';
  specialty: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number; // minutes
}
