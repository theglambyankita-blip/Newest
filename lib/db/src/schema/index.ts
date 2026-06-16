import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";

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
  service: text("service"),
  bookingDate: text("booking_date"),
  bookingTime: text("booking_time"),
  location: text("location"),
  numPeople: text("num_people"),
  totalAud: numeric("total_aud"),
  paymentMethod: text("payment_method"),
  status: text("status").default("confirmed"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  sendReminder: text("send_reminder").default("false"),
  reminderSent: text("reminder_sent").default("false"),
  clientMessage: text("client_message"),
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
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;
