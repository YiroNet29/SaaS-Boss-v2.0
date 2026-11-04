import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  ArrowUpRight,
  DollarSign,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { calculate6MonthSpendTrend } from '../../utils/spendTrend';
import { formatCurrency } from '../../utils/formatters';

interface MonthlySpendTrendChartProps {
  onSelectTab?: (tab: string) => void;
}

export const MonthlySpendTrendChart: React.FC<MonthlySpendTrendChartProps> = ({ onSelectTab }) => {
  const { services, currentWorkspace } = useWorkspace();
  const { theme } = useTheme();
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'ETB'>('USD');

  // Compute 6-month historical spend trend
  const trend = useMemo(() => {
    return calculate6MonthSpendTrend(services, {
      exchangeRateEtbPerUsd: currentWorkspace.exchangeRates.ETB_per_USD,
    });
  }, [services, currentWorkspace.exchangeRates.ETB_per_USD]);

  // Chart theme colors
  const chartStyles = useMemo(() => {
    if (theme === 'midnight') {
      return {
        stroke: '#a1a1aa',
        fillStart: 'rgba(161, 161, 170, 0.25)',
        fillEnd: 'rgba(161, 161, 170, 0.01)',
        grid: '#1f1f1f',
        axisText: '#71717a',
        tooltipBg: '#09090b',
        tooltipBorder: '#27272a',
        tooltipText: '#f4f4f5',
        dotStroke: '#e4e4e7',
      };
    }
    if (theme === 'vscode') {
      return {
        stroke: '#007acc',
        fillStart: 'rgba(0, 122, 204, 0.3)',
        fillEnd: 'rgba(0, 122, 204, 0.02)',
        grid: '#2d2d2d',
        axisText: '#858585',
        tooltipBg: '#252526',
        tooltipBorder: '#383838',
        tooltipText: '#ffffff',
        dotStroke: '#007acc',
      };
    }
    // Light
    return {
      stroke: '#4f46e5',
      fillStart: 'rgba(79, 70, 229, 0.2)',
      fillEnd: 'rgba(79, 70, 229, 0.01)',
      grid: '#e5e0d8',
      axisText: '#78716c',
      tooltipBg: '#ffffff',
      tooltipBorder: '#e5e0d8',
      tooltipText: '#1c1917',
      dotStroke: '#4f46e5',
    };
  }, [theme]);

  const isGrowthPositive = trend.growthPercentage > 0;
  const isGrowthFlat = trend.growthPercentage === 0;

  // Recharts data mapper
  const chartData = trend.points.map((p) => ({
    name: p.shortLabel,
    monthLabel: p.monthLabel,
    value: selectedCurrency === 'USD' ? p.totalUsd : p.totalEtb,
    usd: p.totalUsd,
    etb: p.totalEtb,
    servicesCount: p.servicesCount,
    newServicesCount: p.newServicesCount,
    topCategory: p.topCategory,
  }));

  const maxVal = Math.max(...chartData.map((d) => d.value), 10);
  const yDomain = [0, Math.ceil(maxVal * 1.15)];

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/90 dark:border-slate-800 shadow-sm transition-all">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-stone-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700/80 flex items-center justify-center text-stone-700 dark:text-slate-300 shrink-0">
            <TrendingUp className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-slate-100 tracking-tight">
                Monthly Spend Trend
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-400 border border-stone-200 dark:border-slate-700">
                Last 6 Months
              </span>
              <span
                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isGrowthFlat
                    ? 'bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-400 border-stone-200 dark:border-slate-700'
                    : isGrowthPositive
                    ? 'bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-500/20 dark:border-amber-900/40'
                    : 'bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-900/40'
                }`}
              >
                {isGrowthPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : isGrowthFlat ? null : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>
                  {isGrowthPositive ? `+${trend.growthPercentage}%` : `${trend.growthPercentage}%`} Growth
                </span>
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">
              Historical budget growth trajectory and monthly amortized run rate
            </p>
          </div>
        </div>

        {/* Currency Switcher */}
        <div className="flex items-center gap-1 bg-stone-100 dark:bg-slate-800 p-1 rounded-xl border border-stone-200 dark:border-slate-700 self-start sm:self-auto">
          <button
            onClick={() => setSelectedCurrency('USD')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              selectedCurrency === 'USD'
                ? 'bg-white dark:bg-slate-700 text-stone-900 dark:text-slate-100 shadow-2xs'
                : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
            }`}
          >
            USD ($)
          </button>
          <button
            onClick={() => setSelectedCurrency('ETB')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              selectedCurrency === 'ETB'
                ? 'bg-white dark:bg-slate-700 text-stone-900 dark:text-slate-100 shadow-2xs'
                : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
            }`}
          >
            ETB (Birr)
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3.5">
        <div className="p-3 rounded-xl bg-stone-50 dark:bg-slate-900/80 border border-stone-200/90 dark:border-slate-800">
          <span className="text-[10px] text-stone-500 dark:text-slate-500 uppercase tracking-wider font-semibold block">
            Current Run Rate
          </span>
          <span className="text-base sm:text-lg font-extrabold text-stone-900 dark:text-slate-100 font-mono tracking-tight mt-0.5 block">
            {formatCurrency(
              selectedCurrency === 'USD'
                ? trend.currentMonthlyUsd
                : trend.currentMonthlyUsd * currentWorkspace.exchangeRates.ETB_per_USD,
              selectedCurrency
            )}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-stone-50 dark:bg-slate-900/80 border border-stone-200/90 dark:border-slate-800">
          <span className="text-[10px] text-stone-500 dark:text-slate-500 uppercase tracking-wider font-semibold block">
            6-Month Net Change
          </span>
          <span
            className={`text-base sm:text-lg font-extrabold font-mono tracking-tight mt-0.5 block ${
              isGrowthPositive
                ? 'text-amber-600 dark:text-amber-400'
                : isGrowthFlat
                ? 'text-stone-600 dark:text-slate-300'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {isGrowthPositive ? '+' : ''}
            {formatCurrency(
              selectedCurrency === 'USD'
                ? trend.netChangeUsd
                : trend.netChangeUsd * currentWorkspace.exchangeRates.ETB_per_USD,
              selectedCurrency
            )}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-stone-50 dark:bg-slate-900/80 border border-stone-200/90 dark:border-slate-800">
          <span className="text-[10px] text-stone-500 dark:text-slate-500 uppercase tracking-wider font-semibold block">
            Peak Month
          </span>
          <span className="text-base sm:text-lg font-extrabold text-stone-900 dark:text-slate-100 font-mono tracking-tight mt-0.5 block">
            {trend.peakMonth.shortLabel}{' '}
            <span className="text-xs text-stone-500 dark:text-slate-400 font-normal">
              (
              {formatCurrency(
                selectedCurrency === 'USD'
                  ? trend.peakMonth.amountUsd
                  : trend.peakMonth.amountUsd * currentWorkspace.exchangeRates.ETB_per_USD,
                selectedCurrency
              )}
              )
            </span>
          </span>
        </div>

        <div className="p-3 rounded-xl bg-stone-50 dark:bg-slate-900/80 border border-stone-200/90 dark:border-slate-800">
          <span className="text-[10px] text-stone-500 dark:text-slate-500 uppercase tracking-wider font-semibold block">
            6-Month Total Expended
          </span>
          <span className="text-base sm:text-lg font-extrabold text-stone-900 dark:text-slate-100 font-mono tracking-tight mt-0.5 block">
            {formatCurrency(
              selectedCurrency === 'USD'
                ? trend.total6MonthSpendUsd
                : trend.total6MonthSpendUsd * currentWorkspace.exchangeRates.ETB_per_USD,
              selectedCurrency
            )}
          </span>
        </div>
      </div>

      {/* Recharts Area Chart */}
      <div className="h-64 w-full mt-2 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
          >
            <defs>
              <linearGradient id="spendTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartStyles.stroke} stopOpacity={0.4} />
                <stop offset="95%" stopColor={chartStyles.stroke} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartStyles.grid}
              vertical={false}
            />

            <XAxis
              dataKey="name"
              stroke={chartStyles.axisText}
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: chartStyles.grid }}
              dy={6}
            />

            <YAxis
              stroke={chartStyles.axisText}
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: chartStyles.grid }}
              domain={yDomain}
              tickFormatter={(val) =>
                selectedCurrency === 'USD' ? `$${val}` : `${Math.round(val / 1000)}k`
              }
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload;
                return (
                  <div
                    style={{
                      backgroundColor: chartStyles.tooltipBg,
                      borderColor: chartStyles.tooltipBorder,
                      color: chartStyles.tooltipText,
                    }}
                    className="p-3 rounded-xl border shadow-xl text-xs space-y-1.5"
                  >
                    <div className="font-bold text-xs pb-1 border-b border-stone-200/50 dark:border-slate-800 flex items-center justify-between gap-3">
                      <span>{data.monthLabel}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(data.value, selectedCurrency)}
                      </span>
                    </div>

                    <div className="space-y-0.5 text-[11px] opacity-85">
                      <div className="flex justify-between gap-4">
                        <span>Alternate currency:</span>
                        <span className="font-mono font-semibold">
                          {selectedCurrency === 'USD'
                            ? formatCurrency(data.etb, 'ETB')
                            : formatCurrency(data.usd, 'USD')}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span>Active services:</span>
                        <span className="font-semibold">{data.servicesCount}</span>
                      </div>
                      {data.newServicesCount > 0 && (
                        <div className="flex justify-between gap-4 text-indigo-600 dark:text-indigo-400">
                          <span>New services added:</span>
                          <span className="font-semibold">+{data.newServicesCount}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <span>Top category:</span>
                        <span className="font-semibold capitalize">{data.topCategory}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={chartStyles.stroke}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#spendTrendGradient)"
              activeDot={{
                r: 5,
                fill: chartStyles.stroke,
                stroke: chartStyles.dotStroke,
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
