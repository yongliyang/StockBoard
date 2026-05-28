export type TimeFrame = 'D' | 'W' | 'M';

export interface PricePoint {
  date: string;
  price: number;
}

export interface StockData {
  symbol: string;
  name: string;
  industry: string;
  market: 'US' | 'SH' | 'SZ' | 'HK';
  currentPrice: number;
  changeAmount: number;
  changePercent: number;
  volume: string;
  marketCap: string;
  yearToDate: number;
  history: PricePoint[];
  industryHistory: PricePoint[];
  error?: string;
}

export const STOCK_METADATA: Record<string, { name: string; industry: string; basePrice: number; market: 'US' | 'SH' | 'SZ' | 'HK' }> = {
  'AAPL': { name: '苹果公司', industry: '科技', basePrice: 180, market: 'US' },
  'NVDA': { name: '英伟达', industry: '科技', basePrice: 700, market: 'US' },
  'MSFT': { name: '微软', industry: '科技', basePrice: 400, market: 'US' },
  'TSLA': { name: '特斯拉', industry: '汽车', basePrice: 180, market: 'US' },
  'GOOGL': { name: '谷歌', industry: '科技', basePrice: 150, market: 'US' },
  '600519': { name: '贵州茅台', industry: '消费', basePrice: 1700, market: 'SH' },
  '00700': { name: '腾讯控股', industry: '科技', basePrice: 300, market: 'HK' },
  'BILI': { name: '哔哩哔哩', industry: '互联网', basePrice: 15, market: 'US' },
};

/**
 * 获取股票数据
 */
export async function fetchStockData(symbol: string, timeFrame: TimeFrame): Promise<StockData> {
  const meta = STOCK_METADATA[symbol] || { name: symbol, industry: '未知', basePrice: 100, market: 'US' };
  
  let apiSymbol = symbol;
  if (meta.market === 'SH') apiSymbol = `${symbol}.SHH`;
  else if (meta.market === 'SZ') apiSymbol = `${symbol}.SHZ`;
  else if (meta.market === 'HK') apiSymbol = `${symbol}.HKG`;

  try {
    const intervalMap: Record<TimeFrame, string> = { 'D': 'daily', 'W': 'weekly', 'M': 'monthly' };
    const response = await fetch(`/api/stocks/history?symbol=${apiSymbol}&interval=${intervalMap[timeFrame]}`);
    
    if (!response.ok) throw new Error('API 请求失败');
    
    const data = await response.json();

    if (data.error || data.isDemo || !data.history || data.history.length === 0) {
      throw new Error(data.error || '未找到历史数据');
    }

    const history: PricePoint[] = data.history;
    const latestPrice = history[history.length - 1].price;
    const prevPrice = history[history.length - 2]?.price || latestPrice;
    const changeAmount = latestPrice - prevPrice;
    const changePercent = (changeAmount / (prevPrice || 1)) * 100;

    // 行业对比数据目前暂不提供（由于 API 限制）
    return {
      symbol,
      name: meta.name,
      industry: meta.industry,
      market: meta.market,
      currentPrice: latestPrice,
      changeAmount,
      changePercent,
      volume: data.volume || '--',
      marketCap: data.marketCap || '--',
      yearToDate: data.ytd || 0,
      history,
      industryHistory: [], // 移除模拟行业数据
    };

  } catch (error: any) {
    console.error(`[API Error] ${symbol}:`, error.message);
    return {
      symbol,
      name: meta.name,
      industry: meta.industry,
      market: meta.market,
      currentPrice: 0,
      changeAmount: 0,
      changePercent: 0,
      volume: '--',
      marketCap: '--',
      yearToDate: 0,
      history: [],
      industryHistory: [],
      error: error.message || '获取数据失败',
    };
  }
}
