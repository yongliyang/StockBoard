# StockBoard - 框架信息

## 项目概述

多股趋势对比看板，支持股票价格趋势、行业基准对比、Alpha（超额收益）分析。

---

## 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Next.js | 16.2.6 | React 框架 (App Router) |
| React | 19.2.6 | UI 库 |
| TypeScript | 6.x | 类型检查 |
| Tailwind CSS | 3.4.19 | 样式框架 |
| Recharts | 3.x | 价格走势迷你图 |
| Framer Motion | 12.x | 表格行动画 |
| Lucide React | 1.x | 图标 |
| date-fns | 4.x | 日期处理 |
| react-datepicker | 9.x | 自定义日期选择 |
| stock-sdk | 1.x | A股/港股数据源 |
| clsx + tailwind-merge | - | className 合并工具（`cn()`） |

## 目录结构

```
src/
├── app/
│   ├── globals.css              # 全局样式 + CSS 变量主题
│   ├── layout.tsx               # 根布局（服务端组件）
│   ├── page.tsx                 # 主看板（客户端组件，~800 行）
│   └── api/stocks/
│       ├── history/route.ts     # 股价历史 API（3 层回退）
│       └── industry/route.ts    # 行业基准 API
├── components/
│   └── Sparkline.tsx            # 迷你趋势图组件（Recharts AreaChart）
└── lib/
    ├── mockData.ts              # 数据获取层 + STOCK_METADATA
    └── industryMapping.ts       # 行业→基准 ETF/板块 映射
```

## 数据流

```
page.tsx
  ├── fetchStockData(symbol, tf)           → GET /api/stocks/history
  │                                             ├─ Alpha Vantage (美股)
  │                                             ├─ stock-sdk (A股/港股)
  │                                             └─ EODHD demo (US fallback)
  ├── fetchIndustryBenchmark(symbol, tf)   → GET /api/stocks/industry
  │                                             ├─ alpha-vantage (US ETF)
  │                                             └─ stock-sdk (A股板块K线)
  └── processedStocks useMemo               → 百分比归一化 + Alpha 计算
```

## API 路由

### `/api/stocks/history`
- 参数: `symbol`, `interval`(daily/weekly/monthly), `market`, `originalSymbol`
- 回退链: Alpha Vantage → stock-sdk → EODHD → 错误
- 缓存: 内存 Map, TTL 1 小时

### `/api/stocks/industry`
- 参数: `symbol`, `interval`, `benchmark`(可选自定义代码)
- 数据源由 `industryMapping.ts` 中的 `BENCHMARK_MAP` 决定
- 缓存: 内存 Map, TTL 1 小时

## Alpha 计算逻辑

在 page.tsx `processedStocks` useMemo 中:
```
alpha[i] = (stockPrice[i] / firstStockPrice - 1) - (benchPrice[i] / firstBenchPrice - 1)
```
结果乘以 100 转为百分点。

所有趋势图均以**累计收益率百分比**显示（非原始价格），使涨幅大小可视觉比较。

## 关键特性

- **日内缓存**: `dataCache` ref 键为 `${symbol}-${timeFrame}`, 日期匹配今日则跳过 API
- **指数退避重试**: 失败股票自动重试, 2s→4s→8s→16s→32s→60s, 最多 10 次
- **持久化**: 自选股 (`stockboard-watchlist`), 自定义基准 (`stockboard-custom-benchmarks`) 存 localStorage
- **Hydration 安全**: 使用 `hydrated` 状态 + `DEFAULT_WATCHLIST` 常量避免 SSR/客户端不一致

## 环境变量

```
ALPHA_VANTAGE_API_KEY=8XGSSXAJCRLH7MYG   # 演示密钥, 5次/分钟限制
```

## 表格列布局 (11 列, min-width: 1840px)

| 列 | 宽度 | 说明 |
|---|---|---|
| 股票名称 | 180px | 名称 + 市场tag(蓝/红/橙) |
| 价格走势 | 300px | 累计收益率% sparkline + 数值 |
| 行业基准 | 140px | 基准名称 / 自定义代码输入框 |
| 行业趋势 | 300px | 基准累计收益率% sparkline + 数值 |
| 去除基准趋势 | 300px | Alpha% sparkline + 数值 |
| 当前价 | 100px | |
| 涨跌幅 | 110px | |
| 成交量 | 110px | |
| 总市值 | 110px | |
| 年初至今 | 110px | |
| 操作 | 80px | 移除按钮 |

## STOCK_METADATA 预置股票

| 代码 | 市场 | 行业 |
|---|---|---|
| AAPL, NVDA, MSFT, GOOGL, QCOM | US | 科技 |
| TSLA | US | 汽车 |
| BILI, CPNG | US | 互联网 |
| 600519 | SH | 消费 |
| 00700 | HK | 科技 |
| QQQ, SMH | US | 指数 |
| EWH | US | 指数(香港) |
| 000001 | SH | 指数(上证) |

## 行业基准映射

美股: 行业 ETF (XLK, XLY, FDN, XLP, XLF, XLV, XLE) via Alpha Vantage
A股: 板块 K 线代码 (BK1575 白酒, BK1553 计算机设备等) via stock-sdk
港股: 美股 ETF proxy (XLK 科技, XLF 金融) via Alpha Vantage

## CSS 主题

浅色主题, 通过 CSS 自定义属性 + tailwind.config.js 映射:
- `--primary: #2b72ff` (蓝色主色)
- `--up-color: #e22d3a` (红色涨)
- `--down-color: #00a846` (绿色跌)
- `--alpha-color: #6366f1` (紫色 Alpha)
- 文本层级: primary/secondary/tertiary/muted

Tailwind 标准色板 (blue-100, red-700, zinc-300 等) 可用。

## 常见操作

- 添加股票: 搜索框输入代码, 点击搜索结果或直接添加新代码
- 移除股票: 悬停行 → 点击 X 按钮
- 设置自定义基准: 在行业基准列输入 ETF 代码 → 回车
- 刷新数据: 点击刷新按钮 (清除日内缓存后重新获取)
- 添加新股票到 STOCK_METADATA: 编辑 `src/lib/mockData.ts` 中的 `STOCK_METADATA` 对象, 指定 symbol/name/industry/basePrice/market
