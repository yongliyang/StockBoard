import { NextResponse } from 'next/server';

const AV_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

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

  // 1. Alpha Vantage (US 股票/ETF + 部分国际股票)
  if (AV_API_KEY && AV_API_KEY !== 'demo') {
    try {
      const avResult = await fetchAlphaVantage(symbol, interval, AV_API_KEY);
      if (avResult) {
        cache.set(cacheKey, { data: avResult, timestamp: Date.now() });
        return NextResponse.json(avResult);
      }
    } catch (e) {
      console.warn(`Alpha Vantage 失败: ${symbol}`);
    }
  }

  // 2. stock-sdk fallback (A股指数/港股指数)
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

  // 3. EODHD Demo (仅 US)
  try {
    const publicResult = await fetchPublicEODHD(symbol, interval);
    if (publicResult) {
      cache.set(cacheKey, { data: publicResult, timestamp: Date.now() });
      return NextResponse.json(publicResult);
    }
  } catch (e) {
    console.warn('公开 API 失败');
  }

  // 4. 最终失败
  return NextResponse.json({
    error: '无法获取真实市场数据，请检查 API 配置或稍后再试。',
    history: []
  }, { status: 200 });
}

async function fetchAlphaVantage(symbol: string, interval: string, apiKey: string) {
  const functionName = interval === 'monthly' ? 'TIME_SERIES_MONTHLY' : interval === 'weekly' ? 'TIME_SERIES_WEEKLY' : 'TIME_SERIES_DAILY';
  const url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${symbol}&apikey=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data['Note']) throw new Error('API 频率限制');

  const timeSeriesKey = interval === 'daily' ? 'Time Series (Daily)' : interval === 'weekly' ? 'Weekly Time Series' : 'Monthly Time Series';
  const timeSeries = data[timeSeriesKey];

  if (!timeSeries) return null;

  const history = Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
    date,
    price: parseFloat(values['4. close']),
  })).reverse();

  return {
    symbol,
    history,
    volume: (parseFloat(Object.values(timeSeries)[0] as any['5. volume']) / 10000).toFixed(2) + '万股',
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

async function fetchPublicEODHD(symbol: string, interval: string) {
  const url = `https://eodhd.com/api/eod/${symbol}.US?api_token=demo&fmt=json`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    symbol,
    history: data.map((item: any) => ({
      date: item.date,
      price: item.close,
    })),
    volume: (data[data.length - 1].volume / 10000).toFixed(2) + '万股',
  };
}
