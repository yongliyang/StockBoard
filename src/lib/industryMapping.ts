import { STOCK_METADATA } from './mockData';

export interface BenchmarkConfig {
  /** 数据源类型 */
  source: 'alpha-vantage' | 'stock-sdk';
  /** ETF 代码 (alpha-vantage 用) 或 板块代码 (stock-sdk 用) */
  symbol: string;
  /** 基准名称（显示用） */
  name: string;
}

/**
 * 行业 → 基准指数/ETF 映射表
 *
 * 美股用行业 ETF 作为 proxy，A 股用 stock-sdk 的行业板块 K 线。
 * 港股科技暂时用 XLK 作为 proxy。
 */
const BENCHMARK_MAP: Record<string, Record<string, BenchmarkConfig>> = {
  US: {
    '科技': { source: 'alpha-vantage', symbol: 'XLK', name: '科技行业 ETF (XLK)' },
    '汽车': { source: 'alpha-vantage', symbol: 'XLY', name: '可选消费 ETF (XLY)' },
    '互联网': { source: 'alpha-vantage', symbol: 'FDN', name: '互联网指数 ETF (FDN)' },
    '消费': { source: 'alpha-vantage', symbol: 'XLP', name: '必需消费 ETF (XLP)' },
    '金融': { source: 'alpha-vantage', symbol: 'XLF', name: '金融行业 ETF (XLF)' },
    '医药': { source: 'alpha-vantage', symbol: 'XLV', name: '医疗行业 ETF (XLV)' },
    '能源': { source: 'alpha-vantage', symbol: 'XLE', name: '能源行业 ETF (XLE)' },
  },
  SH: {
    '消费': { source: 'stock-sdk', symbol: 'BK1575', name: '白酒Ⅲ板块' },
    '科技': { source: 'stock-sdk', symbol: 'BK1553', name: '计算机设备板块' },
    '金融': { source: 'stock-sdk', symbol: 'BK0475', name: '银行板块' },
    '医药': { source: 'stock-sdk', symbol: 'BK0467', name: '医药商业板块' },
  },
  SZ: {
    '消费': { source: 'stock-sdk', symbol: 'BK1575', name: '白酒Ⅲ板块' },
    '科技': { source: 'stock-sdk', symbol: 'BK1553', name: '计算机设备板块' },
  },
  HK: {
    '科技': { source: 'alpha-vantage', symbol: 'XLK', name: '科技行业 ETF (XLK)' },
    '金融': { source: 'alpha-vantage', symbol: 'XLF', name: '金融行业 ETF (XLF)' },
  },
};

/**
 * 获取指定股票的行业基准配置
 */
export function getBenchmarkConfig(symbol: string): BenchmarkConfig | null {
  const meta = STOCK_METADATA[symbol];
  if (!meta) return null;

  const marketMap = BENCHMARK_MAP[meta.market];
  if (!marketMap) return null;

  return marketMap[meta.industry] || null;
}

/**
 * 获取所有已配置的 (market, industry) 对
 */
export function getCustomBenchmarkConfig(benchmarkSymbol: string): BenchmarkConfig {
  return {
    source: 'alpha-vantage',
    symbol: benchmarkSymbol.toUpperCase(),
    name: benchmarkSymbol.toUpperCase(),
  };
}

/**
 * 获取所有已配置的 (market, industry) 对
 */
export function getConfiguredIndustries(): Array<{ market: string; industry: string }> {
  const result: Array<{ market: string; industry: string }> = [];
  for (const [market, industries] of Object.entries(BENCHMARK_MAP)) {
    for (const industry of Object.keys(industries)) {
      result.push({ market, industry });
    }
  }
  return result;
}
