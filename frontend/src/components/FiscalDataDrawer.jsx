import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Search, Check, X, AlertCircle, User, Building2, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Algoritmo de validación de RNC dominicano (9 dígitos)
 * Implementa el algoritmo de dígito verificador de la DGII
 */
function validateRNC(rnc) {
  // Limpiar y verificar longitud
  const cleaned = rnc.replace(/\D/g, '');
  if (cleaned.length !== 9) return false;
  
  // Pesos para RNC: 7, 9, 8, 6, 5, 4, 3, 2 (8 primeros dígitos)
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(cleaned[i]) * weights[i];
  }
  
  // Calcular dígito verificador
  const remainder = sum % 11;
  let checkDigit;
  
  if (remainder === 0) {
    checkDigit = 2;
  } else if (remainder === 1) {
    checkDigit = 1;
  } else {
    checkDigit = 11 - remainder;
  }
  
  // El dígito verificador debe estar entre 0-9
  // Si es 10 u 11, el RNC es inválido según las reglas de DGII
  if (checkDigit >= 10) return false;
  
  return parseInt(cleaned[8]) === checkDigit;
}

/**
 * Algoritmo de validación de Cédula dominicana (11 dígitos)
 * Implementa el algoritmo de Luhn modificado para RD
 */
function validateCedula(cedula) {
  // Limpiar y verificar longitud
  const cleaned = cedula.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  
  // Algoritmo de Luhn para cédula dominicana
  // Pesos alternativos: 1, 2 (de derecha a izquierda)
  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let product = parseInt(cleaned[i]) * weights[i];
    // Si el producto es >= 10, sumar los dígitos individuales
    if (product >= 10) {
      product = Math.floor(product / 10) + (product % 10);
    }
    sum += product;
  }
  
  // Dígito verificador = (10 - (suma % 10)) % 10
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return parseInt(cleaned[10]) === checkDigit;
}

/**
 * Validar si es RNC o Cédula válido
 */
function validateFiscalId(value) {
  const cleaned = value.replace(/\D/g, '');
  
  if (cleaned.length === 9) {
    return {
      type: 'RNC',
      valid: validateRNC(cleaned),
      cleaned
    };
  } else if (cleaned.length === 11) {
    return {
      type: 'Cédula',
      valid: validateCedula(cleaned),
      cleaned
    };
  }
  
  return {
    type: cleaned.length < 9 ? 'Incompleto' : 'Inválido',
    valid: false,
    cleaned
  };
}

/**
 * Formatear RNC/Cédula para mostrar
 */
function formatFiscalId(value) {
  const cleaned = value.replace(/\D/g, '');
  
  if (cleaned.length === 9) {
    // Formato RNC: XXX-XXXXX-X
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 8)}-${cleaned.slice(8)}`;
  } else if (cleaned.length === 11) {
    // Formato Cédula: XXX-XXXXXXX-X
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 10)}-${cleaned.slice(10)}`;
  }
  
  return cleaned;
}

