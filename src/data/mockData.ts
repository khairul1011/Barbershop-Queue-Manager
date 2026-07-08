import { QueueEntry, WhatsAppRequest, Barber, Service } from '../types';

export const INITIAL_SERVICES: Service[] = [
  { id: '1', name: 'Classic Fade & Style', price: 150000, duration: 45 },
  { id: '2', name: 'Beard Grooming & Hot Towel', price: 90000, duration: 30 },
  { id: '3', name: 'Signature Haircut + Shave', price: 220000, duration: 60 },
  { id: '4', name: 'Hair Color Treatment', price: 350000, duration: 90 },
  { id: '5', name: 'Kids Haircut', price: 80000, duration: 30 }
];

export const INITIAL_BARBERS: Barber[] = [
  { id: 'b1', name: 'Marcus Vance', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', status: 'active', specialty: 'Skin Fades & Beards' },
  { id: 'b2', name: 'Kenji Sato', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', status: 'active', specialty: 'Classic Scissor Cuts' },
  { id: 'b3', name: 'Alex Gold', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', status: 'break', specialty: 'Hot Towel Shaves' }
];

export const INITIAL_QUEUE: QueueEntry[] = [
  // Today is Wednesday (based on the system time or general mock context)
  {
    id: 'q1',
    customerName: 'Dani Setiawan',
    status: 'Confirmed',
    timeRange: '~14:00 - 14:45',
    day: 'Wed',
    service: 'Classic Fade & Style',
    barber: 'Marcus Vance',
    phone: '+62 812-3456-7890',
    durationMinutes: 45
  },
  {
    id: 'q2',
    customerName: 'Ahmad Faisal',
    status: 'Confirmed',
    timeRange: '~14:45 - 15:15',
    day: 'Wed',
    service: 'Beard Grooming & Hot Towel',
    barber: 'Marcus Vance',
    phone: '+62 821-9876-5432',
    durationMinutes: 30
  },
  {
    id: 'q3',
    customerName: 'David Miller',
    status: 'Estimated',
    timeRange: '~15:30 - 16:30',
    queueNumber: 3,
    day: 'Wed',
    service: 'Signature Haircut + Shave',
    barber: 'Kenji Sato',
    phone: '+1 555-0199-332',
    durationMinutes: 60
  },
  {
    id: 'q4',
    customerName: 'Budi Santoso',
    status: 'Pending Reply',
    timeRange: '~17:00 - 17:30',
    day: 'Wed',
    service: 'Classic Fade & Style',
    barber: 'Kenji Sato',
    phone: '+62 878-1122-3344',
    durationMinutes: 30
  },

  // Monday
  {
    id: 'q-mon1',
    customerName: 'Hendra Wijaya',
    status: 'Confirmed',
    timeRange: '~10:00 - 10:45',
    day: 'Mon',
    service: 'Classic Fade & Style',
    barber: 'Marcus Vance',
    phone: '+62 813-1234-5678',
    durationMinutes: 45
  },
  {
    id: 'q-mon2',
    customerName: 'Kevin Hart',
    status: 'Estimated',
    timeRange: '~13:00 - 13:30',
    queueNumber: 2,
    day: 'Mon',
    service: 'Kids Haircut',
    barber: 'Kenji Sato',
    phone: '+1 555-0144-889',
    durationMinutes: 30
  },

  // Tuesday
  {
    id: 'q-tue1',
    customerName: 'Rian Hidayat',
    status: 'Confirmed',
    timeRange: '~11:15 - 12:15',
    day: 'Tue',
    service: 'Signature Haircut + Shave',
    barber: 'Alex Gold',
    phone: '+62 812-4455-6677',
    durationMinutes: 60
  },
  {
    id: 'q-tue2',
    customerName: 'Tommy Shelby',
    status: 'Confirmed',
    timeRange: '~14:00 - 14:45',
    day: 'Tue',
    service: 'Classic Fade & Style',
    barber: 'Marcus Vance',
    phone: '+44 7700 900077',
    durationMinutes: 45
  },

  // Thursday
  {
    id: 'q-thu1',
    customerName: 'Eko Prasetyo',
    status: 'Pending Reply',
    timeRange: '~15:00 - 15:30',
    day: 'Thu',
    service: 'Kids Haircut',
    barber: 'Kenji Sato',
    phone: '+62 899-8877-6655',
    durationMinutes: 30
  },
  {
    id: 'q-thu2',
    customerName: 'Gerry Adams',
    status: 'Estimated',
    timeRange: '~16:00 - 16:45',
    queueNumber: 1,
    day: 'Thu',
    service: 'Classic Fade & Style',
    barber: 'Marcus Vance',
    phone: '+62 856-1111-2222',
    durationMinutes: 45
  },

  // Friday
  {
    id: 'q-fri1',
    customerName: 'Farhan Azhar',
    status: 'Confirmed',
    timeRange: '~13:00 - 13:45',
    day: 'Fri',
    service: 'Classic Fade & Style',
    barber: 'Marcus Vance',
    phone: '+62 822-3344-5566',
    durationMinutes: 45
  },
  {
    id: 'q-fri2',
    customerName: 'Zack Snyder',
    status: 'Estimated',
    timeRange: '~15:00 - 16:30',
    queueNumber: 4,
    day: 'Fri',
    service: 'Hair Color Treatment',
    barber: 'Alex Gold',
    phone: '+1 555-0100-221',
    durationMinutes: 90
  },

  // Saturday
  {
    id: 'q-sat1',
    customerName: 'Aditya Putra',
    status: 'Confirmed',
    timeRange: '~11:00 - 11:45',
    day: 'Sat',
    service: 'Classic Fade & Style',
    barber: 'Kenji Sato',
    phone: '+62 811-9988-7766',
    durationMinutes: 45
  },

  // Sunday
  {
    id: 'q-sun1',
    customerName: 'Reza Rahadian',
    status: 'Estimated',
    timeRange: '~14:00 - 15:00',
    queueNumber: 1,
    day: 'Sun',
    service: 'Signature Haircut + Shave',
    barber: 'Marcus Vance',
    phone: '+62 812-0000-1111',
    durationMinutes: 60
  }
];

export const INITIAL_REQUESTS: WhatsAppRequest[] = [
  {
    id: 'req1',
    senderName: 'Dani Setiawan',
    senderPhone: '+62 812-3456-7890',
    receivedTime: '10:14 AM',
    message: 'Bro, booking buat senin sore jam 4 haircut + shave ya, atas nama Dani',
    extractedDay: 'Mon',
    extractedTime: '16:00',
    extractedService: 'Signature Haircut + Shave',
    status: 'pending'
  },
  {
    id: 'req2',
    senderName: 'Christian Bale',
    senderPhone: '+1 555-0199-881',
    receivedTime: '11:02 AM',
    message: 'Hello, need a clean fade tomorrow (Thursday) around 2:30 PM if you guys are free.',
    extractedDay: 'Thu',
    extractedTime: '14:30',
    extractedService: 'Classic Fade & Style',
    status: 'pending'
  },
  {
    id: 'req3',
    senderName: 'Yanto Wijaya',
    senderPhone: '+62 878-9999-8888',
    receivedTime: '12:30 PM',
    message: 'Mas, mau pangkas rambut aja sabtu besok siang jam 1-an bisa? Gak usah cuci.',
    extractedDay: 'Sat',
    extractedTime: '13:00',
    extractedService: 'Classic Fade & Style',
    status: 'pending'
  },
  {
    id: 'req4',
    senderName: 'Guntur Permana',
    senderPhone: '+62 813-8888-7777',
    receivedTime: 'Yesterday',
    message: 'Halo, minggu pagi jam 9 ada slot kosong? Mau rapikan jenggot aja sekalian handuk hangat.',
    extractedDay: 'Sun',
    extractedTime: '09:00',
    extractedService: 'Beard Grooming & Hot Towel',
    status: 'pending'
  }
];
