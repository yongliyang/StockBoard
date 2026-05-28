# StockBoard - 多周期股票趋势与 Alpha 强度分析看板

StockBoard 是一款基于 Next.js 开发的专业级自选股监控工具。它参考了雪球（Xueqiu）的 UI 风格，旨在通过简洁的高信息密度表格，让投资者一目了然地对比多只股票的长期价格趋势，并能通过独有的 Alpha 强度分析识别出强于大盘的强势股。

## 🌟 核心特性

- **雪球风格 UI**: 经典的红涨绿跌配色，清爽的浅色卡片化布局，极致的阅读体验。
- **多维度趋势对比**: 
  - **价格走势列**: 展示选定周期内的真实收盘价波动。
  - **Alpha 强度列**: 自动扣除行业/大盘背景影响，展示个股相对于基准的纯净表现（超额收益）。
- **灵活的周期与区间**: 
  - 支持 **日线/周线/月线** 切换。
  - 支持 **1M/3M/6M/1Y** 快捷区间及**自定义日历**日期回顾。
- **真实数据驱动**: 深度对接 Alpha Vantage 与 EODHD 公开 API 接口。
- **智能搜索**: 支持代码或名称模糊搜索并实时添加到自选列表。

## 🛠️ 环境要求

- Node.js 18.x 或更高版本
- npm 或 yarn

## 🚀 快速开始

### 1. 克隆并安装依赖

```bash
git clone https://github.com/your-username/StockBoard.git
cd StockBoard
npm install
```

### 2. 配置环境变量

在项目根目录创建一个 `.env` 文件，并添加您的 Alpha Vantage API Key：

```env
ALPHA_VANTAGE_API_KEY=您的_API_KEY
```

> **注意**: 
> - 如果未设置 KEY，系统将自动回退到 EODHD 公开接口（仅支持部分美股）或显示无数据提示。
> - 您可以前往 [Alpha Vantage 官网](https://www.alphavantage.co/support/#api-key) 免费申请。

### 3. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 `http://localhost:3000` 即可开始使用。

## 📦 部署

本项目支持在 [Vercel](https://vercel.com/) 或任何支持 Next.js 的平台上进行一键部署：

1. 将代码推送至您的 GitHub 仓库。
2. 在 Vercel 中导入该仓库。
3. **关键步骤**: 在 Vercel 控制台的 **Environment Variables** 中添加 `ALPHA_VANTAGE_API_KEY`。
4. 点击部署，完成后即可通过生成的 URL 访问。

## 📊 技术栈

- **框架**: Next.js (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS (v4)
- **图表**: Recharts (轻量级 Sparklines)
- **动画**: Framer Motion
- **日期处理**: date-fns & react-datepicker

## 🛡️ 免责声明

本项目所展示的所有股票行情及分析数据均来自第三方公开 API 接口，仅供演示和学习交流使用，不构成任何投资建议。投资者据此操作，风险自担。
