import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

/**
 * ConfirmDialog — Global reusable confirmation modal
 * Replaces ALL window.confirm() in the system
 * Usage: <ConfirmDialog open={x} onConfirm={fn} onCancel={fn} title="..." description="..." />
 */
export function ConfirmDialog({ open, onConfirm, onCancel, title = '¿Estas seguro?', description = '', destructive = true }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel?.()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-oswald">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * useConfirmDialog — Hook for easy confirm dialog state management
 * Returns [confirmProps, showConfirm] — spread confirmProps on <ConfirmDialog>
 */
export function useConfirmDialog() {
  const { useState, useCallback } = require('react');
  const [state, setState] = useState({ open: false, title: '', description: '', destructive: true, resolve: null });

  const showConfirm = useCallback(({ title, description, destructive = true }) => {
    return new Promise((resolve) => {
      setState({ open: true, title, description, destructive, resolve });
    });
  }, []);

  const confirmProps = {
    open: state.open,
    title: state.title,
    description: state.description,
    destructive: state.destructive,
    onConfirm: () => { state.resolve?.(true); setState(p => ({ ...p, open: false })); },
    onCancel: () => { state.resolve?.(false); setState(p => ({ ...p, open: false })); },
  };

  return [confirmProps, showConfirm];
}
