import { useState, useCallback, useMemo, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react';

const DAYS_ES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Cache time format globally so all pickers share it
let _cachedTimeFormat = null;
function useTimeFormat() {
  const [fmt, setFmt] = useState(_cachedTimeFormat || '12h');
  useEffect(() => {
    if (_cachedTimeFormat) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/system/config`)
      .then(r => r.json())
      .then(d => { const f = d.time_format || '12h'; _cachedTimeFormat = f; setFmt(f); })
      .catch(() => {});
  }, []);
  return fmt;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

/**
 * NeoDatePicker — Custom neumorphic calendar popup
 * Drop-in replacement for <input type="date">
 */
export function NeoDatePicker({ value, onChange, className = '', placeholder = 'Seleccionar fecha', label, disabled }) {
  const [open, setOpen] = useState(false);
  
  const today = new Date();
  const selected = value ? new Date(value + 'T00:00:00') : null;
  const [viewYear, setViewYear] = useState(selected?.getFullYear() || today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [firstDay, daysInMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange({ target: { value: `${viewYear}-${m}-${d}` } });
    setOpen(false);
  };

  const isToday = (day) => day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const isSelected = (day) => selected && day === selected.getDate() && viewMonth === selected.getMonth() && viewYear === selected.getFullYear();

  const displayValue = value || '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled}
          className={`flex items-center gap-2 text-left cursor-pointer disabled:opacity-50 ${className}`}
          data-testid="neo-date-picker">
          <CalendarDays size={14} className="text-muted-foreground shrink-0" />
          {displayValue ? <span>{displayValue}</span> : <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-32px)] max-w-[300px] p-0" align="start" data-testid="neo-calendar-popup">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <button type="button" onClick={prevMonth} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-primary/20 transition-all active:scale-90">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <span className="font-oswald font-bold text-sm">{MONTHS_ES[viewMonth]}</span>
            <span className="font-oswald text-sm text-muted-foreground ml-2">{viewYear}</span>
          </div>
          <button type="button" onClick={nextMonth} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-primary/20 transition-all active:scale-90">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Days Grid */}
        <div className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS_ES.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day, i) => (
              <div key={i} className="aspect-square flex items-center justify-center">
                {day && (
                  <button type="button" onClick={() => selectDay(day)}
                    className={`w-full h-full rounded-md text-xs font-medium transition-all active:scale-90
                      ${isSelected(day)
                        ? 'bg-primary text-primary-foreground font-bold shadow-lg'
                        : isToday(day)
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'hover:bg-muted'
                      }`}>
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Today shortcut */}
        <div className="border-t border-border p-2">
          <button type="button" onClick={() => selectDay(today.getDate()) || setViewMonth(today.getMonth()) || setViewYear(today.getFullYear())}
            className="w-full text-xs text-primary font-medium hover:bg-primary/10 rounded-lg py-1.5 transition-all"
            onClickCapture={() => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); }}>
            Hoy
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * NeoTimePicker — Custom neumorphic time selector popup
 * Drop-in replacement for <input type="time">
 * Supports 12h (AM/PM) and 24h formats. Always stores value in 24h internally.
 */
export function NeoTimePicker({ value, onChange, className = '', placeholder = 'Seleccionar hora', disabled, use12h }) {
  const [open, setOpen] = useState(false);
  const timeFormat = useTimeFormat();
  const is12h = use12h !== undefined ? use12h : timeFormat === '12h';

  const hours24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const hours12 = Array.from({ length: 12 }, (_, i) => i === 0 ? 12 : i);
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const [selHour, selMin] = (value || '').split(':');
  const selHourNum = parseInt(selHour || '0');
  const [ampm, setAmpm] = useState(selHourNum >= 12 ? 'PM' : 'AM');

  const to24 = (h12, period) => {
    if (period === 'AM') return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  };

  const selectTime = useCallback((h, m) => {
    onChange({ target: { value: `${h}:${m}` } });
    setOpen(false);
  }, [onChange]);

  const selectTime12 = useCallback((h12, m, period) => {
    const h24 = String(to24(h12, period)).padStart(2, '0');
    selectTime(h24, m);
  }, [selectTime]);

  // Display value in chosen format
  const displayValue = useMemo(() => {
    if (!value) return '';
    if (!is12h) return value;
    const h = parseInt(value.split(':')[0]);
    const m = value.split(':')[1];
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
  }, [value, is12h]);

  const current12h = selHourNum === 0 ? 12 : selHourNum > 12 ? selHourNum - 12 : selHourNum;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled}
          className={`flex items-center gap-2 text-left cursor-pointer disabled:opacity-50 ${className}`}
          data-testid="neo-time-picker">
          <Clock size={14} className="text-muted-foreground shrink-0" />
          {displayValue ? <span>{displayValue}</span> : <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-32px)] max-w-[260px] p-0" align="start" data-testid="neo-time-popup">
        <div className="p-2 sm:p-3">
          <p className="text-xs font-bold text-muted-foreground mb-2 text-center">Seleccionar Hora</p>

          {is12h ? (
            /* ── 12H Mode ── */
            <div>
              {/* AM/PM Toggle */}
              <div className="flex gap-1 mb-2">
                <button type="button" onClick={() => setAmpm('AM')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-oswald font-bold transition-all ${ampm === 'AM' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  AM
                </button>
                <button type="button" onClick={() => setAmpm('PM')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-oswald font-bold transition-all ${ampm === 'PM' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  PM
                </button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground text-center mb-1">Hora</p>
                  <div className="grid grid-cols-4 gap-0.5">
                    {hours12.map(h => (
                      <button key={h} type="button" onClick={() => selectTime12(h, selMin || '00', ampm)}
                        className={`py-2 rounded-md text-[11px] font-oswald font-bold transition-all active:scale-90
                          ${h === current12h && ((ampm === 'AM' && selHourNum < 12) || (ampm === 'PM' && selHourNum >= 12))
                            ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-px bg-border" />
                <div className="w-[70px]">
                  <p className="text-[10px] text-muted-foreground text-center mb-1">Min</p>
                  <div className="grid grid-cols-2 gap-0.5">
                    {minutes.map(m => (
                      <button key={m} type="button" onClick={() => selectTime12(current12h || 12, m, ampm)}
                        className={`py-2 rounded-md text-[11px] font-oswald font-bold transition-all active:scale-90
                          ${m === selMin ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                        :{m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── 24H Mode ── */
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground text-center mb-1">Hora</p>
                <div className="grid grid-cols-4 gap-0.5 max-h-[180px] overflow-y-auto">
                  {hours24.map(h => (
                    <button key={h} type="button" onClick={() => selectTime(h, selMin || '00')}
                      className={`py-1.5 rounded-md text-[11px] font-oswald font-bold transition-all active:scale-90
                        ${h === selHour ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-px bg-border" />
              <div className="w-[70px]">
                <p className="text-[10px] text-muted-foreground text-center mb-1">Min</p>
                <div className="grid grid-cols-2 gap-0.5 max-h-[180px] overflow-y-auto">
                  {minutes.map(m => (
                    <button key={m} type="button" onClick={() => selectTime(selHour || '12', m)}
                      className={`py-1.5 rounded-md text-[11px] font-oswald font-bold transition-all active:scale-90
                        ${m === selMin ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                      :{m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
