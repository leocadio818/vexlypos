import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onNotify } from '@/lib/notify';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

/* ── helpers ─────────────────────────────────────────── */
const FISCAL_KEYWORDS = ['e-cf','ecf','dgii','ncf','contingencia','fiscal','alanube','factory','comprobante'];

function isFiscal(n) {
  const txt = `${n.title || ''} ${n.description || ''}`.toLowerCase();
  return FISCAL_KEYWORDS.some(k => txt.includes(k));
}

function getDuration(n) {
  if (n.type === 'confirm') return 0;
  if (isFiscal(n)) return 10000;
  if (n.type === 'error') return 15000;
  if (n.type === 'warning') return 5000;
  return 3000; // success, info
}

const TYPE_STYLE = {
  success: { bg: '#22C55E', text: '#FFFFFF', icon: CheckCircle },
  error:   { bg: '#EF4444', text: '#FFFFFF', icon: AlertCircle },
  warning: { bg: '#F59E0B', text: '#1F2937', icon: AlertTriangle },
  info:    { bg: '#3B82F6', text: '#FFFFFF', icon: Info },
};

let idCounter = 0;

/* ── component ───────────────────────────────────────── */
export default function BottomSheetNotification() {
  const [notes, setNotes] = useState([]);          // [{id,type,title,description,visible,duration,...}]
  const [confirm, setConfirm] = useState(null);     // single confirm at a time
  const [confirmVis, setConfirmVis] = useState(false);
  const [paused, setPaused] = useState(false);
  const timersRef  = useRef({});
  const pausedAt   = useRef({});                    // { [id]: remaining ms }

  /* ── dismiss one note ──────────────────────────────── */
  const dismissNote = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    delete pausedAt.current[id];
    setNotes(prev => prev.map(n => n.id === id ? { ...n, visible: false } : n));
    setTimeout(() => setNotes(prev => prev.filter(n => n.id !== id)), 320);
  }, []);

  /* ── start / resume timer ──────────────────────────── */
  const startTimer = useCallback((id, ms) => {
    if (ms <= 0) return;
    clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => dismissNote(id), ms);
  }, [dismissNote]);

  /* ── modal detection → pause / resume ──────────────── */
  useEffect(() => {
    const check = () => {
      const open = !!document.querySelector(
        '[role="dialog"][data-state="open"], [data-radix-dialog-overlay], .payment-success-modal'
      );
      setPaused(open);
    };
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    check();
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (paused) {
      // pause all running timers
      Object.keys(timersRef.current).forEach(id => {
        clearTimeout(timersRef.current[id]);
        const n = notes.find(x => x.id === +id);
        if (n) pausedAt.current[id] = Math.max(0, (n._expiresAt || 0) - Date.now());
      });
    } else {
      // resume with remaining time
      Object.entries(pausedAt.current).forEach(([id, remaining]) => {
        if (remaining > 0) startTimer(+id, remaining);
      });
      pausedAt.current = {};
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  /* ── show handler ──────────────────────────────────── */
  const show = useCallback((n) => {
    if (n.type === 'dismiss') {
      setNotes(prev => { prev.forEach(x => dismissNote(x.id)); return []; });
      setConfirm(null); setConfirmVis(false);
      return;
    }

    if (n.type === 'confirm') {
      setConfirm(n);
      requestAnimationFrame(() => requestAnimationFrame(() => setConfirmVis(true)));
      return;
    }

    const id = ++idCounter;
    const duration = getDuration(n);
    const fiscal = isFiscal(n);
    const entry = { ...n, id, visible: false, duration, fiscal, _expiresAt: Date.now() + duration };

    setNotes(prev => {
      let next = [...prev];
      // enforce max 2: dismiss oldest if needed
      while (next.length >= 2) {
        const oldest = next[0];
        clearTimeout(timersRef.current[oldest.id]);
        delete timersRef.current[oldest.id];
        next = next.slice(1);
      }
      return [...next, entry];
    });

    // animate in after paint
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setNotes(prev => prev.map(x => x.id === id ? { ...x, visible: true } : x));
    }));

    if (duration > 0) startTimer(id, duration);
  }, [dismissNote, startTimer]);

  useEffect(() => onNotify(show), [show]);

  /* ── keyboard dismiss ──────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (confirm) { confirm.onCancel?.(); setConfirmVis(false); setTimeout(() => setConfirm(null), 300); }
        else if (notes.length) dismissNote(notes[notes.length - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notes, confirm, dismissNote]);

  /* ── render ────────────────────────────────────────── */
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <>
      {/* ── CONFIRM DIALOG ──────────────────────────── */}
      {confirm && (
        <>
          <div data-testid="notify-overlay"
            onClick={() => { confirm.onCancel?.(); setConfirmVis(false); setTimeout(() => setConfirm(null), 300); }}
            style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:99998,
              opacity:confirmVis?1:0,transition:'opacity 300ms ease' }} />
          <div data-testid="notify-confirm" role="alertdialog" aria-live="assertive"
            style={{
              position:'fixed',zIndex:99999,
              left:'50%', bottom: isMobile ? 0 : '50%',
              transform: isMobile
                ? `translate(-50%, ${confirmVis ? '0' : '100%'})`
                : `translate(-50%, ${confirmVis ? '50%' : 'calc(50% + 40px)'})`,
              width: isMobile ? '100%' : 'auto', maxWidth:480, minWidth:320,
              background:'#FFFFFF', color:'#1F2937',
              borderRadius: isMobile ? '1rem 1rem 0 0' : '1rem',
              padding:'1.5rem 1.25rem', boxShadow:'0 -4px 24px rgba(0,0,0,.18)',
              transition:'transform 300ms ease-out, opacity 300ms ease-out',
              opacity:confirmVis?1:0,
              paddingBottom: isMobile ? 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' : '1.5rem',
            }}>
            <p style={{fontSize:'1rem',fontWeight:700,margin:'0 0 .35rem'}}>{confirm.title}</p>
            {confirm.description && <p style={{fontSize:'.9rem',margin:'0 0 1.25rem',opacity:.75}}>{confirm.description}</p>}
            <div style={{display:'flex',gap:'.75rem',justifyContent:'flex-end'}}>
              <button data-testid="notify-cancel-btn"
                onClick={() => { confirm.onCancel?.(); setConfirmVis(false); setTimeout(() => setConfirm(null), 300); }}
                style={{ padding:'.6rem 1.25rem',borderRadius:'.5rem',fontSize:'.9rem',fontWeight:600,
                  background:'transparent',border:'1.5px solid #D1D5DB',color:'#374151',cursor:'pointer' }}>
                Cancelar</button>
              <button data-testid="notify-confirm-btn"
                onClick={() => { confirm.onConfirm?.(); setConfirmVis(false); setTimeout(() => setConfirm(null), 300); }}
                style={{ padding:'.6rem 1.25rem',borderRadius:'.5rem',fontSize:'.9rem',fontWeight:600,
                  background:'#2563EB',border:'none',color:'#FFF',cursor:'pointer' }}>
                Confirmar</button>
            </div>
          </div>
        </>
      )}

      {/* ── NOTIFICATION STACK ──────────────────────── */}
      {notes.map((n, idx) => {
        const cfg = TYPE_STYLE[n.type] || TYPE_STYLE.info;
        const Icon = cfg.icon;
        const offset = idx === 0 && notes.length === 2 ? 90 : 0; // push first one up if two stacked

        return (
          <div key={n.id} data-testid={`notify-${n.type}`} role="alert" aria-live="assertive"
            onClick={() => { if (isMobile) dismissNote(n.id); }}
            style={{
              position:'fixed', zIndex: 99997 - idx,
              left:'50%', bottom: offset,
              transform: `translate(-50%, ${n.visible ? '0' : '100%'})`,
              width: isMobile ? '100%' : 'auto', maxWidth:480, minWidth:300,
              background: cfg.bg, color: cfg.text,
              borderRadius: isMobile && offset === 0 ? '1rem 1rem 0 0' : '1rem',
              marginBottom: !isMobile && offset === 0 ? '1.25rem' : 0,
              padding:'1.25rem',
              paddingBottom: isMobile && offset === 0 ? 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' : '1.25rem',
              boxShadow:'0 -4px 24px rgba(0,0,0,.18)',
              transition:'transform 300ms ease-out, bottom 300ms ease-out',
              display:'flex', alignItems:'flex-start', gap:'.75rem',
              minHeight:70, cursor: isMobile ? 'pointer' : 'default',
              overflow:'hidden',
            }}>
            <Icon size={22} style={{ flexShrink:0, marginTop:2 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontWeight:700, fontSize:'1rem', lineHeight:1.3 }}>{n.title}</p>
              {n.description && (
                <p style={{ margin:'.3rem 0 0', fontSize:'.9rem', opacity:.9, lineHeight:1.35 }}>{n.description}</p>
              )}
            </div>
            <button data-testid="notify-dismiss-btn" onClick={(e) => { e.stopPropagation(); dismissNote(n.id); }}
              aria-label="Cerrar" style={{
                background:'rgba(255,255,255,.2)',border:'none',borderRadius:'50%',
                width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
                cursor:'pointer',flexShrink:0,color:cfg.text,
              }}><X size={16} /></button>

            {/* ── PROGRESS BAR for fiscal messages ──── */}
            {n.fiscal && n.duration > 0 && (
              <div style={{
                position:'absolute', left:0, bottom:0, right:0, height:3,
                background:'rgba(255,255,255,.25)',
              }}>
                <div style={{
                  height:'100%', background:'rgba(255,255,255,.7)',
                  animation: `notifyProgress ${n.duration}ms linear forwards`,
                  animationPlayState: paused ? 'paused' : 'running',
                }} />
              </div>
            )}
          </div>
        );
      })}

      {/* ── KEYFRAME for progress bar ─────────────── */}
      <style>{`@keyframes notifyProgress { from { width:100% } to { width:0% } }`}</style>
    </>
  );
}
