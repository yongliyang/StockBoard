import { NextResponse } from 'next/server';
import { getBenchmarkConfig, getCustomBenchmarkConfig } from '@/lib/industryMapping';
import { STOCK_METADATA } from '@/lib/mockData';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || '';
  const interval = searchParams.get('interval') || 'daily';
  const benchmarkSymbol = searchParams.get('benchmark') || '';

  if (!symbol) {
    return NextResponse.json({ error: '缺少 symbol 参数', history: [] });
  }

  const cacheKey = `${symbol}-${interval}-${benchmarkSymbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // 自定义基准：直接用传入的 benchmarkSymbol 获取数据
  if (benchmarkSymbol) {
    const config = getCustomBenchmarkConfig(benchmarkSymbol);
    try {
      const result = await fetchViaFinnhub(config.symbol, interval);
      if (result && result.history && result.history.length > 0) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return NextResponse.json(result);
      }
      return NextResponse.json({ error: `无法获取 ${config.name} 的行情数据`, history: [] });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || '获取行业基准数据失败', history: [] });
    }
  }

  const config = getBenchmarkConfig(symbol);
  if (!config) {
    const meta = STOCK_METADATA[symbol];
    const reason = meta
      ? `${meta.market} 市场「${meta.industry}」行业尚未配置基准`
      : `未知股票 ${symbol}`;
    return NextResponse.json({ error: reason, history: [] });
  }

  try {
    let result: { history: Array<{ date: string; price: number }> } | null = null;

    if (config.source === 'finnhub') {
      result = await fetchViaFinnhub(config.symbol, interval);
    } else if (config.source === 'stock-sdk') {
      result = await fetchViaStockSDK(config.symbol, interval);
    }

    if (!result || !result.history || result.history.length === 0) {
      return NextResponse.json({ error: `无法获取 ${config.name} 的行情数据`, history: [] });
    }

    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error(`[Industry Benchmark Error] ${symbol}:`, e.message);
    return NextResponse.json({ error: e.message || '获取行业基准数据失败', history: [] });
  }
}

/**
 * 通过 Finnhub API 获取 K 线数据
 */
async function fetchViaFinnhub(symbol: string, interval: string) {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key 未配置');
  }

  const resolutionMap: Record<string, string> = {
    daily: 'D',
    weekly: 'W',
    monthly: 'M',
  };
  const resolution = resolutionMap[interval] || 'D';

  const now = Math.floor(Date.now() / 1000);
  const daysMap: Record<string, number> = { daily: 730, weekly: 1825, monthly: 3650 };
  const from = now - (daysMap[interval] || 730) * 86400;

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Finnhub 请求失败: ${response.status}`);

  const data = await response.json();

  if (data.s !== 'ok' || !Array.isArray(data.c) || data.c.length === 0) {
    return null;
  }

  const history = data.t.map((timestamp: number, i: number) => ({
    date: new Date(timestamp * 1000).toISOString().split('T')[0],
    price: data.c[i],
  }));

  history.sort((a: any, b: any) => a.date.localeCompare(b.date));

  return { history };
}

async function fetchViaStockSDK(boardCode: string, interval: string) {
  // stock-sdk is ESM-only; use dynamic import
  const { StockSDK } = await import('stock-sdk');
  const sdk = new StockSDK();

  const periodMap: Record<string, 'daily' | 'weekly' | 'monthly'> = {
    daily: 'daily',
    weekly: 'weekly',
    monthly: 'monthly',
  };
  const period = periodMap[interval] || 'daily';

  // 获取最近 2 年的数据以确保充足历史
  const kline = await sdk.getIndustryKline(boardCode, { period, count: 520 } as any);

  if (!Array.isArray(kline) || kline.length === 0) return null;

  const history = kline.map((item: any) => ({
    date: item.date,
    price: item.close,
  }));

  return { history };
}
