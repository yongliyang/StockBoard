"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchStockData, fetchIndustryBenchmark, TimeFrame, StockData, PricePoint, STOCK_METADATA } from '@/lib/mockData';
import { Sparkline } from '@/components/Sparkline';
import {
  Search,
  Plus,
  X,
  RefreshCw,
  Bell,
  MoreHorizontal,
  ChevronDown,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  Calendar
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format, subMonths, startOfToday } from 'date-fns';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * useState 的 localStorage 持久化版本
 */
function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch { /* quota exceeded 等错误静默处理 */ }
  }, [key, state]);

  return [state, setState];
}

type DateRange = '1M' | '3M' | '6M' | '1Y' | 'CUSTOM';

const RANGE_DAYS: Record<Exclude<DateRange, 'CUSTOM'>, number> = {
  '1M': 22,
  '3M': 66,
  '6M': 132,
  '1Y': 260,
};

const DEFAULT_WATCHLIST = ['AAPL', 'NVDA', '600519', '00700', 'TSLA', 'BILI', 'QQQ', 'SMH', '000001', 'EWH'];

export default function Home() {
  // 防止 SSR 与客户端 hydrated 前的 watchlist 不一致导致 hydration 错误
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [timeFrame, setTimeFrame] = useState<TimeFrame>('D');
  const [dateRange, setDateRange] = useState<DateRange>('3M');
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [watchlist, setWatchlist] = usePersistedState<string[]>('stockboard-watchlist', DEFAULT_WATCHLIST);
  const [activeTab, setActiveTab] = useState('自选股票');
  const [startDate, setStartDate] = useState<Date | null>(subMonths(startOfToday(), 3));
  const [endDate, setEndDate] = useState<Date | null>(startOfToday());

  // 排序
  const [sortBy, setSortBy] = useState<'totalReturn' | 'alphaReturn'>('totalReturn');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (column: 'totalReturn' | 'alphaReturn') => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // 自定义基准（持久化）
  const [customBenchmarks, setCustomBenchmarks] = usePersistedState<Record<string, string>>('stockboard-custom-benchmarks', {});
  const customBenchmarksRef = useRef(customBenchmarks);
  customBenchmarksRef.current = customBenchmarks;
  // 基准输入框状态
  const [benchmarkInputs, setBenchmarkInputs] = useState<Record<string, string>>({});

  // 重试状态
  const [retryInfo, setRetryInfo] = useState<Record<string, number>>({});
  const retryCounts = useRef<Record<string, number>>({});
  const retryTimers = useRef<NodeJS.Timeout[]>([]);
  const timeFrameRef = useRef(timeFrame);
  timeFrameRef.current = timeFrame;

  // 日内缓存：同一交易日已获取的数据不再重新调用 API
  const dataCache = useRef<Record<string, { stock: StockData; benchmark: { history: PricePoint[]; name?: string }; date: string }>>({});
  function getTodayStr() { return new Date().toISOString().slice(0, 10); }
  async function fetchStockCached(symbol: string, bypassCache = false): Promise<StockData> {
    const key = `${symbol}-${timeFrameRef.current}-stock`;
    const today = getTodayStr();
    if (!bypassCache && dataCache.current[key]?.date === today) return dataCache.current[key].stock;
    const result = await fetchStockData(symbol, timeFrameRef.current);
    dataCache.current[key] = { ...dataCache.current[key], stock: result, date: today };
    return result;
  }
  async function fetchBenchmarkCached(symbol: string, customBenchmark?: string, bypassCache = false): Promise<{ history: PricePoint[]; name?: string }> {
    const key = `${symbol}-${timeFrameRef.current}-benchmark-${customBenchmark || ''}`;
    const today = getTodayStr();
    if (!bypassCache && dataCache.current[key]?.date === today) return dataCache.current[key].benchmark;
    const result = await fetchIndustryBenchmark(symbol, timeFrameRef.current, customBenchmark);
    dataCache.current[key] = { ...dataCache.current[key], benchmark: result, date: today };
    return result;
  }

  function cancelRetries() {
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current = [];
  }

  const retryStock = useCallback(async (symbol: string) => {
    const count = (retryCounts.current[symbol] || 0) + 1;
    retryCounts.current[symbol] = count;
    setRetryInfo(prev => ({ ...prev, [symbol]: count }));

    if (count > 10) return;

    const benchSymbol = customBenchmarksRef.current[symbol];
    const [stockResult, benchmarkResult] = await Promise.all([
      fetchStockCached(symbol),
      fetchBenchmarkCached(symbol, benchSymbol),
    ]);

    if (stockResult.history.length > 0 && !stockResult.error) {
      setStocks(prev => prev.map(s =>
        s.symbol === symbol
          ? { ...stockResult, industryBenchmark: benchmarkResult.history, industryBenchmarkName: benchmarkResult.name }
          : s
      ));
      setRetryInfo(prev => { const next = { ...prev }; delete next[symbol]; return next; });
    } else {
      const delay = Math.min(2000 * Math.pow(2, count - 1), 60000);
      const timer = setTimeout(() => retryStock(symbol), delay);
      retryTimers.current.push(timer);
    }
  }, []);

  // 设置自定义基准并立即获取数据
  const handleSetBenchmark = useCallback(async (symbol: string, benchmarkSymbol: string) => {
    const bs = benchmarkSymbol.toUpperCase().trim();

    // 清除输入状态
    setBenchmarkInputs(prev => { const next = { ...prev }; delete next[symbol]; return next; });

    if (!bs) {
      // 用户清空了输入 → 删除该股票的自定义基准
      setCustomBenchmarks(prev => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
      setStocks(prev => prev.map(s =>
        s.symbol === symbol
          ? { ...s, industryBenchmark: [], industryBenchmarkName: undefined }
          : s
      ));
      return;
    }

    // 如果基准代码变了，清除旧缓存
    const oldBenchmark = customBenchmarksRef.current[symbol];
    if (oldBenchmark && oldBenchmark !== bs) {
      const oldKey = `${symbol}-${timeFrameRef.current}-benchmark-${oldBenchmark}`;
      if (dataCache.current[oldKey]) delete dataCache.current[oldKey];
    }

    setCustomBenchmarks(prev => ({ ...prev, [symbol]: bs }));
    // 同步更新 ref，确保后续 retryStock 能读到最新值（无需等待 re-render）
    customBenchmarksRef.current = { ...customBenchmarksRef.current, [symbol]: bs };

    // 使用缓存封装版，bypass=true 确保实际调用 API
    const result = await fetchBenchmarkCached(symbol, bs, true);
    if (result.history.length > 0) {
      setStocks(prev => prev.map(s =>
        s.symbol === symbol
          ? { ...s, industryBenchmark: result.history, industryBenchmarkName: result.name || bs }
          : s
      ));
    } else {
      // API 暂时失败 → 重置重试计数并启动退避重试
      retryCounts.current[symbol] = 0;
      retryStock(symbol);
    }
  }, [timeFrame, setCustomBenchmarks]);

  const handleRefresh = useCallback(() => {
    cancelRetries();
    retryCounts.current = {};
    setRetryInfo({});
    setLoading(true);

    (async () => {
      // 清除当前 watchlist 的缓存，确保刷新获取最新数据
      const today = getTodayStr();
      watchlist.forEach(symbol => {
        const stockKey = `${symbol}-${timeFrame}-stock`;
        const benchKey = `${symbol}-${timeFrame}-benchmark-${customBenchmarksRef.current[symbol] || ''}`;
        if (dataCache.current[stockKey]?.date === today) delete dataCache.current[stockKey];
        if (dataCache.current[benchKey]?.date === today) delete dataCache.current[benchKey];
      });

      const cb = customBenchmarksRef.current;
      const [stockResults, benchmarkResults] = await Promise.all([
        Promise.all(watchlist.map(symbol => fetchStockCached(symbol, true))),
        Promise.all(watchlist.map(symbol => fetchBenchmarkCached(symbol, cb[symbol], true))),
      ]);

      const data = stockResults.map((stock, i) => ({
        ...stock,
        industryBenchmark: benchmarkResults[i].history,
        industryBenchmarkName: benchmarkResults[i].name,
      }));

      setStocks(data);
      setLoading(false);
    })();
  }, [watchlist, timeFrame]);

  // 初始加载完成后，对失败股票启动退避重试
  useEffect(() => {
    if (loading) return;

    cancelRetries();

    const failedSymbols = stocks
      .filter(s => s.error || s.history.length === 0)
      .map(s => s.symbol);

    failedSymbols.forEach(symbol => {
      const timer = setTimeout(() => retryStock(symbol), 2000);
      retryTimers.current.push(timer);
    });

    return () => cancelRetries();
    // 仅在 loading 状态变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // 并行加载个股行情 + 行业基准数据（含用户自定义基准）
      const cb = customBenchmarksRef.current;
      const [stockResults, benchmarkResults] = await Promise.all([
        Promise.all(watchlist.map(symbol => fetchStockCached(symbol))),
        Promise.all(watchlist.map(symbol => fetchBenchmarkCached(symbol, cb[symbol]))),
      ]);

      // 将行业基准数据合并到 stockData 中
      const data = stockResults.map((stock, i) => ({
        ...stock,
        industryBenchmark: benchmarkResults[i].history,
        industryBenchmarkName: benchmarkResults[i].name,
      }));

      setStocks(data);
      setLoading(false);
    }
    loadData();
  }, [timeFrame, watchlist]);

  const processedStocks = useMemo(() => {
    return stocks.map(stock => {
      let history = [...stock.history];
      let benchmarkHistory = [...(stock.industryBenchmark || [])];
      let alphaHistory: PricePoint[] = [];

      if (dateRange === 'CUSTOM' && startDate && endDate) {
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');
        history = stock.history.filter(p => p.date >= startStr && p.date <= endStr);
        benchmarkHistory = (stock.industryBenchmark || [])
          .filter(p => p.date >= startStr && p.date <= endStr);
      } else if (dateRange !== 'CUSTOM') {
        const pointsToTake = RANGE_DAYS[dateRange];
        history = stock.history.slice(-pointsToTake);
        benchmarkHistory = (stock.industryBenchmark || []).slice(-pointsToTake);
      }

      if (history.length === 0) history = stock.history.slice(-66);
      if (benchmarkHistory.length === 0) benchmarkHistory = (stock.industryBenchmark || []).slice(-history.length);

      const firstPrice = history[0]?.price || 1;
      const firstBenchmarkPrice = benchmarkHistory[0]?.price ?? firstPrice;

      // 将价格走势转换为累计涨跌幅（百分比），让涨幅大小在图上可比较
      const pctHistory = history.map(point => ({
        ...point,
        price: ((point.price - firstPrice) / firstPrice) * 100,
      }));

      // 行业趋势也转为累计涨跌幅
      const pctBenchmarkHistory = benchmarkHistory.map(point => ({
        ...point,
        price: firstBenchmarkPrice !== 0
          ? ((point.price - firstBenchmarkPrice) / firstBenchmarkPrice) * 100
          : 0,
      }));

      // Alpha 本身就是超额收益百分比
      alphaHistory = history.map((point, i) => {
        const stockReturn = (point.price - firstPrice) / firstPrice;
        // 按日期对齐：对于 stock 的每个日期，找 benchmark 中最近日期的价格
        const benchPoint = benchmarkHistory.find(b => b.date === point.date)
          || benchmarkHistory[Math.min(i, benchmarkHistory.length - 1)];
        const benchPrice = benchPoint?.price ?? firstBenchmarkPrice;
        const benchReturn = firstBenchmarkPrice !== 0
          ? (benchPrice - firstBenchmarkPrice) / firstBenchmarkPrice
          : 0;
        return {
          ...point,
          price: (stockReturn - benchReturn) * 100,
        };
      });

      const totalReturn = pctHistory.length > 0 ? pctHistory[pctHistory.length - 1].price : 0;
      const benchmarkReturn = pctBenchmarkHistory.length > 0 ? pctBenchmarkHistory[pctBenchmarkHistory.length - 1].price : 0;
      const alphaReturn = alphaHistory.length > 0 ? alphaHistory[alphaHistory.length - 1].price : 0;

      return { ...stock, history: pctHistory, benchmarkHistory: pctBenchmarkHistory, alphaHistory, totalReturn, benchmarkReturn, alphaReturn };
    });
  }, [stocks, dateRange, startDate, endDate]);

  // 排序后的股票列表
  const sortedStocks = useMemo(() => {
    return [...processedStocks].sort((a, b) => {
      const aVal = sortBy === 'totalReturn' ? a.totalReturn : a.alphaReturn;
      const bVal = sortBy === 'totalReturn' ? b.totalReturn : b.alphaReturn;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [processedStocks, sortBy, sortOrder]);

  const handleAddStock = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
    setSearchQuery('');
  };

  const handleRemoveStock = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const tabs = ['自选股票', '自选基金', '自选组合'];
  const timeFrames: TimeFrame[] = ['D', 'W', 'M'];
  const presetRanges: Exclude<DateRange, 'CUSTOM'>[] = ['1M', '3M', '6M', '1Y'];

  const marketBadge = (market: string) => {
    const classes: Record<string, string> = {
      US: 'bg-blue-100 text-blue-700',
      SH: 'bg-red-100 text-red-700',
      HK: 'bg-orange-100 text-orange-700',
    };
    return (
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none tracking-wide ${classes[market] || 'bg-gray-100 text-gray-600'}`}
      >
        {market}
      </span>
    );
  };

  const changeColor = (value: number) =>
    value >= 0 ? "text-up" : "text-down";

  const loadingRows = watchlist.map(symbol => {
    const meta = STOCK_METADATA[symbol];
    const name = meta?.name || symbol;
    const market = meta?.market || '';
    return (
      <tr key={`loading-${symbol}`} className="animate-pulse">
        <td className="px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              {market && marketBadge(market)}
              <div className="h-3 w-14 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
            </div>
            <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
          </div>
        </td>
        <td className="px-6 py-2">
          <div className="h-8 rounded w-full" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4">
          <div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-2">
          <div className="h-8 rounded w-full" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-2">
          <div className="h-8 rounded w-full" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-14 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-12 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-16 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-16 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-12 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} />
        </td>
        <td className="px-6 py-4" />
      </tr>
    );
  });

  return (
    <main className="min-h-screen bg-background pb-12 font-sans text-foreground">
      {/* Header / Navbar */}
      <nav className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1500px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-black tracking-tight text-text-primary">趋势分析</span>
            </div>

            <div className="hidden lg:flex items-center gap-8">
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative h-14 flex items-center text-[13px] font-bold transition-colors tracking-wide",
                    activeTab === tab ? "text-primary" : "text-text-secondary hover:text-foreground"
                  )}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="flex items-center bg-bg-input rounded-md px-3 py-1.5 gap-2 border border-transparent focus-within:border-primary focus-within:bg-card focus-within:shadow-sm transition-all">
                <Search className="w-3.5 h-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="搜索股票代码 (如 AAPL, 600519)..."
                  className="bg-transparent border-none text-xs w-64 outline-none placeholder:text-text-muted font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                />
              </div>
              {searchQuery && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded shadow-xl overflow-hidden z-[60]">
                  {Object.keys(STOCK_METADATA)
                    .filter(s => (s.includes(searchQuery) || STOCK_METADATA[s].name.includes(searchQuery)) && !watchlist.includes(s))
                    .map(symbol => (
                      <button
                        key={symbol}
                        onClick={() => handleAddStock(symbol)}
                        className="w-full px-4 py-2.5 text-left hover:bg-bg-hover flex items-center justify-between group border-b border-border-light last:border-0"
                      >
                        <div>
                          <div className="font-bold text-xs text-foreground">{symbol}</div>
                          <div className="text-[10px] text-text-muted font-medium">{STOCK_METADATA[symbol].name}</div>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-primary" />
                      </button>
                    ))}
                  {!Object.keys(STOCK_METADATA).some(s => s.includes(searchQuery)) && searchQuery.length >= 2 && (
                    <button
                      onClick={() => handleAddStock(searchQuery)}
                      className="w-full px-4 py-3 text-left hover:bg-bg-hover flex items-center justify-between group text-primary"
                    >
                      <div>
                        <div className="font-bold text-xs">添加新代码: {searchQuery}</div>
                        <div className="text-[10px] opacity-70 font-medium">点击尝试添加此股票</div>
                      </div>
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-[1500px] mx-auto px-6 mt-6">
        {/* Main Content Card */}
        <div className="bg-card rounded border border-border shadow-sm overflow-hidden">
          {/* Sub Header / Filters */}
          <div className="px-6 py-2.5 border-b border-border-light flex flex-col md:flex-row md:items-center justify-between bg-bg-subtle gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <button className="flex items-center gap-1 text-[13px] font-bold text-text-secondary hover:text-primary transition-colors">
                全部股票 <ChevronDown className="w-4 h-4" />
              </button>
              <div className="w-px h-3.5 bg-border hidden md:block" />

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-tighter">周期:</span>
                <div className="flex bg-bg-input p-0.5 rounded">
                  {timeFrames.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeFrame(tf)}
                      className={cn(
                        "px-3 py-1 rounded text-[11px] font-bold transition-all",
                        timeFrame === tf ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-foreground"
                      )}
                    >
                      {tf === 'D' ? '日' : tf === 'W' ? '周' : '月'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-3.5 bg-border hidden md:block" />

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-tighter">范围:</span>
                <div className="flex bg-bg-input p-0.5 rounded">
                  {presetRanges.map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={cn(
                        "px-3 py-1 rounded text-[11px] font-bold transition-all",
                        dateRange === range ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-foreground"
                      )}
                    >
                      {range}
                    </button>
                  ))}
                  <button
                    onClick={() => setDateRange('CUSTOM')}
                    className={cn(
                      "px-3 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1",
                      dateRange === 'CUSTOM' ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-foreground"
                    )}
                  >
                    <Calendar className="w-3 h-3" /> 自定义
                  </button>
                </div>
              </div>

              {dateRange === 'CUSTOM' && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 bg-card border border-border rounded-md px-2 py-0.5 shadow-sm"
                >
                  <DatePicker
                    selected={startDate}
                    onChange={(date: Date | null) => setStartDate(date)}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    dateFormat="yyyy-MM-dd"
                    className="text-[10px] font-bold text-text-secondary outline-none border-none bg-transparent w-20 cursor-pointer"
                    placeholderText="开始日期"
                  />
                  <span className="text-border">至</span>
                  <DatePicker
                    selected={endDate}
                    onChange={(date: Date | null) => setEndDate(date)}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    minDate={startDate || undefined}
                    dateFormat="yyyy-MM-dd"
                    className="text-[10px] font-bold text-text-secondary outline-none border-none bg-transparent w-20 cursor-pointer"
                    placeholderText="结束日期"
                  />
                </motion.div>
              )}
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4">
              <div className="flex items-center gap-3 text-[11px] font-bold text-text-tertiary">
                <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-up" /> 价格</div>
                <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-alpha" /> 强度(Alpha)</div>
              </div>
              <button onClick={handleRefresh} className="text-text-muted hover:text-primary transition-colors p-1" title="刷新数据">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1840px] table-fixed">
              <thead>
                <tr className="text-[11px] font-bold text-text-tertiary border-b border-border-light bg-card">
                  <th className="w-[180px] px-6 py-3 uppercase tracking-wider font-semibold">股票名称</th>
                  <th
                    className="w-[300px] px-6 py-3 uppercase tracking-wider font-semibold cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('totalReturn')}
                  >
                    <span className="flex items-center gap-1">
                      价格走势
                      <ArrowUpDown className={cn("w-3 h-3 transition-colors", sortBy === 'totalReturn' ? "text-primary" : "text-text-muted")} />
                    </span>
                  </th>
                  <th className="w-[140px] px-6 py-3 uppercase tracking-wider font-semibold text-alpha">行业基准</th>
                  <th className="w-[300px] px-6 py-3 uppercase tracking-wider font-semibold">行业趋势</th>
                  <th
                    className="w-[300px] px-6 py-3 uppercase tracking-wider font-semibold text-alpha cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('alphaReturn')}
                  >
                    <span className="flex items-center gap-1">
                      去除基准趋势
                      <ArrowUpDown className={cn("w-3 h-3 transition-colors", sortBy === 'alphaReturn' ? "text-alpha" : "opacity-40")} />
                    </span>
                  </th>
                  <th className="w-[100px] px-6 py-3 uppercase tracking-wider font-semibold text-right">当前价</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">涨跌幅</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">成交量</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">总市值</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">年初至今</th>
                  <th className="w-[80px] px-6 py-3 font-semibold text-center">操作</th>
                  <th className="w-[100px] px-6 py-3 uppercase tracking-wider font-semibold text-right">当前价</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">涨跌幅</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">成交量</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">总市值</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">年初至今</th>
                  <th className="w-[80px] px-6 py-3 font-semibold text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {!hydrated ? (
                  DEFAULT_WATCHLIST.map(symbol => {
                    const meta = STOCK_METADATA[symbol];
                    const market = meta?.market || '';
                    return (
                      <tr key={`ssr-${symbol}`} className="animate-pulse">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {market && marketBadge(market)}
                              <div className="h-3 w-14 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
                            </div>
                            <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
                          </div>
                        </td>
                        <td className="px-6 py-2"><div className="h-8 rounded w-full" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4"><div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-2"><div className="h-8 rounded w-full" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-2"><div className="h-8 rounded w-full" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4"><div className="h-4 w-14 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4"><div className="h-4 w-12 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4"><div className="h-4 w-16 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4"><div className="h-4 w-16 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4"><div className="h-4 w-12 rounded ml-auto" style={{ backgroundColor: 'var(--border-color)' }} /></td>
                        <td className="px-6 py-4" />
                      </tr>
                    );
                  })
                ) : (
                  <AnimatePresence mode='popLayout'>
                  {loading ? (
                    loadingRows
                  ) : (
                    sortedStocks.map((stock) => (
                      <motion.tr
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={stock.symbol}
                        className="group hover:bg-bg-hover transition-colors duration-150"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-text-primary text-sm group-hover:text-primary transition-colors cursor-pointer truncate">{stock.name}</span>
                            <div className="flex items-center gap-1.5">
                              {marketBadge(stock.market)}
                              <span className="text-[11px] text-text-tertiary font-mono font-medium tracking-tight">{stock.symbol}</span>
                            </div>
                            {stock.error && (
                              <span className="text-[9px] text-rose-500 font-bold mt-1 uppercase">
                                {retryInfo[stock.symbol] != null && retryInfo[stock.symbol] <= 10
                                  ? `重试中 ${retryInfo[stock.symbol]}/10`
                                  : 'API Error'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2">
                          <div className="h-10 flex items-center pr-4 gap-2">
                            {stock.history.length > 0 ? (
                              <>
                              <Sparkline
                                data={stock.history}
                                height={34}
                                showGradient={false}
                                color={stock.totalReturn >= 0 ? "#e22d3a" : "#00a846"}
                              />
                              <span className={cn("text-[11px] font-bold font-mono shrink-0", stock.totalReturn >= 0 ? "text-up" : "text-down")}>
                                {stock.totalReturn >= 0 ? '+' : ''}{stock.totalReturn.toFixed(2)}%
                              </span>
                              </>
                            ) : (
                              <div className="text-[10px] text-zinc-300 font-bold italic">No Price Data</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          {stock.industryBenchmark && stock.industryBenchmark.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-alpha truncate leading-tight">
                                {stock.industryBenchmarkName || customBenchmarks[stock.symbol] || '—'}
                              </span>
                              <span className="text-[9px] text-text-muted font-medium leading-tight">
                                {stock.industryBenchmark.length} 个交易日
                              </span>
                            </div>
                          ) : customBenchmarks[stock.symbol] ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-alpha truncate leading-tight">
                                {customBenchmarks[stock.symbol]}
                              </span>
                              <span className="text-[9px] text-text-muted font-medium leading-tight">
                                加载中...
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="输入基准代码"
                                value={stock.symbol in benchmarkInputs ? benchmarkInputs[stock.symbol] : (customBenchmarks[stock.symbol] || '')}
                                onChange={e => setBenchmarkInputs(prev => ({ ...prev, [stock.symbol]: e.target.value.toUpperCase() }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const currentVal = benchmarkInputs[stock.symbol] ?? customBenchmarks[stock.symbol] ?? '';
                                    if (currentVal !== '' || customBenchmarks[stock.symbol]) {
                                      handleSetBenchmark(stock.symbol, currentVal);
                                    }
                                  }
                                }}
                                className="w-full text-[10px] bg-bg-input border border-border rounded px-1.5 py-1 outline-none focus:border-primary font-bold text-text-secondary placeholder:text-text-muted/50"
                              />
                              {(stock.symbol in benchmarkInputs || customBenchmarks[stock.symbol]) && (
                                <button
                                  onClick={() => handleSetBenchmark(stock.symbol, benchmarkInputs[stock.symbol] ?? customBenchmarks[stock.symbol] ?? '')}
                                  className="text-primary shrink-0"
                                  title="确认基准"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-2">
                          <div className="h-10 flex items-center pr-4 gap-2">
                            {stock.benchmarkHistory && stock.benchmarkHistory.length > 0 ? (
                              <>
                              <Sparkline
                                data={stock.benchmarkHistory}
                                height={34}
                                showGradient={false}
                                color="#888888"
                              />
                              <span className={cn("text-[11px] font-bold font-mono shrink-0", stock.benchmarkReturn >= 0 ? "text-up" : "text-down")}>
                                {stock.benchmarkReturn >= 0 ? '+' : ''}{stock.benchmarkReturn.toFixed(2)}%
                              </span>
                              </>
                            ) : (
                              <div className="text-[10px] text-zinc-300 font-bold italic">N/A</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2 bg-indigo-50/10">
                          <div className="h-10 flex items-center pr-4 gap-2">
                            {stock.alphaHistory && stock.alphaHistory.length > 0 ? (
                              <>
                              <Sparkline
                                data={stock.alphaHistory}
                                height={34}
                                showGradient={false}
                                color="#6366f1"
                              />
                              <span className={cn("text-[11px] font-bold font-mono shrink-0", stock.alphaReturn >= 0 ? "text-up" : "text-down")}>
                                {stock.alphaReturn >= 0 ? '+' : ''}{stock.alphaReturn.toFixed(2)}%
                              </span>
                              </>
                            ) : (
                              <div className="text-[10px] text-zinc-300 font-bold italic">N/A</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-sm text-text-primary font-mono">{stock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td className={cn("px-6 py-4 text-right font-bold text-sm font-mono", changeColor(stock.changeAmount))}>
                          <div className="flex flex-col items-end leading-tight">
                            <span className="flex items-center gap-0.5">
                              {stock.changeAmount >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {Math.abs(stock.changeAmount).toFixed(2)}
                            </span>
                            <span className="text-[11px] opacity-90">{stock.changePercent >= 0 ? '+' : '-'}{Math.abs(stock.changePercent).toFixed(2)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-[13px] text-text-secondary font-medium">
                          {stock.volume}
                        </td>
                        <td className="px-6 py-4 text-right text-[13px] text-text-secondary font-medium">
                          {stock.marketCap}
                        </td>
                        <td className={cn("px-6 py-4 text-right font-bold text-[13px] font-mono", changeColor(stock.yearToDate))}>
                          {stock.yearToDate >= 0 ? '+' : ''}{stock.yearToDate.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button onClick={() => handleRemoveStock(stock.symbol)} className="text-text-muted hover:text-up transition-colors" title="移除"><X className="w-4 h-4" /></button>
                            <button className="text-text-muted hover:text-foreground transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend / Info */}
        <div className="mt-5 flex items-center gap-6 text-[11px] text-text-tertiary font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-up" /> 红色价格
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-alpha" /> 紫色 Alpha (超额强度)
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#888888' }} /> 灰色行业趋势
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1 opacity-60 text-right">
            <span>支持自定义日期回顾 · 实时行情由 Alpha Vantage / 东方财富 提供</span>
          </div>
        </div>
      </div>
    </main>
  );
}
