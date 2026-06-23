import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ enums */
export const roleEnum = pgEnum('role', ['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN']);
export const salonStatusEnum = pgEnum('salon_status', ['PENDING', 'ACTIVE', 'SUSPENDED']);
export const bookingModeEnum = pgEnum('booking_mode', ['INSTANT', 'APPROVAL']);
export const paymentModeEnum = pgEnum('payment_mode', [
  'PAY_AT_SALON',
  'DEPOSIT_REQUIRED',
  'ONLINE_PAYMENT',
]);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'UNPAID',
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
]);
export const paymentProviderEnum = pgEnum('payment_provider', [
  'CASH_AT_SALON',
  'TELEBIRR',
  'CBE_BIRR',
  'CHAPA',
  'OTHER',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'BOOKING_CREATED',
  'BOOKING_CONFIRMED',
  'BOOKING_REJECTED',
  'BOOKING_CANCELLED',
  'BOOKING_RESCHEDULED',
  'BOOKING_REMINDER',
  'NEW_BOOKING_ALERT',
  'REVIEW_RECEIVED',
  'SYSTEM',
]);
export const promotionTypeEnum = pgEnum('promotion_type', ['PERCENT', 'FIXED']);

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

/* ------------------------------------------------------------------ users */
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull().unique(),
    phone: text('phone').unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    role: roleEnum('role').notNull().default('CUSTOMER'),
    isActive: boolean('is_active').notNull().default(true),
    locale: text('locale').notNull().default('en'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('users_role_idx').on(t.role)],
);

