import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import TableMap from "@/pages/TableMap";
import OrderScreen from "@/pages/OrderScreen";
import Kitchen from "@/pages/Kitchen";
import Billing from "@/pages/Billing";
import CashRegister from "@/pages/CashRegister";
import Settings from "@/pages/Settings";
import Inventory from "@/pages/Inventory";
import Suppliers from "@/pages/Suppliers";
import Reports from "@/pages/Reports";
import Customers from "@/pages/Customers";
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
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/tables" replace />} />
        <Route path="tables" element={<TableMap />} />
        <Route path="order/:tableId" element={<OrderScreen />} />
        <Route path="kitchen" element={<Kitchen />} />
        <Route path="billing/:orderId" element={<Billing />} />
        <Route path="cash-register" element={<CashRegister />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/tables" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