const FiscalDataDrawer = ({ 
  open, 
  onOpenChange, 
  fiscalType, 
  onConfirm,
  apiBase 
}) => {
  const [fiscalId, setFiscalId] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [email, setEmail] = useState('');
  const [validation, setValidation] = useState({ type: '', valid: false, cleaned: '' });
  const [searching, setSearching] = useState(false);
  const [customerFound, setCustomerFound] = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  
  // Reset state when drawer opens
  useEffect(() => {
    if (open) {
      setFiscalId('');
      setRazonSocial('');
      setEmail('');
      setValidation({ type: '', valid: false, cleaned: '' });
      setCustomerFound(null);
      setIsNewCustomer(false);
    }
  }, [open]);
  
  // Validar en tiempo real
  useEffect(() => {
    if (fiscalId) {
      const result = validateFiscalId(fiscalId);
      setValidation(result);
    } else {
      setValidation({ type: '', valid: false, cleaned: '' });
    }
  }, [fiscalId]);
  
  // Buscar cliente en la base de datos
  const searchCustomer = useCallback(async () => {
    if (!validation.valid) {
      toast.error('Ingresa un RNC o Cédula válido primero');
      return;
    }
    
    setSearching(true);
    try {
      const res = await fetch(
        `${apiBase}/api/customers?rnc=${validation.cleaned}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` } }
      );
      const customers = await res.json();
      
      // Buscar por RNC exacto
      const found = customers.find(c => 
        c.rnc?.replace(/\D/g, '') === validation.cleaned
      );
      
      if (found) {
        setCustomerFound(found);
        setRazonSocial(found.name || '');
        setEmail(found.email || '');
        setIsNewCustomer(false);
        toast.success('Cliente encontrado');
      } else {
        setCustomerFound(null);
        setRazonSocial('');
        setEmail('');
        setIsNewCustomer(true);
        toast.info('Cliente no encontrado. Ingresa los datos manualmente.');
      }
    } catch (err) {
      console.error('Error searching customer:', err);
      toast.error('Error al buscar cliente');
    } finally {
      setSearching(false);
    }
  }, [validation, apiBase]);
  
  // Guardar nuevo cliente
  const saveNewCustomer = async () => {
    if (!razonSocial.trim()) {
      toast.error('La Razón Social es obligatoria');
      return null;
    }
    
    try {
      const res = await fetch(`${apiBase}/api/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          name: razonSocial.trim(),
          rnc: validation.cleaned,
          email: email.trim() || null,
          phone: null
        })
      });
      
      if (!res.ok) throw new Error('Error al crear cliente');
      
      const newCustomer = await res.json();
      toast.success('Cliente registrado exitosamente');
      return newCustomer;
    } catch (err) {
      console.error('Error saving customer:', err);
      toast.error('Error al guardar cliente');
      return null;
    }
  };
  
  // Confirmar y continuar
  const handleConfirm = async () => {
    if (!validation.valid) {
      toast.error('Ingresa un RNC o Cédula válido');
      return;
    }
    
    if (!razonSocial.trim()) {
      toast.error('La Razón Social es obligatoria');
      return;
    }
    
    let customer = customerFound;
    
    // Si es nuevo cliente, guardarlo primero
    if (isNewCustomer && !customerFound) {
      customer = await saveNewCustomer();
      if (!customer) return; // Error al guardar
    }
    
    // Llamar callback con los datos fiscales
    onConfirm({
      fiscalId: validation.cleaned,
      fiscalIdType: validation.type,
      fiscalIdFormatted: formatFiscalId(validation.cleaned),
      razonSocial: razonSocial.trim(),
      email: email.trim() || null,
      sendEmail: !!email.trim(),
      customer
    });
    
    onOpenChange(false);
  };
  
  // Obtener nombre descriptivo del tipo fiscal
  const getFiscalTypeName = () => {
    switch (fiscalType) {
      case 'B01': return 'Crédito Fiscal';
      case 'B14': return 'Gubernamental';
      case 'B15': return 'Régimen Especial';
      default: return fiscalType;
    }
  };
  
  const canContinue = validation.valid && razonSocial.trim();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10">
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader className="text-center pb-2">
            <DrawerTitle className="text-xl font-oswald text-white flex items-center justify-center gap-2">
              <Building2 className="text-cyan-400" size={24} />
              Datos Fiscales - {fiscalType}
            </DrawerTitle>
            <DrawerDescription className="text-white/60">
              {getFiscalTypeName()} requiere RNC o Cédula del cliente
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-6 pb-4 space-y-5">
            {/* Campo RNC/Cédula con validación */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">
                RNC o Cédula *
              </Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={fiscalId}
                    onChange={(e) => setFiscalId(e.target.value.replace(/[^0-9-]/g, ''))}
                    placeholder="Ej: 123456789 o 00112345678"
                    className={`bg-white/5 border-2 text-white text-lg h-14 pr-12 font-mono tracking-wider transition-all ${
                      fiscalId && validation.valid 
                        ? 'border-green-500/50 focus:border-green-400' 
                        : fiscalId && !validation.valid && validation.cleaned.length >= 9
                          ? 'border-red-500/50 focus:border-red-400'
                          : 'border-white/20 focus:border-cyan-400'
                    }`}
                    data-testid="fiscal-id-input"
                    autoFocus
                  />
                  {/* Indicador de validación */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {fiscalId && validation.valid && (
                      <Check className="text-green-400" size={20} />
                    )}
                    {fiscalId && !validation.valid && validation.cleaned.length >= 9 && (
                      <AlertCircle className="text-red-400" size={20} />
                    )}
                  </div>
                </div>
                <Button
                  onClick={searchCustomer}
                  disabled={!validation.valid || searching}
                  className="h-14 px-5 bg-cyan-600 hover:bg-cyan-500 text-white"
                  data-testid="search-customer-btn"
                >
                  {searching ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <Search size={20} />
                  )}
                </Button>
              </div>
              
              {/* Mensaje de validación */}
              <div className="h-5">
                {fiscalId && (
                  <p className={`text-xs flex items-center gap-1 ${
                    validation.valid ? 'text-green-400' : 
                    validation.cleaned.length >= 9 ? 'text-red-400' : 'text-white/50'
                  }`}>
                    {validation.valid ? (
                      <>
                        <Check size={12} />
                        {validation.type} válido: {formatFiscalId(validation.cleaned)}
                      </>
                    ) : validation.cleaned.length >= 9 ? (
                      <>
                        <AlertCircle size={12} />
                        {validation.type === 'RNC' ? 'RNC' : validation.type === 'Cédula' ? 'Cédula' : 'Número'} Inválido - Dígito verificador incorrecto
                      </>
                    ) : (
                      `Ingresa ${9 - validation.cleaned.length} dígitos más para RNC o ${11 - validation.cleaned.length} para Cédula`
                    )}
                  </p>
                )}
              </div>
            </div>
            
            {/* Indicador de cliente encontrado o nuevo */}
            {(customerFound || isNewCustomer) && (
              <div className={`p-3 rounded-xl flex items-center gap-3 ${
                customerFound ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
              }`}>
                <User size={20} className={customerFound ? 'text-green-400' : 'text-amber-400'} />
                <span className={`text-sm ${customerFound ? 'text-green-300' : 'text-amber-300'}`}>
                  {customerFound ? 'Cliente existente - Datos autocompletados' : 'Cliente nuevo - Ingresa los datos'}
                </span>
              </div>
            )}
            
            {/* Campo Razón Social */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">
                Razón Social *
              </Label>
              <Input
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="Nombre o Razón Social del cliente"
                className="bg-white/5 border-2 border-white/20 text-white text-base h-14 focus:border-cyan-400"
                disabled={!!customerFound}
                data-testid="razon-social-input"
              />
            </div>
            
            {/* Campo Email (Opcional) */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium flex items-center gap-2">
                <Mail size={14} />
                Correo Electrónico
                <span className="text-white/40 text-xs font-normal">(opcional - para envío de factura)</span>
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="bg-white/5 border-2 border-white/20 text-white text-base h-14 focus:border-cyan-400"
                disabled={!!customerFound && customerFound.email}
                data-testid="email-input"
              />
              {email && (
                <p className="text-xs text-cyan-400/80 flex items-center gap-1">
                  <Mail size={12} />
                  La factura digital será enviada a este correo
                </p>
              )}
            </div>
          </div>
          
          <DrawerFooter className="pt-2 pb-6 px-6">
            <div className="flex gap-3 w-full">
              <DrawerClose asChild>
                <Button 
                  variant="outline" 
                  className="flex-1 h-14 text-base border-white/20 text-white hover:bg-white/10"
                  data-testid="fiscal-cancel-btn"
                >
                  <X size={18} className="mr-2" />
                  Cancelar
                </Button>
              </DrawerClose>
              <Button
                onClick={handleConfirm}
                disabled={!canContinue}
                className={`flex-1 h-14 text-base font-semibold transition-all ${
                  canContinue 
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white' 
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
                data-testid="fiscal-confirm-btn"
              >
                <Check size={18} className="mr-2" />
                Continuar
              </Button>
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default FiscalDataDrawer;
