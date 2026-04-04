/**
 * Smart Notification System
 * 
 * Replaces all toasts/snackbars with context-aware notifications:
 * - SUCCESS/WARNING/INFO → Bottom Sheet (slides up from bottom)
 * - ERROR/FISCAL → Centered Modal (requires user action)
 * - CONFIRM → Centered Modal with Cancel/Confirm buttons
 * 
 * Cross-platform: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad Safari
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onNotify } from '@/lib/notify';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

/* ── Constants ───────────────────────────────────────── */
const FISCAL_KEYWORDS = ['e-cf', 'ecf', 'dgii', 'ncf', 'contingencia', 'fiscal', 'alanube', 'factory', 'comprobante', 'secuencia'];
const MAX_BOTTOM_SHEETS = 2;

/* ── Type Configuration ─────────────────────────────── */
const TYPE_CONFIG = {
  success: {
    bg: '#22C55E',
    text: '#FFFFFF',
    icon: CheckCircle,
    duration: 3000,
    display: 'bottomSheet',
  },
  warning: {
    bg: '#F59E0B',
    text: '#1F2937',
    icon: AlertTriangle,
    duration: 5000,
    display: 'bottomSheet',
  },
  error: {
    bg: '#EF4444',
    text: '#FFFFFF',
    icon: AlertCircle,
    duration: 0, // Requires user action
    display: 'modal',
  },
  info: {
    bg: '#3B82F6',
    text: '#FFFFFF',
    icon: Info,
    duration: 3000,
    display: 'bottomSheet',
  },
  confirm: {
    bg: '#2563EB',
    text: '#FFFFFF',
    icon: Info,
    duration: 0,
    display: 'modal',
  },
};

/* ── Helpers ─────────────────────────────────────────── */
function isFiscal(n) {
  const txt = `${n.title || ''} ${n.description || ''}`.toLowerCase();
  return FISCAL_KEYWORDS.some(k => txt.includes(k));
}

function getConfig(n) {
  const base = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
  
  // Fiscal errors always show as modal
  if (n.type === 'error' || (n.type === 'warning' && isFiscal(n))) {
    return { ...base, display: 'modal', duration: 0 };
  }
  
  return base;
}

let idCounter = 0;

