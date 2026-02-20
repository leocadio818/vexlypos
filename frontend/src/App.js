import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import TableMap from "@/pages/TableMap";
import OrderScreen from "@/pages/OrderScreen";
import Kitchen from "@/pages/Kitchen";
import Billing from "@/pages/Billing";
import PaymentScreen from "@/pages/PaymentScreen";
import CashRegister from "@/pages/CashRegister";
import Settings from "@/pages/Settings";
import PrinterSettings from "@/pages/settings/PrinterSettings";
import InventoryManager from "@/pages/InventoryManager";
import Suppliers from "@/pages/Suppliers";
import Reports from "@/pages/Reports";
import Customers from "@/pages/Customers";
import Dashboard from "@/pages/Dashboard";
import KitchenTV from "@/pages/KitchenTV";
import Reservations from "@/pages/Reservations";
import ProductConfig from "@/pages/ProductConfig";
import UserConfig from "@/pages/UserConfig";
import AnulacionesReport from "@/pages/AnulacionesReport";
import TicketDemo from "@/pages/TicketDemo";
import Layout from "@/components/Layout";

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
      <Route path="/kitchen-tv" element={<KitchenTV />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tables" element={<TableMap />} />
        <Route path="order/:tableId" element={<OrderScreen />} />
        <Route path="kitchen" element={<Kitchen />} />
        <Route path="billing/:orderId" element={<Billing />} />
        <Route path="payment/:billId" element={<PaymentScreen />} />
        <Route path="cash-register" element={<CashRegister />} />
        <Route path="inventory" element={<Navigate to="/inventory-manager" replace />} />
        <Route path="inventory-manager" element={<InventoryManager />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/anulaciones" element={<AnulacionesReport />} />
        <Route path="customers" element={<Customers />} />
        <Route path="reservations" element={<Reservations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/printer" element={<PrinterSettings />} />
        <Route path="product/:productId" element={<ProductConfig />} />
        <Route path="user/:userId" element={<UserConfig />} />
        <Route path="ticket-demo" element={<TicketDemo />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors duration={500} />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
