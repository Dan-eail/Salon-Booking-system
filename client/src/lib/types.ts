export type Role = 'CUSTOMER' | 'OWNER' | 'STAFF' | 'ADMIN';
export type User = { id: string; email: string; phone: string | null; fullName: string; role: Role; locale: 'en' | 'am' };
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type Category = { id: string; slug: string; name: string; nameAm: string | null; group: string; imageUrl: string | null; isActive?: boolean; sortOrder?: number; serviceCount?: number };
export type Meta = { brandName: string; currency: string; timezone: string; categories: Category[]; locations: { id: string; city: string; neighborhood: string }[];
  notificationChannels: { channel: string; status: string }[]; payments: { provider: string; status: string; note: string }[]; contact: { phone: string; email: string; announcement: string } };
export type SalonCard = { id: string; slug: string; name: string; city: string; neighborhood: string; address: string; image: string | null; avgRating: string; reviewCount: number; priceLevel: number;
  isVerified: boolean; isDemo: boolean; bookingMode: 'INSTANT' | 'APPROVAL'; minPriceEtb: string | null; categories: { slug: string; name: string }[]; isFavorite: boolean };
export type Service = { id: string; name: string; description: string; durationMinutes: number; priceEtb: string; originalPriceEtb: string | null; imageUrl: string | null; category: { slug: string; name: string } };
export type Staff = { id: string; displayName: string; title: string | null; bio: string | null; avatarUrl: string | null; specialties: string[]; serviceIds: string[] };
export type Hours = { dayOfWeek: number; openMinutes: number; closeMinutes: number; isClosed: boolean };
export type Review = { id: string; rating: number; comment: string | null; ownerReply: string | null; createdAt: string; reviewer: string };
export type SalonDetail = Omit<SalonCard, 'image' | 'categories' | 'minPriceEtb'> & {
  description: string; phone: string; email: string | null; instagram: string | null; mapUrl: string | null; coverImage: string | null; cancellationHours: number; cancellationPolicy: string;
  paymentMode: string; depositPercent: number; images: { id: string; url: string; alt: string }[]; hours: Hours[]; services: Service[]; staff: Staff[]; reviews: Review[] };
export type Slot = { time: string; startAt: string; staffIds: string[] };
export type Booking = {
  id: string; serviceId: string; reference: string; status: AppointmentStatus; startAt: string; endAt: string; serviceName: string; priceEtb: string; durationMinutes: number; paymentStatus: string;
  guestName: string; guestPhone: string; notes: string | null; staffName: string; canCancel: boolean; canReschedule: boolean; canReview: boolean; cancellationDeadline: string; cancelledReason: string | null;
  salon: { id: string; name: string; slug: string; address: string; neighborhood: string; phone: string; mapUrl: string | null; cancellationHours: number; cancellationPolicy: string; bookingMode: string; depositPercent?: number; paymentMode?: string };
  history: { fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[]; payments: { amountEtb: string; provider: string; paidAt: string }[]; review: { rating: number; comment: string | null } | null };
export type PaymentInitiation = {
  checkoutUrl: string; txRef: string; depositEtb: string; totalEtb: string; remainingEtb: string; depositPercent: number; isSimulation: boolean; provider: string; methods: string[];
};
export type BookingRow = { id: string; reference: string; status: AppointmentStatus; startAt: string; endAt: string; serviceName: string; priceEtb: string; durationMinutes: number; salonName: string; salonSlug: string;
  neighborhood: string; staffName: string; reviewed: boolean; paymentStatus: string };
export type Notice = { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

export type OwnerSalon = { id: string; name: string; slug: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; isVerified: boolean; isDemo: boolean; level: 'owner' | 'staff' };
export type ApptRow = { id: string; reference: string; status: AppointmentStatus; startAt: string; endAt: string; serviceName: string; priceEtb: string; durationMinutes: number; paymentStatus: string;
  guestName: string; guestPhone: string; notes: string | null; ownerNotes: string | null; createdByOwner: boolean; staffId: string; staffName: string };
export type ApptDetail = ApptRow & { history: { fromStatus: string | null; toStatus: string; note: string | null; createdAt: string; changedBy: string | null }[];
  payments: { id: string; amountEtb: string; status: string; provider: string; paidAt: string | null }[]; customerEmail: string | null; outstandingEtb: string; cancelledReason: string | null };
export type Summary = { range: { from: string; to: string }; totals: { total: number; pending: number; confirmed: number; completed: number; cancelled: number; rejected: number; noShow: number };
  rates: { completionPct: number; cancellationPct: number }; bookingValueEtb: string; recordedRevenueEtb: string; byDay: { date: string; count: number }[];
  popularServices: { name: string; bookings: number; valueEtb: string }[]; staffUtilization: { id: string; name: string; bookedHours: number; availableHours: number; utilizationPct: number }[]; notes: { bookingValue: string; recordedRevenue: string } };
export type OwnerService = { id: string; name: string; description: string; categoryId: string; category: { id: string; name: string; slug: string }; priceEtb: string; durationMinutes: number; bufferMinutes: number;
  promoPriceEtb: string | null; promoStartsAt: string | null; promoEndsAt: string | null; imageUrl: string | null; isActive: boolean; bookingCount: number; staffIds: string[] };
export type OwnerStaff = { id: string; displayName: string; title: string | null; bio: string | null; avatarUrl: string | null; specialties: string[]; isActive: boolean; serviceIds: string[]; loginEmail: string | null;
  schedules: { id: string; dayOfWeek: number; startMinutes: number; endMinutes: number }[]; breaks: { id: string; dayOfWeek: number; startMinutes: number; endMinutes: number; label: string }[]; timeOff: { id: string; startAt: string; endAt: string; reason: string | null }[] };
export type OwnerProfile = SalonDetail & { status: string; bookingBufferMinutes: number; minNoticeMinutes: number; maxAdvanceDays: number; priceLevel: number; latitude: string | null; longitude: string | null; onlinePaymentAvailable: boolean };
