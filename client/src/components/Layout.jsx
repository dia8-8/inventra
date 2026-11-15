import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  DashboardIcon,
  CustomersIcon,
  ProductsIcon,
  InventoryIcon,
  OrdersIcon,
  SuppliersIcon,
  ExpensesIcon,
  DeliveriesIcon,
  ReportsIcon,
  UsersAdminIcon,
  SettingsIcon,
  ActivityIcon,
  SunIcon,
  MoonIcon,
  ScanIcon,
  LogoutIcon,
} from "./icons";

// Up to two letters for the logo square: "Del Foods" -> "DF", "Maple" -> "M"
function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => Array.from(w)[0]).join("").toUpperCase();
}

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: DashboardIcon, end: true, group: "Overview" },
  { to: "/orders", label: "Orders", icon: OrdersIcon, group: "Sales" },
  { to: "/customers", label: "Customers", icon: CustomersIcon, group: "Sales" },
  { to: "/deliveries", label: "Deliveries", icon: DeliveriesIcon, feature: "deliveries", group: "Sales" },
  { to: "/products", label: "Products", icon: ProductsIcon, group: "Stock" },
  { to: "/inventory", label: "Inventory", icon: InventoryIcon, group: "Stock" },
  { to: "/scan", label: "Scan", icon: ScanIcon, feature: "barcode", group: "Stock" },
  { to: "/suppliers", label: "Suppliers", icon: SuppliersIcon, group: "Stock" },
  { to: "/expenses", label: "Expenses", icon: ExpensesIcon, group: "Finance" },
  { to: "/reports", label: "Reports", icon: ReportsIcon, feature: "reports", group: "Finance" },
];

const ADMIN_NAV_ITEMS = [
  { to: "/users", label: "Users", icon: UsersAdminIcon, group: "Admin" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, group: "Admin" },
  { to: "/activity-log", label: "Activity Log", icon: ActivityIcon, feature: "activity-log", group: "Admin" },
];

const PLATFORM_NAV_ITEMS = [{ to: "/platform", label: "Clients", icon: CustomersIcon, end: true }];

const DRIVER_NAV_ITEMS = [{ to: "/deliveries", label: "Deliveries", icon: DeliveriesIcon, end: true }];

const MOBILE_NAV_ITEMS = [
  { to: "/", label: "Home", icon: DashboardIcon, end: true },
  { to: "/orders", label: "Orders", icon: OrdersIcon },
  { to: "/customers", label: "Clients", icon: CustomersIcon },
  { to: "/products", label: "Products", icon: ProductsIcon },
  { to: "/inventory", label: "Stock", icon: InventoryIcon },
];

const ROLE_LABELS = { ADMIN: "Admin", STAFF: "Staff", DRIVER: "Driver", SUPER_ADMIN: "Platform owner" };

function groupItems(items) {
  const groups = [];
  for (const item of items) {
    const name = item.group || "";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, items: [] }));
    g.items.push(item);
  }
  return groups;
}

