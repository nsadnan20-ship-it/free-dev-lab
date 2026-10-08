import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export const COLORS = ['#147e74', '#e0a21a', '#3a9a8d', '#c8870b', '#dc2626', '#0f655d', '#f6ca57', '#5cb6a8'];

const tooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  direction: 'rtl' as const,
};

interface ChartProps {
  data: object[];
  height?: number;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (typeof value === 'string') return value;
  return '';
}

const tooltipFormatter = (value: unknown): [string, string] => [formatValue(value), ''];

export function TrendChart({ data, height = 280 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#147e74" stopOpacity={0.15} /><stop offset="95%" stopColor="#147e74" stopOpacity={0} /></linearGradient>
          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3a9a8d" stopOpacity={0.15} /><stop offset="95%" stopColor="#3a9a8d" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4efec" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Area type="monotone" dataKey="sales" stroke="#147e74" strokeWidth={2} fill="url(#colorSales)" name="المبيعات" />
        <Area type="monotone" dataKey="profit" stroke="#3a9a8d" strokeWidth={2} fill="url(#colorProfit)" name="الربح" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, height = 280, dataKey = 'value', nameKey = 'name' }: ChartProps & { dataKey?: string; nameKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4efec" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Bar dataKey={dataKey} fill="#147e74" radius={[6, 6, 0, 0]} name="القيمة" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({ data, height = 280, dataKey = 'value', nameKey = 'name' }: ChartProps & { dataKey?: string; nameKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4efec" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
        <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11, fill: '#58766f' }} axisLine={false} tickLine={false} width={100} />
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Bar dataKey={dataKey} fill="#e0a21a" radius={[0, 6, 6, 0]} name="القيمة" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data, height = 280 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="sales" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Sans Arabic' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({ data, height = 280 }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4efec" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#6f918a' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
        <Line type="monotone" dataKey="forecast_value" stroke="#147e74" strokeWidth={2} name="التنبؤ" dot={{ r: 4 }} />
        <Line type="monotone" dataKey="upper_bound" stroke="#e0a21a" strokeWidth={1} strokeDasharray="5 5" name="الحد الأعلى" dot={false} />
        <Line type="monotone" dataKey="lower_bound" stroke="#c8870b" strokeWidth={1} strokeDasharray="5 5" name="الحد الأدنى" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
