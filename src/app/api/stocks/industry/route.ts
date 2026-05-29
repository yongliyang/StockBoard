import { NextResponse } from 'next/server';
import { getBenchmarkConfig, getCustomBenchmarkConfig } from '@/lib/industryMapping';
import { STOCK_METADATA } from '@/lib/mockData';

const AV_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

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

  // 自定义基准：直接用传入的 symbol 获取数据
  if (benchmarkSymbol) {
    const config = getCustomBenchmarkConfig(benchmarkSymbol);
    try {
      const result = await fetchViaAlphaVantage(config.symbol, interval);
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

    if (config.source === 'alpha-vantage') {
      result = await fetchViaAlphaVantage(config.symbol, interval);
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

async function fetchViaAlphaVantage(symbol: string, interval: string) {
  if (!AV_API_KEY || AV_API_KEY === 'demo') {
    throw new Error('Alpha Vantage API key 未配置');
  }

  const functionName = interval === 'monthly'
    ? 'TIME_SERIES_MONTHLY'
    : interval === 'weekly'
      ? 'TIME_SERIES_WEEKLY'
      : 'TIME_SERIES_DAILY';

  const url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${symbol}&apikey=${AV_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data['Note']) throw new Error('Alpha Vantage API 频率限制');
  if (data['Error Message']) throw new Error(data['Error Message']);

  const timeSeriesKey = interval === 'daily'
    ? 'Time Series (Daily)'
    : interval === 'weekly'
      ? 'Weekly Time Series'
      : 'Monthly Time Series';

  const timeSeries = data[timeSeriesKey];
  if (!timeSeries) return null;

  const history = Object.entries(timeSeries)
    .map(([date, values]: [string, any]) => ({
      date,
      price: parseFloat(values['4. close']),
    }))
    .reverse();

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