export default function Layout() {
  const { user, logout, license, hasFeature } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Close the mobile menu when the page changes
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const isDriver = user?.role === "DRIVER";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  // Hide anything the client's plan doesn't include
  const allowed = (list) => list.filter((i) => !i.feature || hasFeature(i.feature));
  const items = isSuperAdmin
    ? PLATFORM_NAV_ITEMS
    : isDriver
      ? DRIVER_NAV_ITEMS
      : user?.role === "ADMIN"
        ? allowed([...NAV_ITEMS, ...ADMIN_NAV_ITEMS])
        : allowed(NAV_ITEMS);
  const navGroups = groupItems(items);
  const mobileBottomItems = isSuperAdmin ? PLATFORM_NAV_ITEMS : isDriver ? DRIVER_NAV_ITEMS : MOBILE_NAV_ITEMS;
  const mobileExtraItems = isDriver || isSuperAdmin ? [] : allowed(NAV_ITEMS).filter((i) => !MOBILE_NAV_ITEMS.some((m) => m.to === i.to));
  const adminMobileItems = user?.role === "ADMIN" ? allowed(ADMIN_NAV_ITEMS) : [];
  const brandName = isSuperAdmin ? "Platform" : user?.companyName || "Inventra";
  const brandInitials = initialsOf(brandName);
  const userInitials = initialsOf(user?.name);

  // Title of the current page for the top bar: the most specific matching menu entry
  const currentItem = [...items, ...ADMIN_NAV_ITEMS]
    .filter((i) => (i.end ? location.pathname === i.to : location.pathname === i.to || location.pathname.startsWith(i.to + "/")))
    .sort((a, b) => b.to.length - a.to.length)[0];

  useEffect(() => {
    document.title = `${brandName} · Inventra`;
  }, [brandName]);

  const showLicenseBanner =
    license && !license.blocked && (license.plan === "TRIAL" || (license.daysLeft !== null && license.daysLeft <= 7));
  const contactEmail = import.meta.env.VITE_CONTACT_EMAIL;

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white dark:bg-gray-800/95 border-r border-gray-200/80 dark:border-gray-700/70 fixed inset-y-0 left-0 z-30">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-gray-200/80 dark:border-gray-700/70">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-brand-500/30">
            {brandInitials}
          </span>
          <div className="leading-tight min-w-0">
            <div className="font-semibold text-sm dark:text-gray-100 truncate max-w-[10rem]">{brandName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Management</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
          {navGroups.map((group) => (
            <div key={group.name}>
              {group.name && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{group.name}</div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-brand-500" />}
                        <item.icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? "text-brand-600 dark:text-brand-300" : ""}`} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200/80 dark:border-gray-700/70">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 p-2.5">
            <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-500 dark:to-gray-700 text-white text-xs font-semibold flex items-center justify-center">
              {userInitials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-medium truncate dark:text-gray-100">{user?.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{ROLE_LABELS[user?.role] || user?.role}</div>
            </div>
            <button onClick={toggleTheme} aria-label="Toggle dark mode" title={theme === "dark" ? "Light mode" : "Dark mode"} className="btn-ghost !p-2 !rounded-lg">
              {theme === "dark" ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
            <button onClick={handleLogout} aria-label="Log out" title="Log out" className="btn-ghost !p-2 !rounded-lg">
              <LogoutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col md:ml-64 min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white/80 dark:bg-gray-900/70 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 md:hidden">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center font-bold text-xs">{brandInitials}</span>
            <span className="font-semibold text-sm dark:text-gray-100 truncate max-w-[10rem]">{brandName}</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="text-gray-400 dark:text-gray-500">{brandName}</span>
            {currentItem && (
              <>
                <span className="text-gray-300 dark:text-gray-600">/</span>
                <span className="font-medium text-gray-800 dark:text-gray-100">{currentItem.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={toggleTheme} aria-label="Toggle dark mode" className="btn-ghost !p-2 md:hidden">
              {theme === "dark" ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <button onClick={toggleTheme} aria-label="Toggle dark mode" className="btn-ghost !p-2 hidden md:inline-flex">
              {theme === "dark" ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <button
              className="md:hidden flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Open menu"
            >
              <span className="h-7 w-7 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-500 dark:to-gray-700 text-white text-[11px] font-semibold flex items-center justify-center">
                {userInitials}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.name?.split(" ")[0] || "Menu"}</span>
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-2 shadow-pop animate-scale-in">
            {[...mobileExtraItems, ...adminMobileItems].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    isActive ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  }`
                }
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </NavLink>
            ))}
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
              <LogoutIcon className="w-5 h-5" />
              Log out
            </button>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-8">
          <div className="max-w-[1400px] mx-auto">
            {showLicenseBanner && (
              <div
                className={`mb-5 rounded-xl border px-4 py-2.5 text-sm ${
                  license.plan === "TRIAL"
                    ? "bg-brand-50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-900/40 text-brand-700 dark:text-brand-300"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-300"
                }`}
              >
                {license.plan === "TRIAL"
                  ? `Free trial: ${license.daysLeft} day${license.daysLeft === 1 ? "" : "s"} left.`
                  : `Your license expires in ${license.daysLeft} day${license.daysLeft === 1 ? "" : "s"}.`}{" "}
                {contactEmail ? (
                  <a className="underline font-medium" href={`mailto:${contactEmail}?subject=License%20for%20${encodeURIComponent(brandName)}`}>
                    Contact us to activate or renew
                  </a>
                ) : (
                  "Contact your provider to activate or renew."
                )}
              </div>
            )}
            <div key={location.pathname} className="animate-page">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-200/80 dark:border-gray-700/70 flex justify-around py-1.5 z-30 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {mobileBottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-medium transition-colors ${
                isActive ? "text-brand-600 dark:text-brand-300" : "text-gray-500 dark:text-gray-400"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -top-1.5 h-1 w-8 rounded-b-full bg-brand-500" />}
                <item.icon className="w-5 h-5" />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
