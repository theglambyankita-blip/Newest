import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";

export const adminTokens = pgTable("admin_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  phoneNumber: text("phone_number"),
  service: text("service"),
  bookingDate: text("booking_date"),
  bookingTime: text("booking_time"),
  location: text("location"),
  numPeople: text("num_people"),
  totalAud: numeric("total_aud"),
  paymentMethod: text("payment_method"),
  paymentType: text("payment_type").default("deposit"),
  status: text("status").default("confirmed"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentToken: text("payment_token"),
  sendReminder: text("send_reminder").default("false"),
  reminderSent: text("reminder_sent").default("false"),
  clientMessage: text("client_message"),
  mainServicePrice: numeric("main_service_price"),
  adminNotes: text("admin_notes"),
  manualBooking: text("manual_booking").default("false"),
  bookingType: text("booking_type").default("website"),
  bookingStatus: text("booking_status").default("upcoming"),
  paymentStatus: text("payment_status").default("unpaid"),
  amountPaid: numeric("amount_paid").default("0"),
  balanceDue: numeric("balance_due"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const manualBookingItems = pgTable("manual_booking_items", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  name: text("name").notNull(),
  amount: numeric("amount").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentLinks = pgTable("payment_links", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  token: text("token").notNull().unique(),
  paymentOption: text("payment_option").notNull().default("deposit"),
  depositType: text("deposit_type").default("fixed"),
  depositValue: numeric("deposit_value"),
  amountDue: numeric("amount_due").notNull(),
  remainingPaymentMethod: text("remaining_payment_method").default("cash_or_online"),
  expiresAt: timestamp("expires_at"),
  disabled: text("disabled").notNull().default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const paymentRecords = pgTable("payment_records", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  amount: numeric("amount").notNull(),
  method: text("method").notNull(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  note: text("note"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: numeric("discount_value").notNull(),
  description: text("description").default(""),
  expiresAt: timestamp("expires_at"),
  maxUses: numeric("max_uses"),
  usesCount: numeric("uses_count").notNull().default("0"),
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminToken = typeof adminTokens.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export type ManualBookingItem = typeof manualBookingItems.$inferSelect;
export type InsertManualBookingItem = typeof manualBookingItems.$inferInsert;
export type PaymentLink = typeof paymentLinks.$inferSelect;
export type InsertPaymentLink = typeof paymentLinks.$inferInsert;
export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type InsertPaymentRecord = typeof paymentRecords.$inferInsert;
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;
