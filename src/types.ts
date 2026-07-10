export type QueueStatus = 'Confirmed' | 'Estimated' | 'Pending Reply' | 'Completed';

export interface QueueEntry {
  id: string;
  customerName: string;
  status: QueueStatus;
  timeRange: string; // e.g. "~14:00-14:45"
  queueNumber?: number; // e.g. 3 (Antrian ke-3)
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  service: string;
  barber: string;
  phone: string;
  durationMinutes: number;
  completedAt?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface WhatsAppRequest {
  id: string;
  senderName: string;
  senderPhone: string;
  receivedTime: string;
  message: string;
  extractedDay: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  extractedTime: string; // e.g. "14:00" or "Afternoon"
  extractedService: string;
  status: RequestStatus;
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
