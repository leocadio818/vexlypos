import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CustomersTab() {
  return (
    <div className="text-center py-8">
      <Heart size={40} className="mx-auto mb-3 text-primary opacity-50" />
      <h2 className="font-oswald text-lg mb-2">Clientes & Fidelidad</h2>
      <p className="text-sm text-muted-foreground mb-4">Registro, puntos, canjeo, historial</p>
      <Link to="/customers" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-oswald font-bold active:scale-95 transition-transform">
        <Heart size={16} /> Abrir Clientes
      </Link>
    </div>
  );
}
