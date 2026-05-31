import { NextResponse } from 'next/server';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'AAPL';
  const interval = searchParams.get('interval') || 'daily';
  const market = searchParams.get('market') || '';
  const originalSymbol = searchParams.get('originalSymbol') || '';

  const cacheKey = `${symbol}-${interval}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // 1. Finnhub (全球股票/ETF)
  if (FINNHUB_API_KEY) {
    try {
      const result = await fetchViaFinnhub(symbol, interval);
      if (result) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return NextResponse.json(result);
      }
    } catch (e) {
      console.warn(`Finnhub 失败: ${symbol}`);
    }
  }

  // 2. stock-sdk fallback (A股/港股)
  if (market === 'SH' || market === 'SZ' || market === 'HK') {
    try {
      const sdkResult = await fetchViaStockSDK(originalSymbol || symbol, interval, market);
      if (sdkResult) {
        cache.set(cacheKey, { data: sdkResult, timestamp: Date.now() });
        return NextResponse.json(sdkResult);
      }
    } catch (e) {
      console.warn(`stock-sdk 失败: ${symbol}`);
    }
  }

  // 3. 最终失败
  return NextResponse.json({
    error: '无法获取真实市场数据，请检查 API 配置或稍后再试。',
    history: []
  }, { status: 200 });
}

/**
 * 通过 Finnhub API 获取股票 K 线数据
 * Finnhub 免费版 60 次/分钟，延迟约 15 分钟
 */
async function fetchViaFinnhub(symbol: string, interval: string) {
  const resolutionMap: Record<string, string> = {
    daily: 'D',
    weekly: 'W',
    monthly: 'M',
  };
  const resolution = resolutionMap[interval] || 'D';

  // 计算时间范围，确保拿到足够的历史数据
  const now = Math.floor(Date.now() / 1000);
  const daysMap: Record<string, number> = { daily: 730, weekly: 1825, monthly: 3650 };
  const from = now - (daysMap[interval] || 730) * 86400;

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();

  // s === "ok" 表示成功；s === "no_data" 表示无数据
  if (data.s !== 'ok' || !Array.isArray(data.c) || data.c.length === 0) {
    return null;
  }

  const history = data.t.map((timestamp: number, i: number) => ({
    date: new Date(timestamp * 1000).toISOString().split('T')[0],
    price: data.c[i],
  }));

  // 按日期升序排列
  history.sort((a: any, b: any) => a.date.localeCompare(b.date));

  return {
    symbol,
    history,
    volume: (data.v[data.v.length - 1] / 10000).toFixed(2) + '万股',
  };
}

async function fetchViaStockSDK(symbol: string, interval: string, market: string) {
  const { StockSDK } = await import('stock-sdk');
  const sdk = new StockSDK();

  const periodMap: Record<string, 'daily' | 'weekly' | 'monthly'> = {
    daily: 'daily',
    weekly: 'weekly',
    monthly: 'monthly',
  };
  const period = periodMap[interval] || 'daily';

  if (market === 'HK') {
    const kline = await sdk.getHKHistoryKline(symbol, { period, count: 520 } as any);
    if (!Array.isArray(kline) || kline.length === 0) return null;
    return {
      history: kline.map((item: any) => ({ date: item.date, price: item.close })),
      volume: '--',
    };
  }

  // SH / SZ: use A-share history K-line with exchange prefix
  const prefix = market === 'SH' ? 'sh' : 'sz';
  const kline = await sdk.getHistoryKline(`${prefix}${symbol}`, { period, count: 520 } as any);
  if (!Array.isArray(kline) || kline.length === 0) return null;
  return {
    history: kline.map((item: any) => ({ date: item.date, price: item.close })),
    volume: '--',
  };
}
