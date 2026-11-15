const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requirePermission, requireAnyPermission, requireFeature } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");

const router = express.Router();
router.use(requireAuth, requireFeature("activity-log"));

function buildWhere(query) {
  const { entityType, userId, from, to } = query;
  const where = {};
  if (entityType) where.entityType = String(entityType);
  if (userId) where.userId = String(userId);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(String(to));
  }
  return where;
}

router.get("/", requirePermission("activity.view"), async (req, res) => {
  const { limit, offset } = req.query;
  const where = buildWhere(req.query);

  const take = Math.min(Number(limit) || 50, 200);
  const skip = Number(offset) || 0;

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.activityLog.count({ where }),
  ]);

  res.json({ logs, total });
});

// Deletes every entry matching the same filters the list uses (no filters = the whole log).
// The deletion itself is recorded afterwards so a cleared log is never silently empty.
router.delete("/", requirePermission("activity.delete"), async (req, res) => {
  const where = buildWhere(req.query);
  const { count } = await prisma.activityLog.deleteMany({ where });

  if (count > 0) {
    const { entityType, from, to } = req.query;
    await logActivity({
      userId: req.user.id,
      action: "DELETE",
      entityType: "ActivityLog",
      details: { deleted: count, ...(entityType ? { entityType } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    });
  }
  res.json({ deleted: count });
});

router.delete("/:id", requirePermission("activity.delete"), async (req, res) => {
  const { count } = await prisma.activityLog.deleteMany({ where: { id: req.params.id } });
  if (count === 0) return res.status(404).json({ error: "Log entry not found" });
  res.json({ deleted: 1 });
});

module.exports = router;
