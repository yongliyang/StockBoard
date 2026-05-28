"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { fetchStockData, TimeFrame, StockData, STOCK_METADATA } from '@/lib/mockData';
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

type DateRange = '1M' | '3M' | '6M' | '1Y' | 'CUSTOM';

export default function Home() {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('D');
  const [dateRange, setDateRange] = useState<DateRange>('3M');
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(['AAPL', 'NVDA', '600519', '00700', 'TSLA', 'BILI']);
  const [activeTab, setActiveTab] = useState('自选股票');

  // 自定义日期状态
  const [startDate, setStartDate] = useState<Date | null>(subMonths(startOfToday(), 3));
  const [endDate, setEndDate] = useState<Date | null>(startOfToday());

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const data = await Promise.all(
        watchlist.map(symbol => fetchStockData(symbol, timeFrame))
      );
      setStocks(data);
      setLoading(false);
    }
    loadData();
  }, [timeFrame, watchlist]);

  const processedStocks = useMemo(() => {
    return stocks.map(stock => {
      let history = [...stock.history];
      let industryHistory = [...stock.industryHistory];

      if (dateRange === 'CUSTOM' && startDate && endDate) {
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');
        // 根据自定义日期过滤
        history = stock.history.filter(p => p.date >= startStr && p.date <= endStr);
        const startIndex = stock.history.findIndex(p => p.date >= startStr);
        const endIndex = stock.history.findLastIndex(p => p.date <= endStr);
        if (startIndex !== -1 && endIndex !== -1) {
          industryHistory = stock.industryHistory.slice(startIndex, endIndex + 1);
        }
      } else if (dateRange !== 'CUSTOM') {
        const rangeMap: Record<Exclude<DateRange, 'CUSTOM'>, number> = {
          '1M': 22,
          '3M': 66,
          '6M': 132,
          '1Y': 260
        };
        const pointsToTake = rangeMap[dateRange];
        history = stock.history.slice(-pointsToTake);
        industryHistory = stock.industryHistory.slice(-pointsToTake);
      }

      // 如果过滤后没数据，回退到全部
      if (history.length === 0) history = stock.history.slice(-66);

      // 计算 Alpha 趋势线
      const firstPrice = history[0]?.price || 1;
      const firstIndustryPrice = industryHistory[0]?.price || 1;

      const alphaHistory = history.map((point, i) => {
        const stockReturn = (point.price - firstPrice) / firstPrice;
        const industryReturn = ((industryHistory[i]?.price || firstIndustryPrice) - firstIndustryPrice) / firstIndustryPrice;
        return {
          ...point,
          price: (stockReturn - industryReturn) * 100,
        };
      });

      return { ...stock, history, alphaHistory };
    });
  }, [stocks, dateRange, startDate, endDate]);

  const handleAddStock = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
    setSearchQuery('');
  };

  const handleRemoveStock = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  return (
    <main className="min-h-screen bg-[#f4f5f7] pb-12 font-sans text-[#333]">
      {/* Header / Navbar */}
      <nav className="bg-white border-b border-[#eee] sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1500px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#2b72ff] rounded flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-black tracking-tight text-[#222]">雪球分析</span>
            </div>
            
            <div className="hidden lg:flex items-center gap-8">
              {['自选股票', '自选基金', '自选组合'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative h-14 flex items-center text-[13px] font-bold transition-colors tracking-wide",
                    activeTab === tab ? "text-[#2b72ff]" : "text-[#666] hover:text-[#333]"
                  )}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#2b72ff] rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="flex items-center bg-[#f0f1f3] rounded-md px-3 py-1.5 gap-2 border border-transparent focus-within:border-[#2b72ff] focus-within:bg-white focus-within:shadow-sm transition-all">
                <Search className="w-3.5 h-3.5 text-[#999]" />
                <input 
                  type="text" 
                  placeholder="搜索股票代码 (如 AAPL, 600519)..."
                  className="bg-transparent border-none text-xs w-64 outline-none placeholder:text-[#999] font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                />
              </div>
              {searchQuery && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-[#eee] rounded shadow-xl overflow-hidden z-[60]">
                  {Object.keys(STOCK_METADATA)
                    .filter(s => (s.includes(searchQuery) || STOCK_METADATA[s].name.includes(searchQuery)) && !watchlist.includes(s))
                    .map(symbol => (
                      <button
                        key={symbol}
                        onClick={() => handleAddStock(symbol)}
                        className="w-full px-4 py-2.5 text-left hover:bg-[#f8f9fa] flex items-center justify-between group border-b border-[#f0f0f0] last:border-0"
                      >
                        <div>
                          <div className="font-bold text-xs text-[#333]">{symbol}</div>
                          <div className="text-[10px] text-[#999] font-medium">{STOCK_METADATA[symbol].name}</div>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-[#2b72ff]" />
                      </button>
                    ))}
                  {/* 如果找不到预定义的股票，允许直接添加该代码 */}
                  {!Object.keys(STOCK_METADATA).some(s => s.includes(searchQuery)) && searchQuery.length >= 2 && (
                    <button
                      onClick={() => handleAddStock(searchQuery)}
                      className="w-full px-4 py-3 text-left hover:bg-[#f8f9fa] flex items-center justify-between group text-[#2b72ff]"
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
        <div className="bg-white rounded border border-[#eee] shadow-sm overflow-hidden">
          {/* Sub Header / Filters */}
          <div className="px-6 py-2.5 border-b border-[#f0f0f0] flex flex-col md:flex-row md:items-center justify-between bg-[#fafafa] gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <button className="flex items-center gap-1 text-[13px] font-bold text-[#444] hover:text-[#2b72ff] transition-colors">
                全部股票 <ChevronDown className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-3.5 bg-[#ddd] hidden md:block" />
              
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#888] uppercase tracking-tighter">周期:</span>
                <div className="flex bg-[#f0f1f3] p-0.5 rounded">
                  {(['D', 'W', 'M'] as TimeFrame[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeFrame(tf)}
                      className={cn(
                        "px-3 py-1 rounded text-[11px] font-bold transition-all",
                        timeFrame === tf ? "bg-white text-[#2b72ff] shadow-sm" : "text-[#666] hover:text-[#333]"
                      )}
                    >
                      {tf === 'D' ? '日' : tf === 'W' ? '周' : '月'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-[1px] h-3.5 bg-[#ddd] hidden md:block" />

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#888] uppercase tracking-tighter">范围:</span>
                <div className="flex bg-[#f0f1f3] p-0.5 rounded">
                  {(['1M', '3M', '6M', '1Y'] as Exclude<DateRange, 'CUSTOM'>[]).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={cn(
                        "px-3 py-1 rounded text-[11px] font-bold transition-all",
                        dateRange === range ? "bg-white text-[#2b72ff] shadow-sm" : "text-[#666] hover:text-[#333]"
                      )}
                    >
                      {range}
                    </button>
                  ))}
                  <button
                    onClick={() => setDateRange('CUSTOM')}
                    className={cn(
                      "px-3 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1",
                      dateRange === 'CUSTOM' ? "bg-white text-[#2b72ff] shadow-sm" : "text-[#666] hover:text-[#333]"
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
                  className="flex items-center gap-2 bg-white border border-[#ddd] rounded-md px-2 py-0.5 shadow-sm"
                >
                  <DatePicker
                    selected={startDate}
                    onChange={(date: Date | null) => setStartDate(date)}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    dateFormat="yyyy-MM-dd"
                    className="text-[10px] font-bold text-[#666] outline-none border-none bg-transparent w-20 cursor-pointer"
                    placeholderText="开始日期"
                  />
                  <span className="text-[#ddd]">至</span>
                  <DatePicker
                    selected={endDate}
                    onChange={(date: Date | null) => setEndDate(date)}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    minDate={startDate || undefined}
                    dateFormat="yyyy-MM-dd"
                    className="text-[10px] font-bold text-[#666] outline-none border-none bg-transparent w-20 cursor-pointer"
                    placeholderText="结束日期"
                  />
                </motion.div>
              )}
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4">
              <div className="flex items-center gap-3 text-[11px] font-bold text-[#888]">
                <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-[#e22d3a]" /> 价格</div>
                <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-[#6366f1]" /> 强度(Alpha)</div>
              </div>
              <button className="text-[#999] hover:text-[#2b72ff] transition-colors p-1" title="刷新数据">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1300px] table-fixed">
              <thead>
                <tr className="text-[11px] font-bold text-[#888] border-b border-[#f0f0f0] bg-white">
                  <th className="w-[180px] px-6 py-3 uppercase tracking-wider font-semibold">股票名称</th>
                  <th className="w-[280px] px-6 py-3 uppercase tracking-wider font-semibold">价格走势</th>
                  <th className="w-[280px] px-6 py-3 uppercase tracking-wider font-semibold text-[#6366f1]">Alpha 强度 (除行业影响)</th>
                  <th className="w-[100px] px-6 py-3 uppercase tracking-wider font-semibold text-right">当前价</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">涨跌幅</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">成交量</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">总市值</th>
                  <th className="w-[110px] px-6 py-3 uppercase tracking-wider font-semibold text-right">年初至今</th>
                  <th className="w-[80px] px-6 py-3 font-semibold text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                <AnimatePresence mode='popLayout'>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`skeleton-${i}`} className="animate-pulse">
                        <td colSpan={9} className="px-6 py-6">
                          <div className="h-4 bg-[#f4f5f7] rounded w-full opacity-50" />
                        </td>
                      </tr>
                    ))
                  ) : (
                    processedStocks.map((stock) => (
                      <motion.tr
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={stock.symbol}
                        className="group hover:bg-[#f9fafc] transition-all duration-200"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-[#222] text-[14px] group-hover:text-[#2b72ff] transition-colors cursor-pointer truncate">{stock.name}</span>
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-[9px] font-black px-1 py-0.5 rounded leading-none uppercase",
                                stock.market === 'US' ? "bg-blue-50 text-blue-600" : 
                                stock.market === 'SH' ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
                              )}>{stock.market}</span>
                              <span className="text-[11px] text-[#888] font-mono font-medium tracking-tight">{stock.symbol}</span>
                            </div>
                            {stock.error && (
                              <span className="text-[9px] text-rose-500 font-bold mt-1 uppercase">API Error</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2">
                          <div className="h-10 flex items-center pr-4">
                            {stock.history.length > 0 ? (
                              <Sparkline 
                                data={stock.history} 
                                height={34}
                                showGradient={false}
                                color={stock.changePercent >= 0 ? "#e22d3a" : "#00a846"} 
                              />
                            ) : (
                              <div className="text-[10px] text-zinc-300 font-bold italic">No Price Data</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2 bg-indigo-50/10">
                          <div className="h-10 flex items-center pr-4">
                            {stock.alphaHistory && stock.alphaHistory.length > 0 ? (
                              <Sparkline 
                                data={stock.alphaHistory} 
                                height={34}
                                showGradient={false}
                                color="#6366f1" 
                              />
                            ) : (
                              <div className="text-[10px] text-zinc-300 font-bold italic">N/A</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-[14px] text-[#222] font-mono">{stock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-bold text-[14px] font-mono",
                          stock.changeAmount >= 0 ? "text-[#e22d3a]" : "text-[#00a846]"
                        )}>
                          <div className="flex flex-col items-end leading-tight">
                            <span className="flex items-center gap-0.5">
                              {stock.changeAmount >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {Math.abs(stock.changeAmount).toFixed(2)}
                            </span>
                            <span className="text-[11px] opacity-90">{stock.changePercent >= 0 ? '+' : '-'}{Math.abs(stock.changePercent).toFixed(2)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-[13px] text-[#444] font-medium">
                          {stock.volume}
                        </td>
                        <td className="px-6 py-4 text-right text-[13px] text-[#444] font-medium">
                          {stock.marketCap}
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-bold text-[13px] font-mono",
                          stock.yearToDate >= 0 ? "text-[#e22d3a]" : "text-[#00a846]"
                        )}>
                          {stock.yearToDate >= 0 ? '+' : ''}{stock.yearToDate.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                            <button onClick={() => handleRemoveStock(stock.symbol)} className="text-[#aaa] hover:text-[#e22d3a] transition-colors" title="移除"><X className="w-4 h-4" /></button>
                            <button className="text-[#aaa] hover:text-[#333] transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend / Info */}
        <div className="mt-5 flex items-center gap-6 text-[11px] text-[#888] font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-[#e22d3a]" /> 红色价格
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-[#6366f1]" /> 紫色 Alpha (超额强度)
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1 opacity-60 text-right">
            <span>支持自定义日期回顾 · 实时行情由 Alpha Vantage / EODHD 提供</span>
          </div>
        </div>
      </div>
    </main>
  );
}
