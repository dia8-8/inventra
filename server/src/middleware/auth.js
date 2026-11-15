const jwt = require("jsonwebtoken");
const { prismaRaw, runWithTenant } = require("../lib/db");
const { licenseFor } = require("../lib/license");
const { effectivePermissions } = require("../lib/permissions");

function buildAuth({ allowBlocked }) {
  return async function auth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prismaRaw.user.findUnique({ where: { id: payload.sub }, include: { tenant: true } });

      if (!user || !user.active) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Signing in again is required after a password reset
      if (user.passwordChangedAt && payload.iat * 1000 + 1000 < user.passwordChangedAt.getTime()) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      req.user = user;
      req.permissions = new Set(effectivePermissions(user));

      // Platform super admins belong to no tenant and are never license-gated.
      if (user.role === "SUPER_ADMIN") return next();

      if (!user.tenant) {
        return res.status(403).json({ error: "Account is not linked to a client" });
      }

      req.license = licenseFor(user.tenant);
      if (req.license.blocked && !allowBlocked) {
        return res.status(402).json({
          error: req.license.blockedReason === "EXPIRED" ? "Your license has expired" : "Your license is suspended",
          code: "LICENSE_BLOCKED",
          reason: req.license.blockedReason,
        });
      }

      // Everything downstream (routes, Prisma queries) runs scoped to this client.
      return runWithTenant(user.tenant.id, () => next());
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
  };
}

const requireAuth = buildAuth({ allowBlocked: false });
// For endpoints the UI must reach even when the license is blocked (to show why).
const requireAuthAllowBlocked = buildAuth({ allowBlocked: true });

// The signed-in user must hold the permission (admins hold all of them).
function requirePermission(permission) {
  return requireAnyPermission(permission);
}

// ...or hold at least one of several. Used for lookup lists (e.g. the customer list is also
// needed by anyone who can create orders, even without the Customers page).
function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.permissions || !permissions.some((p) => req.permissions.has(p))) {
      return res.status(403).json({ error: "You don't have permission to do that", code: "FORBIDDEN" });
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Plan-gated features. Must run after requireAuth.
function requireFeature(feature) {
  return (req, res, next) => {
    if (!req.license?.features.includes(feature)) {
      return res.status(403).json({ error: "This feature isn't included in your plan", code: "FEATURE_LOCKED", feature });
    }
    next();
  };
}

module.exports = { requireAuth, requireAuthAllowBlocked, requireRole, requireFeature, requirePermission, requireAnyPermission };