export const customerProfiles = pgTable('customer_profiles', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  city: text('city'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locations = pgTable(
  'locations',
  {
    id: id(),
    city: text('city').notNull(),
    neighborhood: text('neighborhood').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('locations_city_neighborhood_uq').on(t.city, t.neighborhood)],
);

/* ----------------------------------------------------------------- salons */
export const salons = pgTable(
  'salons',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    city: text('city').notNull().default('Addis Ababa'),
    neighborhood: text('neighborhood').notNull(),
    address: text('address').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    mapUrl: text('map_url'),
    phone: text('phone').notNull(),
    email: text('email'),
    instagram: text('instagram'),
    coverImage: text('cover_image'),
    status: salonStatusEnum('status').notNull().default('PENDING'),
    isVerified: boolean('is_verified').notNull().default(false),
    isDemo: boolean('is_demo').notNull().default(false),
    bookingMode: bookingModeEnum('booking_mode').notNull().default('INSTANT'),
    paymentMode: paymentModeEnum('payment_mode').notNull().default('PAY_AT_SALON'),
    depositPercent: integer('deposit_percent').notNull().default(0),
    cancellationHours: integer('cancellation_hours').notNull().default(24),
    cancellationPolicy: text('cancellation_policy')
      .notNull()
      .default('Free cancellation up to 24 hours before your appointment.'),
    bookingBufferMinutes: integer('booking_buffer_minutes').notNull().default(0),
    minNoticeMinutes: integer('min_notice_minutes').notNull().default(60),
    maxAdvanceDays: integer('max_advance_days').notNull().default(60),
    priceLevel: integer('price_level').notNull().default(2),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).notNull().default('0'),
    reviewCount: integer('review_count').notNull().default(0),
    bookingCount: integer('booking_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('salons_city_neighborhood_idx').on(t.city, t.neighborhood),
    index('salons_status_idx').on(t.status),
    index('salons_owner_idx').on(t.ownerId),
    index('salons_rating_idx').on(t.avgRating),
    check('salons_deposit_pct_chk', sql`${t.depositPercent} between 0 and 100`),
    check('salons_price_level_chk', sql`${t.priceLevel} between 1 and 4`),
  ],
);

export const salonImages = pgTable(
  'salon_images',
  {
    id: id(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alt: text('alt').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('salon_images_salon_idx').on(t.salonId)],
);

export const staffProfiles = pgTable(
  'staff_profiles',
  {
    id: id(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    title: text('title'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    specialties: text('specialties').array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('staff_salon_user_uq').on(t.salonId, t.userId),
    index('staff_salon_active_idx').on(t.salonId, t.isActive),
  ],
);

export const serviceCategories = pgTable('service_categories', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  nameAm: text('name_am'),
  group: text('group').notNull().default('hair'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const services = pgTable(
  'services',
  {
    id: id(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceEtb: money('price_etb').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    promoPriceEtb: money('promo_price_etb'),
    promoStartsAt: timestamp('promo_starts_at', { withTimezone: true }),
    promoEndsAt: timestamp('promo_ends_at', { withTimezone: true }),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    bookingCount: integer('booking_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('services_salon_active_idx').on(t.salonId, t.isActive),
    index('services_category_idx').on(t.categoryId),
    check('services_price_chk', sql`${t.priceEtb} >= 0`),
    check('services_duration_chk', sql`${t.durationMinutes} between 5 and 720`),
    check('services_buffer_chk', sql`${t.bufferMinutes} between 0 and 240`),
  ],
);

export const staffServices = pgTable(
  'staff_services',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] }), index('staff_services_service_idx').on(t.serviceId)],
);

/* ------------------------------------------------- hours & availability
   Minutes are minutes since local midnight (Africa/Addis_Ababa).
   dayOfWeek: 0 = Sunday ... 6 = Saturday. */
export const businessHours = pgTable(
  'business_hours',
  {
    id: id(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    openMinutes: integer('open_minutes').notNull(),
    closeMinutes: integer('close_minutes').notNull(),
    isClosed: boolean('is_closed').notNull().default(false),
  },
  (t) => [
    uniqueIndex('business_hours_salon_day_uq').on(t.salonId, t.dayOfWeek),
    check('business_hours_dow_chk', sql`${t.dayOfWeek} between 0 and 6`),
    check('business_hours_range_chk', sql`${t.closeMinutes} > ${t.openMinutes}`),
  ],
);

export const staffSchedules = pgTable(
  'staff_schedules',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startMinutes: integer('start_minutes').notNull(),
    endMinutes: integer('end_minutes').notNull(),
  },
  (t) => [
    index('staff_schedules_idx').on(t.staffId, t.dayOfWeek),
    check('staff_schedules_dow_chk', sql`${t.dayOfWeek} between 0 and 6`),
    check('staff_schedules_range_chk', sql`${t.endMinutes} > ${t.startMinutes}`),
  ],
);

export const staffBreaks = pgTable(
  'staff_breaks',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startMinutes: integer('start_minutes').notNull(),
    endMinutes: integer('end_minutes').notNull(),
    label: text('label').notNull().default('Break'),
  },
  (t) => [
    index('staff_breaks_idx').on(t.staffId, t.dayOfWeek),
    check('staff_breaks_range_chk', sql`${t.endMinutes} > ${t.startMinutes}`),
  ],
);

export const staffTimeOff = pgTable(
  'staff_time_off',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('staff_time_off_idx').on(t.staffId, t.startAt, t.endAt),
    check('staff_time_off_range_chk', sql`${t.endAt} > ${t.startAt}`),
  ],
);

/* ----------------------------------------------------------- appointments
   start_at / end_at / blocked_until are stored in UTC. blocked_until includes
   the service + salon buffer. A Postgres exclusion constraint (added in the
   hand-written migration) forbids overlapping active appointments per staff. */
export const appointments = pgTable(
  'appointments',
  {
    id: id(),
    reference: text('reference').notNull().unique(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => users.id, { onDelete: 'set null' }),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone').notNull(),
    guestEmail: text('guest_email'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }).notNull(),
    status: appointmentStatusEnum('status').notNull().default('PENDING'),
    priceEtb: money('price_etb').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    serviceName: text('service_name').notNull(),
    notes: text('notes'),
    ownerNotes: text('owner_notes'),
    createdByOwner: boolean('created_by_owner').notNull().default(false),
    cancelledReason: text('cancelled_reason'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('UNPAID'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('appointments_salon_start_idx').on(t.salonId, t.startAt),
    index('appointments_staff_idx').on(t.staffId, t.startAt, t.blockedUntil),
    index('appointments_customer_idx').on(t.customerId, t.startAt),
    index('appointments_status_idx').on(t.status),
    check('appointments_time_chk', sql`${t.endAt} > ${t.startAt} and ${t.blockedUntil} >= ${t.endAt}`),
  ],
);

export const appointmentStatusHistory = pgTable(
  'appointment_status_history',
  {
    id: id(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    fromStatus: appointmentStatusEnum('from_status'),
    toStatus: appointmentStatusEnum('to_status').notNull(),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('appt_history_appt_idx').on(t.appointmentId)],
);

export const favoriteSalons = pgTable(
  'favorite_salons',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.salonId] })],
);

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .unique()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    isHidden: boolean('is_hidden').notNull().default(false),
    ownerReply: text('owner_reply'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reviews_salon_idx').on(t.salonId, t.isHidden),
    index('reviews_user_idx').on(t.userId),
    check('reviews_rating_chk', sql`${t.rating} between 1 and 5`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'restrict' }),
    provider: paymentProviderEnum('provider').notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    amountEtb: money('amount_etb').notNull(),
    externalRef: text('external_ref'),
    recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payments_provider_ref_uq').on(t.provider, t.externalRef),
    index('payments_appt_idx').on(t.appointmentId),
    index('payments_status_idx').on(t.status),
    check('payments_amount_chk', sql`${t.amountEtb} > 0`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
);

