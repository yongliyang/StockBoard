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
- **真实数据驱动**: 深度对接 Finnhub 公开 API 接口（免费 60 次/分钟），辅以 stock-sdk 覆盖 A 股与港股。
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

在项目根目录创建一个 `.env` 文件，并添加您的 Finnhub API Key：

```env
FINNHUB_API_KEY=您的_API_KEY
```

> **注意**:
> - 如果未设置 KEY，系统将提示无数据。
> - 您可以前往 [Finnhub 官网](https://finnhub.io/register) 免费注册并获取 API Key（免费版 60 次/分钟）。

### 3. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 `http://localhost:3000` 即可开始使用。

## 📦 部署

本项目支持在 [Vercel](https://vercel.com/) 或任何支持 Next.js 的平台上进行一键部署：

1. 将代码推送至您的 GitHub 仓库。
2. 在 Vercel 中导入该仓库。
3. **关键步骤**: 在 Vercel 控制台的 **Environment Variables** 中添加 `FINNHUB_API_KEY`。
4. 点击部署，完成后即可通过生成的 URL 访问。

### VPS 部署（Ubuntu 为例）

以下是以 Ubuntu 22.04/24.04 LTS 为例，在 VPS 上部署 StockBoard 的完整流程。

> **一键部署脚本**：项目中提供了自动化部署脚本，交互式引导完成全流程：
> ```bash
> # 将脚本复制到 VPS 后执行
> bash scripts/deploy.sh
> ```
>

#### 1. 服务器初始化

```bash
# 更新系统包
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl git nginx
```

#### 2. 安装 Node.js（推荐使用 NVM）

```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc

# 安装 Node.js LTS（18.x 或 20.x）
nvm install 20
nvm use 20
node -v  # 确认版本
```

#### 3. 克隆项目并安装依赖

```bash
git clone https://github.com/your-username/StockBoard.git
cd StockBoard
npm install
```

#### 4. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 Finnhub API Key
nano .env
```

```env
FINNHUB_API_KEY=您的_API_KEY
```

#### 5. 构建并启动

```bash
# 构建生产版本
npm run build

# 使用 PM2 启动进程（如未安装 PM2，先执行 npm install -g pm2）
pm2 start npm --name "stockboard" -- start
pm2 save
pm2 startup  # 设置开机自启（按提示执行输出的命令）
```

#### 6. 配置 Nginx 反向代理

创建 Nginx 配置文件：

```bash
sudo nano /etc/nginx/sites-available/stockboard
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名或服务器 IP

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用站点并测试：

```bash
sudo ln -s /etc/nginx/sites-available/stockboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 7. 配置 SSL 证书（可选，推荐）

使用 Certbot 免费申请 Let's Encrypt 证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

证书会自动续期，无需额外操作。

#### 8. 防火墙配置

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

#### 访问

完成以上步骤后，通过浏览器访问 `https://your-domain.com`（或 `http://your-server-ip`）即可使用。

## 📊 技术栈

- **框架**: Next.js (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS (v3)
- **图表**: Recharts (轻量级 Sparklines)
- **动画**: Framer Motion
- **日期处理**: date-fns & react-datepicker

## 🛡️ 免责声明

本项目所展示的所有股票行情及分析数据均来自第三方公开 API 接口，仅供演示和学习交流使用，不构成任何投资建议。投资者据此操作，风险自担。
