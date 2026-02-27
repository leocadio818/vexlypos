import { formatMoney } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus, Users, Clock, Building2 } from 'lucide-react';
import { LineChart, Line } from 'recharts';

export const COLORS = ['#FF6600', '#E53935', '#1E88E5', '#43A047', '#FFB300', '#E91E63', '#8E24AA', '#00BCD4', '#FF5722', '#607D8B'];

export const Sparkline = ({ data, color = '#FF6600', height = 24 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 60;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

export const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold">{payload[0]?.payload?.name || payload[0]?.payload?.category || payload[0]?.payload?.date}</p>
      <p className="font-oswald text-primary">{formatMoney(payload[0]?.value)}</p>
    </div>
  );
};

export { formatMoney, Badge, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend, LineChart, Line, ArrowUpRight, ArrowDownRight, Minus, Users, Clock, Building2 };
