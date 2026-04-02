import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onNotify } from '@/lib/notify';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

const TYPE_CONFIG = {
  success: { bg: '#22C55E', text: '#FFFFFF', icon: CheckCircle, autoDismiss: 3000 },
  error:   { bg: '#EF4444', text: '#FFFFFF', icon: AlertCircle, autoDismiss: 0 },
  warning: { bg: '#F59E0B', text: '#1F2937', icon: AlertTriangle, autoDismiss: 4000 },
  info:    { bg: '#3B82F6', text: '#FFFFFF', icon: Info, autoDismiss: 4000 },
};

export default function BottomSheetNotification() {
  const [note, setNote] = useState(null);   // { type, title, description, onConfirm, onCancel }
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setNote(null), 300);
  }, []);

  const show = useCallback((n) => {
    clearTimeout(timerRef.current);
    if (n.type === 'dismiss') { dismiss(); return; }
    setNote(n);
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    const cfg = TYPE_CONFIG[n.type];
    if (cfg?.autoDismiss && n.type !== 'confirm') {
      timerRef.current = setTimeout(dismiss, cfg.autoDismiss);
    }
  }, [dismiss]);

  useEffect(() => onNotify(show), [show]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && note && note.type !== 'confirm') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [note, dismiss]);

  if (!note) return null;

  const isConfirm = note.type === 'confirm';
  const cfg = TYPE_CONFIG[note.type] || TYPE_CONFIG.info;
  const Icon = cfg.icon;

  if (isConfirm) {
    return (
      <>
        <div data-testid="notify-overlay" onClick={() => { note.onCancel?.(); dismiss(); }}
          style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:99998,
            opacity:visible?1:0,transition:'opacity 300ms ease' }} />
        <div data-testid="notify-confirm" role="alertdialog" aria-live="assertive"
          style={{
            position:'fixed',zIndex:99999,
            left:'50%',bottom: window.innerWidth < 768 ? 0 : '50%',
            transform: window.innerWidth < 768
              ? `translate(-50%, ${visible ? '0' : '100%'})`
              : `translate(-50%, ${visible ? '50%' : 'calc(50% + 40px)'})`,
            width: window.innerWidth < 768 ? '100%' : 'auto',
            maxWidth: 480, minWidth: 320,
            background:'#FFFFFF', color:'#1F2937',
            borderRadius: window.innerWidth < 768 ? '1rem 1rem 0 0' : '1rem',
            padding:'1.5rem 1.25rem', boxShadow:'0 -4px 24px rgba(0,0,0,.18)',
            transition:'transform 300ms ease-out, opacity 300ms ease-out',
            opacity:visible?1:0,
            paddingBottom: window.innerWidth < 768 ? 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' : '1.5rem',
          }}>
          <p style={{fontSize:'1rem',fontWeight:700,margin:'0 0 .35rem'}}>{note.title}</p>
          {note.description && <p style={{fontSize:'.9rem',margin:'0 0 1.25rem',opacity:.75}}>{note.description}</p>}
          <div style={{display:'flex',gap:'.75rem',justifyContent:'flex-end'}}>
            <button data-testid="notify-cancel-btn"
              onClick={() => { note.onCancel?.(); dismiss(); }}
              style={{
                padding:'.6rem 1.25rem',borderRadius:'.5rem',fontSize:'.9rem',fontWeight:600,
                background:'transparent',border:'1.5px solid #D1D5DB',color:'#374151',cursor:'pointer',
              }}>Cancelar</button>
            <button data-testid="notify-confirm-btn"
              onClick={() => { note.onConfirm?.(); dismiss(); }}
              style={{
                padding:'.6rem 1.25rem',borderRadius:'.5rem',fontSize:'.9rem',fontWeight:600,
                background:'#2563EB',border:'none',color:'#FFF',cursor:'pointer',
              }}>Confirmar</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div data-testid={`notify-${note.type}`} role="alert" aria-live="assertive"
      onClick={() => { if (window.innerWidth < 768 && note.type !== 'error') dismiss(); }}
      style={{
        position:'fixed', zIndex:99999,
        left:'50%', bottom:0,
        transform: `translate(-50%, ${visible ? '0' : '100%'})`,
        width: window.innerWidth < 768 ? '100%' : 'auto',
        maxWidth: 480, minWidth: 300,
        background: cfg.bg, color: cfg.text,
        borderRadius: window.innerWidth < 768 ? '1rem 1rem 0 0' : '1rem',
        marginBottom: window.innerWidth >= 768 ? '1.25rem' : 0,
        padding: '1.25rem',
        paddingBottom: window.innerWidth < 768 ? 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' : '1.25rem',
        boxShadow:'0 -4px 24px rgba(0,0,0,.18)',
        transition:'transform 300ms ease-out',
        display:'flex', alignItems:'flex-start', gap:'.75rem',
        minHeight: 70,
        cursor: window.innerWidth < 768 ? 'pointer' : 'default',
      }}>
      <Icon size={22} style={{ flexShrink:0, marginTop:2 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontWeight:700, fontSize:'1rem', lineHeight:1.3 }}>{note.title}</p>
        {note.description && (
          <p style={{ margin:'.3rem 0 0', fontSize:'.9rem', opacity:.9, lineHeight:1.35 }}>{note.description}</p>
        )}
      </div>
      {note.type === 'error' && (
        <button data-testid="notify-dismiss-btn" onClick={(e) => { e.stopPropagation(); dismiss(); }}
          aria-label="Cerrar" style={{
            background:'rgba(255,255,255,.2)',border:'none',borderRadius:'50%',
            width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',flexShrink:0,color: cfg.text,
          }}><X size={16} /></button>
      )}
    </div>
  );
}
