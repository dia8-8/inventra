import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { NotifyProvider } from "./context/NotifyContext";
import { ProtectedRoute, AdminRoute, RoleRoute, PermissionRoute, FeatureRoute } from "./components/ProtectedRoute";
import { firstAllowedPath } from "./lib/access";
import { EmptyState } from "./components/ui";
import { LockIcon } from "./components/icons";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import LicenseBlocked from "./pages/LicenseBlocked";
import Platform from "./pages/Platform";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import Scan from "./pages/Scan";
import Orders from "./pages/Orders";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import InvoiceDesigner from "./pages/InvoiceDesigner";
import Suppliers from "./pages/Suppliers";
import Expenses from "./pages/Expenses";
import Deliveries from "./pages/Deliveries";
import Reports from "./pages/Reports";
import Taxes from "./pages/Taxes";
import ActivityLog from "./pages/ActivityLog";
import InvoicePrint from "./pages/InvoicePrint";

// Visitors see the public landing page at "/"; anything else needs a session.
// Signed-in users get the app shell, unless their client's license is blocked.
function AppShell() {
  const { user, loading, license } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }
  if (!user) {
    return location.pathname === "/" ? <Landing /> : <Navigate to="/login" replace />;
  }
  if (user.role !== "SUPER_ADMIN" && license?.blocked) {
    return <LicenseBlocked />;
  }
  return <Layout />;
}

function HomeRoute() {
  const { user, can, hasFeature } = useAuth();
  if (user?.role === "SUPER_ADMIN") return <Navigate to="/platform" replace />;
  if (user?.role === "DRIVER") return <Navigate to="/deliveries" replace />;
  if (can("dashboard.view")) return <Dashboard />;
  // No dashboard access: send them to the first page they are allowed to use
  const target = firstAllowedPath(can, hasFeature);
  if (target) return <Navigate to={target} replace />;
  return (
    <div className="card mt-10 max-w-md mx-auto">
      <EmptyState icon={LockIcon} title="You don't have access to anything yet" text="Ask an administrator of your company to give you permissions." />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NotifyProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login mode="login" />} />
            <Route path="/register" element={<Login mode="register" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/orders/:id/invoice"
              element={
                <ProtectedRoute>
                  <InvoicePrint />
                </ProtectedRoute>
              }
            />
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeRoute />} />
              <Route
                path="/platform"
                element={
                  <RoleRoute roles={["SUPER_ADMIN"]}>
                    <Platform />
                  </RoleRoute>
                }
              />
              <Route path="/customers" element={<PermissionRoute perm="customers.view"><Customers /></PermissionRoute>} />
              <Route path="/products" element={<PermissionRoute perm="products.view"><Products /></PermissionRoute>} />
              <Route path="/inventory" element={<PermissionRoute perm="inventory.view"><Inventory /></PermissionRoute>} />
              <Route
                path="/scan"
                element={
                  <PermissionRoute perm="inventory.adjust">
                    <FeatureRoute feature="barcode">
                      <Scan />
                    </FeatureRoute>
                  </PermissionRoute>
                }
              />
              <Route path="/orders" element={<PermissionRoute perm="orders.view"><Orders /></PermissionRoute>} />
              <Route path="/suppliers" element={<PermissionRoute perm="suppliers.view"><Suppliers /></PermissionRoute>} />
              <Route path="/expenses" element={<PermissionRoute perm="expenses.view"><Expenses /></PermissionRoute>} />
              <Route
                path="/deliveries"
                element={
                  <PermissionRoute perm="deliveries.view">
                    <FeatureRoute feature="deliveries">
                      <Deliveries />
                    </FeatureRoute>
                  </PermissionRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <PermissionRoute perm="reports.view">
                    <FeatureRoute feature="reports">
                      <Reports />
                    </FeatureRoute>
                  </PermissionRoute>
                }
              />
              <Route
                path="/taxes"
                element={
                  <PermissionRoute perm="taxes.view">
                    <FeatureRoute feature="reports">
                      <Taxes />
                    </FeatureRoute>
                  </PermissionRoute>
                }
              />
              <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
              <Route path="/settings" element={<PermissionRoute anyOf={["settings.edit", "invoices.design"]}><Settings /></PermissionRoute>} />
              <Route path="/settings/invoice" element={<PermissionRoute perm="invoices.design"><InvoiceDesigner /></PermissionRoute>} />
              <Route
                path="/activity-log"
                element={
                  <PermissionRoute perm="activity.view">
                    <FeatureRoute feature="activity-log">
                      <ActivityLog />
                    </FeatureRoute>
                  </PermissionRoute>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      </NotifyProvider>
    </ThemeProvider>
  );
}
