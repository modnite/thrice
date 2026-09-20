import { prisma } from "@thrice/db";

/**
 * Defensive nightly pass: recompute each article's usage count/hours from
 * its completed order lines, so drift (from bugs, manual DB edits, etc.)
 * self-heals instead of silently accumulating.
 */
export async function reconcileArticleUsage() {
  const articles = await prisma.article.findMany({ select: { id: true } });
  let updated = 0;

  for (const { id } of articles) {
    const lines = await prisma.orderLine.findMany({
      where: { articleId: id, booking: { order: { status: "COMPLETED" } } },
      include: { booking: { include: { order: true } } },
    });

    const usageCount = lines.length;
    const usageHours = lines.reduce((sum, l) => {
      // Usage is time actually out: from the start to the real return, not the booked window.
      const order = l.booking.order;
      const start = order.startedAt ?? l.booking.startAt ?? order.startAt;
      const end = order.endedAt ?? l.booking.endAt ?? order.endAt;
      return sum + Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
    }, 0);

    await prisma.article.update({
      where: { id },
      data: { usageCount, usageHours },
    });
    updated++;
  }

  return { updated };
}
