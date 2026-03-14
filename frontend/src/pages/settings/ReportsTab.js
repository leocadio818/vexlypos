import { BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ReportsTab() {
  return (
    <div className="text-center py-8">
      <BarChart3 size={40} className="mx-auto mb-3 text-primary opacity-50" />
      <h2 className="font-oswald text-lg mb-2">Reportes</h2>
      <p className="text-sm text-muted-foreground mb-4">Ventas, categorias, productos, meseros, DGII</p>
      <Link to="/reports" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
        <BarChart3 size={16} /> Abrir Reportes
      </Link>
    </div>
  );
}