/* ── Bottom Sheet Component ──────────────────────────── */
function BottomSheet({ note, onDismiss, index, total, isMobile }) {
  const config = getConfig(note);
  const Icon = config.icon;
  
  // Stack offset: push older ones up
  const stackOffset = index === 0 && total === 2 ? 92 : 0;
  
  return (
    <div
      data-testid={`notify-${note.type}`}
      role="alert"
      aria-live="assertive"
      onClick={() => isMobile && onDismiss(note.id)}
      style={{
        position: 'fixed',
        zIndex: 99997 - index,
        left: '50%',
        bottom: stackOffset,
        transform: `translate(-50%, ${note.visible ? '0' : '100%'})`,
        width: isMobile ? '100%' : 'auto',
        maxWidth: 480,
        minWidth: isMobile ? 'auto' : 320,
        background: config.bg,
        color: config.text,
        borderRadius: isMobile && stackOffset === 0 ? '1rem 1rem 0 0' : '1rem',
        marginBottom: !isMobile && stackOffset === 0 ? '1.25rem' : 0,
        padding: '1.25rem',
        paddingBottom: isMobile && stackOffset === 0 
          ? 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' 
          : '1.25rem',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
        transition: 'transform 300ms ease-out, bottom 300ms ease-out',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        minHeight: 80,
        cursor: isMobile ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      <Icon size={22} style={{ flexShrink: 0, marginTop: 2 }} />
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ 
          margin: 0, 
          fontWeight: 700, 
          fontSize: '1rem', 
          lineHeight: 1.3 
        }}>
          {note.title}
        </p>
        {note.description && (
          <p style={{ 
            margin: '0.3rem 0 0', 
            fontSize: '0.875rem', 
            opacity: 0.9, 
            lineHeight: 1.35,
            wordBreak: 'break-word',
          }}>
            {note.description}
          </p>
        )}
      </div>
      
      <button
        data-testid="notify-dismiss-btn"
        onClick={(e) => { e.stopPropagation(); onDismiss(note.id); }}
        aria-label="Cerrar"
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          borderRadius: '50%',
          width: 32,
          height: 32,
          minWidth: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          color: config.text,
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

/* ── Centered Modal Component ────────────────────────── */
function CenteredModal({ note, onDismiss, onConfirm, onCancel, visible, isMobile }) {
  const config = getConfig(note);
  const Icon = config.icon;
  const isConfirm = note.type === 'confirm';
  
  return (
    <>
      {/* Overlay */}
      <div
        data-testid="notify-overlay"
        onClick={() => {
          if (isConfirm) {
            onCancel?.();
          } else {
            onDismiss();
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 99998,
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      />
      
      {/* Modal Card */}
      <div
        data-testid={isConfirm ? 'notify-confirm-modal' : 'notify-error-modal'}
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        style={{
          position: 'fixed',
          zIndex: 99999,
          left: '50%',
          top: '50%',
          transform: `translate(-50%, ${visible ? '-50%' : 'calc(-50% + 20px)'})`,
          width: 'calc(100% - 2rem)',
          maxWidth: 360,
          background: '#FFFFFF',
          color: '#1F2937',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          transition: 'transform 200ms ease-out, opacity 200ms ease-out',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        {/* Icon */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 16,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: note.type === 'error' ? '#FEE2E2' : '#DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: note.type === 'error' ? '#DC2626' : '#2563EB',
          }}>
            {note.type === 'error' ? (
              <AlertCircle size={28} />
            ) : (
              <Icon size={28} />
            )}
          </div>
        </div>
        
        {/* Title */}
        <h2 style={{
          margin: 0,
          fontSize: '1.125rem',
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.4,
          color: '#111827',
        }}>
          {note.title}
        </h2>
        
        {/* Description */}
        {note.description && (
          <p style={{
            margin: '0.75rem 0 0',
            fontSize: '0.875rem',
            textAlign: 'center',
            lineHeight: 1.5,
            color: '#6B7280',
            wordBreak: 'break-word',
          }}>
            {note.description}
          </p>
        )}
        
        {/* Buttons */}
        <div style={{
          marginTop: 24,
          display: 'flex',
          flexDirection: isConfirm ? 'row' : 'column',
          gap: 12,
        }}>
          {isConfirm ? (
            <>
              {/* Cancel Button */}
              <button
                data-testid="notify-cancel-btn"
                onClick={() => onCancel?.()}
                style={{
                  flex: 1,
                  padding: '0.875rem 1rem',
                  borderRadius: 8,
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  background: 'transparent',
                  border: '1.5px solid #D1D5DB',
                  color: '#374151',
                  cursor: 'pointer',
                  minHeight: 48,
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  transition: 'background 150ms ease',
                }}
              >
                Cancelar
              </button>
              
              {/* Confirm Button */}
              <button
                data-testid="notify-confirm-btn"
                onClick={() => onConfirm?.()}
                style={{
                  flex: 1,
                  padding: '0.875rem 1rem',
                  borderRadius: 8,
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  background: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  minHeight: 48,
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  transition: 'background 150ms ease',
                }}
              >
                Confirmar
              </button>
            </>
          ) : (
            /* Single "Entendido" button for error modals */
            <button
              data-testid="notify-acknowledge-btn"
              onClick={() => onDismiss()}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: 8,
                fontSize: '0.9375rem',
                fontWeight: 600,
                background: note.type === 'error' ? '#DC2626' : '#2563EB',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                minHeight: 48,
                WebkitAppearance: 'none',
                appearance: 'none',
                transition: 'background 150ms ease',
              }}
            >
              Entendido
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Main Component ──────────────────────────────────── */
export default function SmartNotificationSystem() {
  const [bottomSheets, setBottomSheets] = useState([]);
  const [modal, setModal] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const timersRef = useRef({});
  
  // Detect mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  /* ── Dismiss bottom sheet ──────────────────────────── */
  const dismissSheet = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    
    setBottomSheets(prev => prev.map(n => 
      n.id === id ? { ...n, visible: false } : n
    ));
    
    setTimeout(() => {
      setBottomSheets(prev => prev.filter(n => n.id !== id));
    }, 320);
  }, []);

  /* ── Dismiss modal ─────────────────────────────────── */
  const dismissModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setModal(null), 220);
  }, []);

  /* ── Handle modal confirm ──────────────────────────── */
  const handleConfirm = useCallback(() => {
    modal?.onConfirm?.();
    dismissModal();
  }, [modal, dismissModal]);

  /* ── Handle modal cancel ───────────────────────────── */
  const handleCancel = useCallback(() => {
    modal?.onCancel?.();
    dismissModal();
  }, [modal, dismissModal]);

  /* ── Start auto-dismiss timer ──────────────────────── */
  const startTimer = useCallback((id, ms) => {
    if (ms <= 0) return;
    clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => dismissSheet(id), ms);
  }, [dismissSheet]);

  /* ── Show notification handler ─────────────────────── */
  const show = useCallback((n) => {
    // Handle dismiss all
    if (n.type === 'dismiss') {
      setBottomSheets(prev => {
        prev.forEach(x => {
          clearTimeout(timersRef.current[x.id]);
          delete timersRef.current[x.id];
        });
        return [];
      });
      setModal(null);
      setModalVisible(false);
      return;
    }

    const config = getConfig(n);
    const id = ++idCounter;

    // Route to modal for errors, fiscal warnings, and confirms
    if (config.display === 'modal') {
      setModal({ ...n, id });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setModalVisible(true));
      });
      return;
    }

    // Route to bottom sheet
    const entry = {
      ...n,
      id,
      visible: false,
      duration: config.duration,
    };

    setBottomSheets(prev => {
      let next = [...prev];
      
      // Enforce max 2: dismiss oldest if needed
      while (next.length >= MAX_BOTTOM_SHEETS) {
        const oldest = next[0];
        clearTimeout(timersRef.current[oldest.id]);
        delete timersRef.current[oldest.id];
        next = next.slice(1);
      }
      
      return [...next, entry];
    });

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBottomSheets(prev => prev.map(x => 
          x.id === id ? { ...x, visible: true } : x
        ));
      });
    });

    // Start auto-dismiss timer
    if (config.duration > 0) {
      startTimer(id, config.duration);
    }
  }, [startTimer]);

  /* ── Subscribe to notifications ────────────────────── */
  useEffect(() => onNotify(show), [show]);

  /* ── Keyboard dismiss (Escape) ─────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (modal) {
          if (modal.type === 'confirm') {
            handleCancel();
          } else {
            dismissModal();
          }
        } else if (bottomSheets.length) {
          dismissSheet(bottomSheets[bottomSheets.length - 1].id);
        }
      }
    };
    
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bottomSheets, modal, dismissSheet, dismissModal, handleCancel]);

  return (
    <>
      {/* Bottom Sheets */}
      {bottomSheets.map((note, idx) => (
        <BottomSheet
          key={note.id}
          note={note}
          onDismiss={dismissSheet}
          index={idx}
          total={bottomSheets.length}
          isMobile={isMobile}
        />
      ))}

      {/* Centered Modal */}
      {modal && (
        <CenteredModal
          note={modal}
          onDismiss={dismissModal}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          visible={modalVisible}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
