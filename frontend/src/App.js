import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { queryClient, QueryClientProvider } from "@/lib/queryClient";
import ConnectionStatus from "@/components/ConnectionStatus";
import { Toaster } from "@/components/ui/sonner";
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
const BillHistory = React.lazy(() => import("@/pages/BillHistory"));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kitchen-tv" element={<Suspense fallback={<PageSkeleton />}><KitchenTV /></Suspense>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Suspense fallback={<PageSkeleton />}><Dashboard /></Suspense>} />
        <Route path="tables" element={<Suspense fallback={<PageSkeleton />}><TableMap /></Suspense>} />
        <Route path="order/:tableId" element={<Suspense fallback={<PageSkeleton />}><OrderScreen /></Suspense>} />
        <Route path="kitchen" element={<Suspense fallback={<PageSkeleton />}><Kitchen /></Suspense>} />
        <Route path="billing/:orderId" element={<Suspense fallback={<PageSkeleton />}><Billing /></Suspense>} />
        <Route path="payment/:billId" element={<Suspense fallback={<PageSkeleton />}><PaymentScreen /></Suspense>} />
        <Route path="cash-register" element={<Suspense fallback={<PageSkeleton />}><CashRegister /></Suspense>} />
        <Route path="inventory" element={<Navigate to="/inventory-manager" replace />} />
        <Route path="inventory-manager" element={<Suspense fallback={<PageSkeleton />}><InventoryManager /></Suspense>} />
        <Route path="suppliers" element={<Suspense fallback={<PageSkeleton />}><Suppliers /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageSkeleton />}><Reports /></Suspense>} />
        <Route path="reports/anulaciones" element={<Suspense fallback={<PageSkeleton />}><AnulacionesReport /></Suspense>} />
        <Route path="reports/facturas" element={<Suspense fallback={<PageSkeleton />}><BillHistory /></Suspense>} />
        <Route path="customers" element={<Suspense fallback={<PageSkeleton />}><Customers /></Suspense>} />
        <Route path="reservations" element={<Suspense fallback={<PageSkeleton />}><Reservations /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageSkeleton />}><Settings /></Suspense>} />
        <Route path="settings/printer" element={<Suspense fallback={<PageSkeleton />}><PrinterSettings /></Suspense>} />
        <Route path="product/:productId" element={<Suspense fallback={<PageSkeleton />}><ProductConfig /></Suspense>} />
        <Route path="user/:userId" element={<Suspense fallback={<PageSkeleton />}><UserConfig /></Suspense>} />
        <Route path="ticket-demo" element={<Suspense fallback={<PageSkeleton />}><TicketDemo /></Suspense>} />
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
            <ConnectionStatus />
            <Toaster position="top-right" richColors duration={4000} visibleToasts={1} />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
