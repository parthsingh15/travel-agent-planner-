import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "OTP must be 6 digits"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  profile: z.record(z.unknown()).optional(),
});

const tripBaseSchema = z.object({
  title: z.string().min(2).max(200),
  destination: z.string().min(2).max(200),
  origin: z.string().max(200).optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  budget: z.number().positive("Budget must be positive"),
  currency: z.string().length(3).default("INR"),
  travelers: z.number().int().min(1).max(50).default(1),
  interests: z.array(z.string()).default([]),
  travelStyle: z
    .enum(["BUDGET", "MID_RANGE", "LUXURY", "ADVENTURE", "RELAXATION", "CULTURAL"])
    .default("MID_RANGE"),
  notes: z.string().max(2000).optional(),
});

export const createTripSchema = tripBaseSchema.refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must be after start date", path: ["endDate"] }
);

export const updateTripSchema = tripBaseSchema.partial();

export const chatMessageSchema = z.object({
  message: z.string().min(1, "Message is required").max(4000),
  sessionId: z.string().nullish(),
  tripId: z.string().nullish(),
});

export const paymentSchema = z.object({
  tripId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("INR"),
  description: z.string().optional(),
});

export const saveItinerarySchema = z.object({
  versionId: z.string(),
  name: z.string().min(1).max(200),
});

export const createBookingSchema = z.object({
  tripId: z.string().optional(),
  generationId: z.string().optional(),
  type: z.enum(["FLIGHT", "STAY", "ACTIVITY"]),
  title: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("INR"),
  metadata: z.record(z.unknown()).optional(),
});

export const advanceBookingSchema = z.object({
  step: z.enum(["SELECTED", "REVIEWING", "PAYMENT_PENDING", "CONFIRMED"]),
});

export const createPriceAlertSchema = z.object({
  tripId: z.string().optional(),
  type: z.enum(["FLIGHT", "STAY", "ACTIVITY"]),
  title: z.string().min(1).max(300),
  targetPrice: z.number().positive(),
  currentPrice: z.number().positive().optional(),
  currency: z.string().length(3).default("INR"),
  metadata: z.record(z.unknown()).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const flightSearchSchema = z
  .object({
    origin: z.string().min(2).max(200),
    destination: z.string().min(2).max(200),
    departDate: isoDate,
    returnDate: isoDate.optional(),
    passengers: z.coerce.number().int().min(1).max(50).default(1),
    cabinClass: z
      .enum(["economy", "premium_economy", "business", "first"])
      .default("economy"),
    currency: z.string().length(3).default("INR"),
    maxPrice: z.coerce.number().positive().optional(),
  })
  .refine(
    (v) => !v.returnDate || new Date(v.returnDate) >= new Date(v.departDate),
    { message: "Return date must be on or after the departure date", path: ["returnDate"] }
  );

export const hotelSearchSchema = z
  .object({
    destination: z.string().min(2).max(200),
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.coerce.number().int().min(1).max(50).default(2),
    rooms: z.coerce.number().int().min(1).max(20).optional(),
    currency: z.string().length(3).default("INR"),
    maxPrice: z.coerce.number().positive().optional(),
    minRating: z.coerce.number().min(0).max(10).optional(),
  })
  .refine((v) => new Date(v.checkOut) > new Date(v.checkIn), {
    message: "Check-out must be after check-in",
    path: ["checkOut"],
  });

export const createBookmarkSchema = z.object({
  type: z.enum(["FLIGHT", "STAY", "ACTIVITY", "RESTAURANT", "PLACE", "ITINERARY"]),
  title: z.string().min(1).max(300),
  subtitle: z.string().max(500).optional(),
  tripId: z.string().optional(),
  versionId: z.string().optional(),
  externalId: z.string().max(200).optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().length(3).default("INR"),
  notes: z.string().max(2000).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const createExpenseSchema = z.object({
  tripId: z.string().min(1),
  category: z.enum([
    "FLIGHTS",
    "ACCOMMODATION",
    "FOOD",
    "ACTIVITIES",
    "TRANSPORT",
    "SHOPPING",
    "OTHER",
  ]),
  description: z.string().min(1).max(300),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().length(3).default("INR"),
  spentAt: z.string().datetime({ offset: true }).or(isoDate).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateExpenseSchema = createExpenseSchema
  .omit({ tripId: true })
  .partial();

export const adminUpdateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  emailVerified: z.boolean().optional(),
});