export const promotions = pgTable(
  'promotions',
  {
    id: id(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    type: promotionTypeEnum('type').notNull().default('PERCENT'),
    value: money('value').notNull(),
    imageUrl: text('image_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('promotions_active_idx').on(t.isActive, t.startsAt, t.endsAt),
    check('promotions_range_chk', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/* ------------------------------------------------------- auth & auditing */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId), index('refresh_tokens_family_idx').on(t.familyId)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('pwd_reset_user_idx').on(t.userId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_actor_idx').on(t.actorId),
    index('audit_created_idx').on(t.createdAt),
  ],
);

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------- relations */
export const usersRelations = relations(users, ({ one, many }) => ({
  customerProfile: one(customerProfiles, {
    fields: [users.id],
    references: [customerProfiles.userId],
  }),
  ownedSalons: many(salons),
  appointments: many(appointments),
  notifications: many(notifications),
}));

export const salonsRelations = relations(salons, ({ one, many }) => ({
  owner: one(users, { fields: [salons.ownerId], references: [users.id] }),
  images: many(salonImages),
  staff: many(staffProfiles),
  services: many(services),
  hours: many(businessHours),
  reviews: many(reviews),
  appointments: many(appointments),
}));

export const salonImagesRelations = relations(salonImages, ({ one }) => ({
  salon: one(salons, { fields: [salonImages.salonId], references: [salons.id] }),
}));

export const staffRelations = relations(staffProfiles, ({ one, many }) => ({
  salon: one(salons, { fields: [staffProfiles.salonId], references: [salons.id] }),
  user: one(users, { fields: [staffProfiles.userId], references: [users.id] }),
  services: many(staffServices),
  schedules: many(staffSchedules),
  breaks: many(staffBreaks),
  timeOff: many(staffTimeOff),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  salon: one(salons, { fields: [services.salonId], references: [salons.id] }),
  category: one(serviceCategories, {
    fields: [services.categoryId],
    references: [serviceCategories.id],
  }),
  staff: many(staffServices),
}));

export const serviceCategoriesRelations = relations(serviceCategories, ({ many }) => ({
  services: many(services),
}));

export const staffServicesRelations = relations(staffServices, ({ one }) => ({
  staff: one(staffProfiles, { fields: [staffServices.staffId], references: [staffProfiles.id] }),
  service: one(services, { fields: [staffServices.serviceId], references: [services.id] }),
}));

export const businessHoursRelations = relations(businessHours, ({ one }) => ({
  salon: one(salons, { fields: [businessHours.salonId], references: [salons.id] }),
}));

export const staffSchedulesRelations = relations(staffSchedules, ({ one }) => ({
  staff: one(staffProfiles, { fields: [staffSchedules.staffId], references: [staffProfiles.id] }),
}));

export const staffBreaksRelations = relations(staffBreaks, ({ one }) => ({
  staff: one(staffProfiles, { fields: [staffBreaks.staffId], references: [staffProfiles.id] }),
}));

export const staffTimeOffRelations = relations(staffTimeOff, ({ one }) => ({
  staff: one(staffProfiles, { fields: [staffTimeOff.staffId], references: [staffProfiles.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  salon: one(salons, { fields: [appointments.salonId], references: [salons.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
  staff: one(staffProfiles, { fields: [appointments.staffId], references: [staffProfiles.id] }),
  customer: one(users, { fields: [appointments.customerId], references: [users.id] }),
  history: many(appointmentStatusHistory),
  payments: many(payments),
  review: one(reviews, { fields: [appointments.id], references: [reviews.appointmentId] }),
}));

export const appointmentHistoryRelations = relations(appointmentStatusHistory, ({ one }) => ({
  appointment: one(appointments, {
    fields: [appointmentStatusHistory.appointmentId],
    references: [appointments.id],
  }),
  changedBy: one(users, { fields: [appointmentStatusHistory.changedById], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  appointment: one(appointments, { fields: [reviews.appointmentId], references: [appointments.id] }),
  salon: one(salons, { fields: [reviews.salonId], references: [salons.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  appointment: one(appointments, { fields: [payments.appointmentId], references: [appointments.id] }),
}));

export const favoritesRelations = relations(favoriteSalons, ({ one }) => ({
  salon: one(salons, { fields: [favoriteSalons.salonId], references: [salons.id] }),
  user: one(users, { fields: [favoriteSalons.userId], references: [users.id] }),
}));

export const promotionsRelations = relations(promotions, ({ one }) => ({
  salon: one(salons, { fields: [promotions.salonId], references: [salons.id] }),
}));

export type User = typeof users.$inferSelect;
export type Salon = typeof salons.$inferSelect;
export type Service = typeof services.$inferSelect;
export type StaffProfile = typeof staffProfiles.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
