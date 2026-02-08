import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Warehouse, AlertTriangle, Plus, ArrowUpDown, BookOpen, Minus, TrendingUp, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [adjustDialog, setAdjustDialog] = useState({ open: false, product_id: '', warehouse_id: '', qty: '', reason: 'Ajuste manual' });
  const [warehouseDialog, setWarehouseDialog] = useState({ open: false, name: '', location: '' });
  const [recipeDialog, setRecipeDialog] = useState({ open: false, product_id: '', product_name: '', ingredients: [{ ingredient_name: '', quantity: 1, unit: 'unidad', cost: 0 }] });
  const [invReport, setInvReport] = useState([]);
  const [movements, setMovements] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [invRes, whRes, alertRes, recRes, prodRes] = await Promise.all([
        axios.get(`${API}/inventory`, { headers: headers() }),
        axios.get(`${API}/warehouses`, { headers: headers() }),
        axios.get(`${API}/inventory/alerts`, { headers: headers() }),
        axios.get(`${API}/recipes`, { headers: headers() }),
        axios.get(`${API}/products`, { headers: headers() }),
      ]);
      setInventory(invRes.data);
      setWarehouses(whRes.data);
      setAlerts(alertRes.data);
      setRecipes(recRes.data);
      setProducts(prodRes.data);
      // Fetch report and movements
      try {
        const [repRes, movRes] = await Promise.all([
          axios.get(`${API}/reports/inventory`, { headers: headers() }),
          axios.get(`${API}/inventory/movements`, { headers: headers() }),
        ]);
        setInvReport(repRes.data);
        setMovements(movRes.data);
      } catch {}
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAdjust = async () => {
    const q = parseFloat(adjustDialog.qty);
    if (!q || !adjustDialog.product_id) return;
    try {
      await axios.post(`${API}/inventory/adjust`, {
        product_id: adjustDialog.product_id, warehouse_id: adjustDialog.warehouse_id || warehouses[0]?.id,
        quantity: q, reason: adjustDialog.reason
      }, { headers: headers() });
      toast.success('Inventario ajustado');
      setAdjustDialog({ open: false, product_id: '', warehouse_id: '', qty: '', reason: 'Ajuste manual' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleAddWarehouse = async () => {
    if (!warehouseDialog.name) return;
    try {
      await axios.post(`${API}/warehouses`, { name: warehouseDialog.name, location: warehouseDialog.location }, { headers: headers() });
      toast.success('Almacen creado');
      setWarehouseDialog({ open: false, name: '', location: '' });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  const handleSaveRecipe = async () => {
    if (!recipeDialog.product_id || recipeDialog.ingredients.length === 0) return;
    try {
      await axios.post(`${API}/recipes`, {
        product_id: recipeDialog.product_id, product_name: recipeDialog.product_name,
        ingredients: recipeDialog.ingredients.filter(i => i.ingredient_name), yield_quantity: 1
      }, { headers: headers() });
      toast.success('Receta guardada');
      setRecipeDialog({ open: false, product_id: '', product_name: '', ingredients: [{ ingredient_name: '', quantity: 1, unit: 'unidad', cost: 0 }] });
      fetchAll();
    } catch { toast.error('Error'); }
  };

  return (
    <div className="h-full flex flex-col" data-testid="inventory-page">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          <Package size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">INVENTARIO</h1>
        </div>
        {alerts.length > 0 && (
          <Badge variant="destructive" className="animate-pulse">{alerts.length} alertas de stock bajo</Badge>
        )}
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <Tabs defaultValue="stock" className="max-w-5xl mx-auto">
          <TabsList className="bg-card border border-border mb-4">
            <TabsTrigger value="stock" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-stock">
              <Package size={14} className="mr-1" /> Stock
            </TabsTrigger>
            <TabsTrigger value="warehouses" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-warehouses">
              <Warehouse size={14} className="mr-1" /> Almacenes
            </TabsTrigger>
            <TabsTrigger value="recipes" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-recipes">
              <BookOpen size={14} className="mr-1" /> Recetas
            </TabsTrigger>
            <TabsTrigger value="alerts" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-alerts">
              <AlertTriangle size={14} className="mr-1" /> Alertas {alerts.length > 0 && `(${alerts.length})`}
            </TabsTrigger>
            <TabsTrigger value="costs" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-costs">
              <DollarSign size={14} className="mr-1" /> Costos
            </TabsTrigger>
            <TabsTrigger value="movements" className="data-[state=active]:bg-primary data-[state=active]:text-white font-oswald text-xs" data-testid="tab-movements">
              <ArrowUpDown size={14} className="mr-1" /> Movimientos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stock">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Niveles de Stock</h2>
              <Button onClick={() => setAdjustDialog({ open: true, product_id: '', warehouse_id: warehouses[0]?.id || '', qty: '', reason: 'Ajuste manual' })}
                size="sm" className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="adjust-stock-btn">
                <ArrowUpDown size={14} className="mr-1" /> Ajustar
              </Button>
            </div>
            <div className="space-y-2">
              {inventory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay items en inventario</p>
              ) : inventory.map((item, i) => {
                const wh = warehouses.find(w => w.id === item.warehouse_id);
                const isLow = item.stock <= (item.min_stock || 10);
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg bg-card border ${isLow ? 'border-destructive/50' : 'border-border'}`} data-testid={`inv-item-${item.product_id}`}>
                    <div>
                      <span className="font-semibold text-sm">{item.product_name || item.product_id}</span>
                      {wh && <Badge variant="secondary" className="ml-2 text-[9px]">{wh.name}</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      {isLow && <AlertTriangle size={14} className="text-destructive" />}
                      <span className={`font-oswald text-lg font-bold ${isLow ? 'text-destructive' : 'text-primary'}`}>{item.stock}</span>
                      <span className="text-xs text-muted-foreground">/ min {item.min_stock || 10}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="warehouses">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Almacenes</h2>
              <Button onClick={() => setWarehouseDialog({ open: true, name: '', location: '' })} size="sm"
                className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-warehouse-btn">
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {warehouses.map(wh => (
                <div key={wh.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border" data-testid={`warehouse-${wh.id}`}>
                  <div>
                    <span className="font-semibold">{wh.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{wh.location}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{inventory.filter(i => i.warehouse_id === wh.id).length} items</Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="recipes">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-oswald text-base font-bold">Recetas</h2>
              <Button onClick={() => setRecipeDialog({ open: true, product_id: '', product_name: '', ingredients: [{ ingredient_name: '', quantity: 1, unit: 'unidad', cost: 0 }] })}
                size="sm" className="bg-primary text-primary-foreground font-bold active:scale-95" data-testid="add-recipe-btn">
                <Plus size={14} className="mr-1" /> Nueva Receta
              </Button>
            </div>
            <div className="space-y-3">
              {recipes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay recetas registradas</p>
              ) : recipes.map(r => (
                <div key={r.id} className="p-3 rounded-lg bg-card border border-border" data-testid={`recipe-${r.id}`}>
                  <h3 className="font-semibold text-primary">{r.product_name}</h3>
                  <div className="mt-2 space-y-1">
                    {r.ingredients?.map((ing, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex justify-between">
                        <span>{ing.ingredient_name}</span>
                        <span className="font-oswald">{ing.quantity} {ing.unit} {ing.cost > 0 ? `(RD$ ${ing.cost})` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="alerts">
            <h2 className="font-oswald text-base font-bold mb-4">Alertas de Stock Bajo</h2>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
                <p>Todo el inventario esta en niveles normales</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/30">
                    <div>
                      <span className="font-semibold text-sm">{item.product_name || item.product_id}</span>
                      <Badge variant="destructive" className="ml-2 text-[9px]">Stock bajo</Badge>
                    </div>
                    <div className="text-right">
                      <span className="font-oswald text-lg font-bold text-destructive">{item.stock}</span>
                      <span className="text-xs text-muted-foreground block">Min: {item.min_stock || 10}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* COSTS & MARGINS */}
          <TabsContent value="costs">
            <h2 className="font-oswald text-base font-bold mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" /> Costos y Margenes de Ganancia
            </h2>
            <div className="space-y-2">
              {invReport.filter(r => r.recipe_cost > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Agrega costos a las recetas para ver margenes</p>
              ) : invReport.filter(r => r.recipe_cost > 0).map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                  <div className="flex-1">
                    <span className="font-semibold text-sm">{item.product_name}</span>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Venta: <span className="font-oswald text-foreground">{formatMoney(item.sale_price)}</span></span>
                      <span>Costo: <span className="font-oswald text-destructive">{formatMoney(item.recipe_cost)}</span></span>
                      <span>Stock: <span className="font-oswald">{item.stock}</span></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-oswald text-lg font-bold ${item.margin_pct > 50 ? 'text-green-400' : item.margin_pct > 30 ? 'text-yellow-400' : 'text-destructive'}`}>
                      {item.margin_pct}%
                    </span>
                    <p className="text-[10px] text-muted-foreground">margen</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* MOVEMENTS */}
          <TabsContent value="movements">
            <h2 className="font-oswald text-base font-bold mb-4">Movimientos de Inventario</h2>
            <div className="space-y-1">
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay movimientos registrados</p>
              ) : movements.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-border/50 text-xs">
                  <div>
                    <span className="font-semibold">{m.product_id?.slice(0, 8)}</span>
                    <span className="text-muted-foreground ml-2">{m.reason}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-oswald font-bold ${m.quantity > 0 ? 'text-green-400' : 'text-destructive'}`}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">{m.user_name}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={(o) => !o && setAdjustDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="adjust-stock-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Ajustar Inventario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select value={adjustDialog.product_id} onChange={e => setAdjustDialog(p => ({ ...p, product_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="adjust-product-select">
              <option value="">Seleccionar producto...</option>
              {products.filter(p => p.track_inventory).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={adjustDialog.warehouse_id} onChange={e => setAdjustDialog(p => ({ ...p, warehouse_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdjustDialog(p => ({ ...p, qty: String(-(Math.abs(parseFloat(p.qty) || 1))) }))}>
                <Minus size={14} /> Salida
              </Button>
              <input value={adjustDialog.qty} onChange={e => setAdjustDialog(p => ({ ...p, qty: e.target.value }))}
                type="number" placeholder="Cantidad (+/-)" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-oswald" data-testid="adjust-qty-input" />
              <Button variant="outline" size="sm" onClick={() => setAdjustDialog(p => ({ ...p, qty: String(Math.abs(parseFloat(p.qty) || 1)) }))}>
                <Plus size={14} /> Entrada
              </Button>
            </div>
            <input value={adjustDialog.reason} onChange={e => setAdjustDialog(p => ({ ...p, reason: e.target.value }))}
              placeholder="Razon del ajuste" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleAdjust} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="confirm-adjust">
              AJUSTAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Warehouse Dialog */}
      <Dialog open={warehouseDialog.open} onOpenChange={(o) => !o && setWarehouseDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm bg-card border-border" data-testid="add-warehouse-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nuevo Almacen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={warehouseDialog.name} onChange={e => setWarehouseDialog(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="warehouse-name-input" />
            <input value={warehouseDialog.location} onChange={e => setWarehouseDialog(p => ({ ...p, location: e.target.value }))}
              placeholder="Ubicacion" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={handleAddWarehouse} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95">CREAR ALMACEN</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recipe Dialog */}
      <Dialog open={recipeDialog.open} onOpenChange={(o) => !o && setRecipeDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="recipe-dialog">
          <DialogHeader><DialogTitle className="font-oswald">Nueva Receta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select value={recipeDialog.product_id} onChange={e => {
              const p = products.find(pr => pr.id === e.target.value);
              setRecipeDialog(prev => ({ ...prev, product_id: e.target.value, product_name: p?.name || '' }));
            }} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" data-testid="recipe-product-select">
              <option value="">Seleccionar producto...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ScrollArea className="max-h-48">
              {recipeDialog.ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input value={ing.ingredient_name} onChange={e => {
                    const newIngs = [...recipeDialog.ingredients];
                    newIngs[i].ingredient_name = e.target.value;
                    setRecipeDialog(p => ({ ...p, ingredients: newIngs }));
                  }} placeholder="Ingrediente" className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs" />
                  <input value={ing.quantity} onChange={e => {
                    const newIngs = [...recipeDialog.ingredients];
                    newIngs[i].quantity = parseFloat(e.target.value) || 0;
                    setRecipeDialog(p => ({ ...p, ingredients: newIngs }));
                  }} type="number" className="w-16 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-oswald" />
                  <select value={ing.unit} onChange={e => {
                    const newIngs = [...recipeDialog.ingredients];
                    newIngs[i].unit = e.target.value;
                    setRecipeDialog(p => ({ ...p, ingredients: newIngs }));
                  }} className="w-20 bg-background border border-border rounded-lg px-1 py-1.5 text-xs">
                    <option value="unidad">und</option><option value="libra">lb</option><option value="onza">oz</option>
                    <option value="litro">lt</option><option value="gramo">g</option><option value="kg">kg</option>
                  </select>
                </div>
              ))}
            </ScrollArea>
            <Button variant="outline" size="sm" onClick={() => setRecipeDialog(p => ({
              ...p, ingredients: [...p.ingredients, { ingredient_name: '', quantity: 1, unit: 'unidad', cost: 0 }]
            }))}>
              <Plus size={14} className="mr-1" /> Ingrediente
            </Button>
            <Button onClick={handleSaveRecipe} className="w-full h-11 bg-primary text-primary-foreground font-oswald font-bold active:scale-95" data-testid="save-recipe-btn">
              GUARDAR RECETA
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
