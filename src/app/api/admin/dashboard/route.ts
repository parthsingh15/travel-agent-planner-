import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";

export async function GET() {
  try {
    await requireAdmin();

    const [
      userCount,
      tripCount,
      generationCount,
      paymentCount,
      totalRevenue,
      bookingCount,
      bookmarkCount,
      activeAlertCount,
      expenseTotal,
      generationsByStatus,
      topDestinations,
      recentUsers,
      recentTrips,
      recentGenerations,
      recentPayments,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.trip.count(),
      prisma.itineraryGeneration.count(),
      prisma.payment.count(),
      prisma.payment.aggregate({
        where: { status: "SUCCEEDED" },
        _sum: { amount: true },
      }),
      prisma.booking.count(),
      prisma.bookmark.count(),
      prisma.priceAlert.count({ where: { status: "ACTIVE" } }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.itineraryGeneration.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.trip.groupBy({
        by: ["destination"],
        _count: { _all: true },
        orderBy: { _count: { destination: "desc" } },
        take: 5,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      }),
      prisma.trip.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.itineraryGeneration.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          trip: {
            select: {
              title: true,
              destination: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      generationsByStatus.map((row) => [row.status, row._count._all])
    );
    const completed = statusCounts.COMPLETED ?? 0;
    const failed = statusCounts.FAILED ?? 0;
    const finished = completed + failed;

    return apiSuccess({
      analytics: {
        userCount,
        tripCount,
        generationCount,
        paymentCount,
        totalRevenue: totalRevenue._sum.amount || 0,
        bookingCount,
        bookmarkCount,
        activeAlertCount,
        totalExpenses: expenseTotal._sum.amount || 0,
        generationsByStatus: statusCounts,
        // Share of finished runs that produced an itinerary.
        generationSuccessRate:
          finished > 0 ? Math.round((completed / finished) * 100) : null,
        topDestinations: topDestinations.map((row) => ({
          destination: row.destination,
          trips: row._count._all,
        })),
      },
      recentUsers,
      recentTrips,
      recentGenerations,
      recentPayments,
      recentAuditLogs,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
