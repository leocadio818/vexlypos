import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { queryClient, QueryClientProvider } from "@/lib/queryClient";
import SmartNotificationSystem from "@/components/SmartNotificationSystem";
import GlobalSearchShortcut from "@/components/GlobalSearchShortcut";
import React, { Suspense } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";

// Lazy load ALL pages for instant navigation
const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const TableMap = React.lazy(() => import("@/pages/TableMap"));
const OrderScreen = React.lazy(() => import("@/pages/OrderScreen"));
const Kitchen = React.lazy(() => import("@/pages/Kitchen"));
const Billing = React.lazy(() => import("@/pages/Billing"));
const PaymentScreen = React.lazy(() => import("@/pages/PaymentScreen"));
const CashRegister = React.lazy(() => import("@/pages/CashRegister"));
const Settings = React.lazy(() => import("@/pages/settings"));
const PrinterSettings = React.lazy(() => import("@/pages/settings/PrinterSettings"));
const InventoryManager = React.lazy(() => import("@/pages/InventoryManager"));
const Suppliers = React.lazy(() => import("@/pages/Suppliers"));
const Reports = React.lazy(() => import("@/pages/Reports"));
const Customers = React.lazy(() => import("@/pages/Customers"));
const KitchenTV = React.lazy(() => import("@/pages/KitchenTV"));
const Reservations = React.lazy(() => import("@/pages/Reservations"));
const ProductConfig = React.lazy(() => import("@/pages/ProductConfig"));
const UserConfig = React.lazy(() => import("@/pages/UserConfig"));
const AnulacionesReport = React.lazy(() => import("@/pages/AnulacionesReport"));
const TicketDemo = React.lazy(() => import("@/pages/TicketDemo"));
const Help = React.lazy(() => import("@/pages/Help"));
const BillHistory = React.lazy(() => import("@/pages/BillHistory"));
const LoyaltyCard = React.lazy(() => import("@/pages/LoyaltyCard"));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// BUG-F1 fix: RoleGate guards a specific route by permission or admin level.
// Falls back to /dashboard if the user lacks the required permission. The
// child route itself is still wrapped by ProtectedRoute (auth check) at the
// parent level, so user is guaranteed to be set here.
function RoleGate({ permission, adminOnly = false, children }) {
  const { user, hasPermission, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (permission && !hasPermission(permission) && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kitchen-tv" element={<Suspense fallback={<PageSkeleton />}><KitchenTV /></Suspense>} />
      <Route path="/loyalty-card/:customerId" element={<Suspense fallback={<PageSkeleton />}><LoyaltyCard /></Suspense>} />
      {/* Root redirect: if loading show spinner, if no user go to login, else go to dashboard */}
      <Route path="/" element={
        loading ? (
          <div className="h-screen flex items-center justify-center bg-background">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !user ? (
          <Navigate to="/login" replace />
        ) : (
          <Navigate to="/dashboard" replace />
        )
      } />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="dashboard" element={<Suspense fallback={<PageSkeleton />}><Dashboard /></Suspense>} />
        <Route path="tables" element={<Suspense fallback={<PageSkeleton />}><TableMap /></Suspense>} />
        <Route path="order/:tableId" element={<Suspense fallback={<PageSkeleton />}><OrderScreen /></Suspense>} />
        <Route path="order/quick/:orderId" element={<Suspense fallback={<PageSkeleton />}><OrderScreen /></Suspense>} />
        <Route path="kitchen" element={<Suspense fallback={<PageSkeleton />}><Kitchen /></Suspense>} />
        <Route path="billing/:orderId" element={<Suspense fallback={<PageSkeleton />}><Billing /></Suspense>} />
        <Route path="payment/:billId" element={<Suspense fallback={<PageSkeleton />}><PaymentScreen /></Suspense>} />
        <Route path="cash-register" element={<Suspense fallback={<PageSkeleton />}><CashRegister /></Suspense>} />
        <Route path="inventory" element={<Navigate to="/inventory-manager" replace />} />
        <Route path="inventory-manager" element={<RoleGate permission="manage_inventory"><Suspense fallback={<PageSkeleton />}><InventoryManager /></Suspense></RoleGate>} />
        <Route path="suppliers" element={<RoleGate permission="manage_suppliers"><Suspense fallback={<PageSkeleton />}><Suppliers /></Suspense></RoleGate>} />
        <Route path="reports" element={<RoleGate permission="view_reports"><Suspense fallback={<PageSkeleton />}><Reports /></Suspense></RoleGate>} />
        <Route path="reports/anulaciones" element={<RoleGate permission="view_reports"><Suspense fallback={<PageSkeleton />}><AnulacionesReport /></Suspense></RoleGate>} />
        <Route path="reports/facturas" element={<RoleGate permission="view_reports"><Suspense fallback={<PageSkeleton />}><BillHistory /></Suspense></RoleGate>} />
        <Route path="customers" element={<RoleGate permission="manage_customers"><Suspense fallback={<PageSkeleton />}><Customers /></Suspense></RoleGate>} />
        <Route path="reservations" element={<Suspense fallback={<PageSkeleton />}><Reservations /></Suspense>} />
        <Route path="settings" element={<RoleGate permission="config_sistema"><Suspense fallback={<PageSkeleton />}><Settings /></Suspense></RoleGate>} />
        <Route path="settings/printer" element={<RoleGate permission="config_impresion"><Suspense fallback={<PageSkeleton />}><PrinterSettings /></Suspense></RoleGate>} />
        <Route path="product/:productId" element={<RoleGate permission="manage_products"><Suspense fallback={<PageSkeleton />}><ProductConfig /></Suspense></RoleGate>} />
        <Route path="user/:userId" element={<RoleGate permission="manage_users"><Suspense fallback={<PageSkeleton />}><UserConfig /></Suspense></RoleGate>} />
        <Route path="ticket-demo" element={<Suspense fallback={<PageSkeleton />}><TicketDemo /></Suspense>} />
        <Route path="help" element={<Suspense fallback={<PageSkeleton />}><Help /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <GlobalSearchShortcut />
            <SmartNotificationSystem />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
