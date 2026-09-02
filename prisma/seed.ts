import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Demo data mirrors the reference trip: Delhi -> Jaipur, 3 days, 2 people,
 * Rs 20,000, History + Food.
 *
 * Place names here are real Jaipur landmarks, but the seeded costs are
 * illustrative demo values, not researched figures. Real itineraries are
 * produced by the agent pipeline, which attaches a source and a
 * VERIFIED/ESTIMATED label to every number it reports.
 */
async function main() {
  console.log("Seeding database...");

  const adminPassword = await bcrypt.hash("Admin123!", 12);
  const userPassword = await bcrypt.hash("User1234!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@travelplanner.com" },
    update: {},
    create: {
      email: "admin@travelplanner.com",
      name: "Admin User",
      passwordHash: adminPassword,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "user@travelplanner.com" },
    update: {},
    create: {
      email: "user@travelplanner.com",
      name: "Demo User",
      passwordHash: userPassword,
      role: Role.USER,
      emailVerified: true,
    },
  });

  const trip = await prisma.trip.upsert({
    where: { id: "seed-trip-1" },
    update: {},
    create: {
      id: "seed-trip-1",
      userId: user.id,
      title: "Jaipur Heritage Trip",
      destination: "Jaipur",
      origin: "Delhi",
      startDate: new Date("2026-11-14"),
      endDate: new Date("2026-11-16"),
      budget: 20000,
      currency: "INR",
      travelers: 2,
      interests: ["history", "food"],
      travelStyle: "MID_RANGE",
      status: "PLANNED",
      notes: "First trip to Rajasthan - keen on forts and street food.",
    },
  });

  const generation = await prisma.itineraryGeneration.upsert({
    where: { id: "seed-gen-1" },
    update: {},
    create: {
      id: "seed-gen-1",
      tripId: trip.id,
      status: "COMPLETED",
      currentAgent: "validation",
      completedAt: new Date(),
      orchestratorNotes: "Seeded demo plan (not a researched generation)",
    },
  });

  const version = await prisma.itineraryVersion.upsert({
    where: { id: "seed-version-1" },
    update: {},
    create: {
      id: "seed-version-1",
      tripId: trip.id,
      generationId: generation.id,
      versionNumber: 1,
      title: "3 Days in Jaipur",
      summary: "Forts, palaces and Rajasthani food across the Pink City",
      dayByDay: [
        {
          day: 1,
          date: "2026-11-14",
          title: "Arrival & Amber Fort",
          activities: [
            { time: "08:00", title: "Arrive in Jaipur", description: "Train from Delhi", estimatedCost: 0 },
            { time: "10:00", title: "Amber Fort", description: "Hilltop fort complex in Amer", estimatedCost: 200 },
            { time: "14:30", title: "City Palace", description: "Royal residence and museum", estimatedCost: 300 },
            { time: "17:00", title: "Hawa Mahal", description: "The Palace of Winds", estimatedCost: 50 },
          ],
          meals: [
            { type: "lunch", restaurant: "Local thali near Amer", estimatedCost: 250 },
            { type: "dinner", restaurant: "Johari Bazaar street food", estimatedCost: 300 },
          ],
          transportation: "Auto-rickshaw and walking",
          accommodation: "Budget hotel, Bani Park",
          dailyBudget: 5500,
        },
        {
          day: 2,
          date: "2026-11-15",
          title: "Nahargarh & Jantar Mantar",
          activities: [
            { time: "09:30", title: "Jantar Mantar", description: "18th-century astronomical observatory", estimatedCost: 200 },
            { time: "12:00", title: "Jal Mahal viewpoint", description: "Water palace on Man Sagar Lake", estimatedCost: 0 },
            { time: "16:00", title: "Nahargarh Fort", description: "Sunset over the city", estimatedCost: 200 },
          ],
          meals: [
            { type: "breakfast", restaurant: "Hotel breakfast", estimatedCost: 150 },
            { type: "dinner", restaurant: "Rajasthani thali", estimatedCost: 400 },
          ],
          transportation: "Day cab hire",
          accommodation: "Budget hotel, Bani Park",
          dailyBudget: 5000,
        },
        {
          day: 3,
          date: "2026-11-16",
          title: "Bazaars & departure",
          activities: [
            { time: "10:00", title: "Johari Bazaar", description: "Jewellery and textile market", estimatedCost: 0 },
            { time: "13:00", title: "Albert Hall Museum", description: "State museum in Ram Niwas Garden", estimatedCost: 150 },
            { time: "18:00", title: "Return to Delhi", description: "Evening train", estimatedCost: 0 },
          ],
          meals: [{ type: "lunch", restaurant: "Old city cafe", estimatedCost: 350 }],
          transportation: "Auto-rickshaw to station",
          accommodation: "Checked out",
          dailyBudget: 4000,
        },
      ],
      totalBudget: 20000,
      metadata: {
        tips: ["Carry cash for bazaars", "Forts open around 09:00"],
        seedData: true,
      },
    },
  });

  await prisma.payment.upsert({
    where: { id: "seed-payment-1" },
    update: {},
    create: {
      id: "seed-payment-1",
      userId: user.id,
      tripId: trip.id,
      amount: 499,
      currency: "INR",
      status: "SUCCEEDED",
      description: "Premium itinerary generation",
      stripePaymentId: "demo_seed_payment",
    },
  });

  // Expenses logged against the trip's Rs 20,000 budget.
  const seedExpenses = [
    { id: "seed-expense-1", category: "TRANSPORT", description: "Delhi-Jaipur train (2 x Rs 750)", amount: 1500, spentAt: "2026-11-14" },
    { id: "seed-expense-2", category: "ACCOMMODATION", description: "Hotel, 2 nights", amount: 4400, spentAt: "2026-11-14" },
    { id: "seed-expense-3", category: "ACTIVITIES", description: "Amber Fort + City Palace tickets", amount: 1000, spentAt: "2026-11-14" },
    { id: "seed-expense-4", category: "FOOD", description: "Johari Bazaar street food", amount: 600, spentAt: "2026-11-14" },
    { id: "seed-expense-5", category: "TRANSPORT", description: "Day cab hire", amount: 1800, spentAt: "2026-11-15" },
  ] as const;

  for (const expense of seedExpenses) {
    await prisma.expense.upsert({
      where: { id: expense.id },
      update: {},
      create: {
        id: expense.id,
        userId: user.id,
        tripId: trip.id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        currency: "INR",
        spentAt: new Date(expense.spentAt),
      },
    });
  }

  const seedBookmarks = [
    { id: "seed-bookmark-1", type: "PLACE", title: "Amber Fort", subtitle: "Amer, Jaipur", externalId: "amber-fort-jaipur" },
    { id: "seed-bookmark-2", type: "PLACE", title: "Hawa Mahal", subtitle: "Badi Choupad, Pink City", externalId: "hawa-mahal-jaipur" },
    { id: "seed-bookmark-3", type: "RESTAURANT", title: "Johari Bazaar street food", subtitle: "Old city market lane", externalId: "johari-bazaar-food" },
  ] as const;

  for (const bookmark of seedBookmarks) {
    await prisma.bookmark.upsert({
      where: { id: bookmark.id },
      update: {},
      create: {
        id: bookmark.id,
        userId: user.id,
        tripId: trip.id,
        type: bookmark.type,
        title: bookmark.title,
        subtitle: bookmark.subtitle,
        externalId: bookmark.externalId,
        currency: "INR",
      },
    });
  }

  await prisma.bookmark.upsert({
    where: { id: "seed-bookmark-4" },
    update: {},
    create: {
      id: "seed-bookmark-4",
      userId: user.id,
      tripId: trip.id,
      versionId: version.id,
      type: "ITINERARY",
      title: "3 Days in Jaipur (v1)",
      subtitle: "Saved from the AI planner",
      externalId: version.id,
      currency: "INR",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ADMIN_ACTION",
      entity: "System",
      details: { message: "Database seeded" },
    },
  });

  console.log("Seed completed!");
  console.log(
    `Seeded Delhi -> Jaipur trip (Rs 20,000), ${seedExpenses.length} expenses, ${seedBookmarks.length + 1} bookmarks.`
  );
  console.log("Admin: admin@travelplanner.com / Admin123!");
  console.log("User:  user@travelplanner.com / User1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
