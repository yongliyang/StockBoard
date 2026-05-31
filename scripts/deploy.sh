#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockBoard VPS 部署脚本 (Ubuntu)
# 交互式引导，自动检查依赖，完成部署全流程
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERR]${NC}   $*"; }

# --- 前置检查 -----------------------------------------------------------

check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warn "不建议以 root 用户直接运行，推荐使用普通用户 + sudo。"
        read -r -p "是否继续？ [y/N] " choice
        [[ "$choice" =~ ^[Yy]$ ]] || exit 1
    fi
}

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        log_err "无法识别操作系统，此脚本仅支持 Ubuntu。"
        exit 1
    fi
    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        log_err "当前系统为 $ID，此脚本仅支持 Ubuntu。"
        exit 1
    fi
    log_ok "操作系统: Ubuntu $VERSION_ID"
}

# --- 工具函数 -----------------------------------------------------------

command_exists() {
    command -v "$1" &>/dev/null
}

install_packages() {
    local pkgs=()
    for pkg in "$@"; do
        if dpkg -s "$pkg" &>/dev/null 2>&1; then
            log_ok "已安装: $pkg"
        else
            pkgs+=("$pkg")
        fi
    done
    if [[ ${#pkgs[@]} -gt 0 ]]; then
        log_info "安装依赖: ${pkgs[*]}"
        sudo apt-get install -y "${pkgs[@]}"
    fi
}

ensure_sudo() {
    if ! command_exists sudo; then
        log_err "系统中未找到 sudo，请先安装。"
        exit 1
    fi
}

# --- 步骤 1: 收集用户输入 ------------------------------------------------

gather_input() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}   StockBoard VPS 部署向导${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    # 域名
    read -r -p "请输入域名（如 stockboard.example.com，无域名直接回车将使用服务器 IP）: " DOMAIN
    DOMAIN="${DOMAIN:-}"
    if [[ -z "$DOMAIN" ]]; then
        SERVER_IP=$(curl -s http://checkip.amazonaws.com 2>/dev/null || curl -s https://api.ipify.org 2>/dev/null || echo "")
        if [[ -z "$SERVER_IP" ]]; then
            log_err "无法自动获取服务器 IP，请手动输入。"
            read -r -p "服务器 IP 地址: " SERVER_IP
        fi
        DOMAIN="$SERVER_IP"
        log_info "将使用 IP 地址访问: $DOMAIN"
    else
        log_info "将使用域名: $DOMAIN"
    fi

    # SSL
    USE_SSL=false
    if [[ -n "$DOMAIN" && "$DOMAIN" =~ \. ]]; then
        read -r -p "是否配置 SSL 证书（Let's Encrypt）？ [Y/n] " ssl_choice
        ssl_choice="${ssl_choice:-Y}"
        if [[ "$ssl_choice" =~ ^[Yy]$ ]]; then
            USE_SSL=true
        fi
    fi

    # 项目路径
    DEFAULT_DIR="$HOME/StockBoard"
    read -r -p "项目部署目录 [${DEFAULT_DIR}]: " PROJECT_DIR
    PROJECT_DIR="${PROJECT_DIR:-$DEFAULT_DIR}"

    # 仓库地址
    DEFAULT_REPO="https://github.com/your-username/StockBoard.git"
    read -r -p "Git 仓库地址 [${DEFAULT_REPO}]: " REPO_URL
    REPO_URL="${REPO_URL:-$DEFAULT_REPO}"

    # Finnhub API Key
    read -r -p "Finnhub API Key（留空则跳过，后续可手动配置）: " API_KEY
    API_KEY="${API_KEY:-}"

    echo ""
    echo -e "${CYAN}==========  部署配置摘要  ==========${NC}"
    echo "  域名 / IP:    $DOMAIN"
    echo "  SSL:          $([ "$USE_SSL" = true ] && echo '是' || echo '否')"
    echo "  项目目录:     $PROJECT_DIR"
    echo "  仓库地址:     $REPO_URL"
    echo "  API Key:      $([ -n "$API_KEY" ] && echo '已配置' || echo '未配置')"
    echo -e "${CYAN}====================================${NC}"
    echo ""
    read -r -p "确认以上配置并开始部署？ [Y/n] " confirm
    confirm="${confirm:-Y}"
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "部署已取消。"
        exit 0
    fi
}

# --- 步骤 2: 系统依赖检查 ------------------------------------------------

setup_system_deps() {
    log_info "更新软件包列表..."
    sudo apt-get update

    install_packages curl git nginx
    log_ok "系统依赖已就绪"
}

# --- 步骤 3: Node.js ----------------------------------------------------

setup_node() {
    if command_exists node && command_exists npm; then
        local node_ver
        node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ "$node_ver" -ge 18 ]]; then
            log_ok "Node.js $(node -v) 已满足最低要求"
            return
        fi
        log_warn "Node.js 版本过低 ($(node -v))，将通过 NVM 升级。"
    fi

    if [[ -d "$HOME/.nvm" ]]; then
        log_ok "NVM 已安装"
    else
        log_info "安装 NVM..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    fi

    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"

    log_info "安装 Node.js 20 LTS..."
    nvm install 20
    nvm use 20
    nvm alias default 20
    log_ok "Node.js $(node -v) / npm $(npm -v)"
}

# --- 步骤 4: PM2 --------------------------------------------------------

setup_pm2() {
    if command_exists pm2; then
        log_ok "PM2 已安装"
    else
        log_info "安装 PM2..."
        npm install -g pm2
    fi
}

# --- 步骤 5: 克隆 / 拉取项目 ---------------------------------------------

setup_project() {
    if [[ -d "$PROJECT_DIR/.git" ]]; then
        log_info "项目目录已存在，拉取最新代码..."
        cd "$PROJECT_DIR"
        git pull
    else
        log_info "克隆项目到 $PROJECT_DIR ..."
        git clone "$REPO_URL" "$PROJECT_DIR"
        cd "$PROJECT_DIR"
    fi

    log_info "安装 npm 依赖..."
    npm install
    log_ok "依赖安装完成"
}

# --- 步骤 6: 环境变量 ----------------------------------------------------

setup_env() {
    local env_file="$PROJECT_DIR/.env"
    if [[ -f "$env_file" ]]; then
        log_info ".env 文件已存在，跳过创建。如需修改请编辑 $env_file"
    else
        log_info "创建 .env 文件..."
        cat > "$env_file" <<- EOF
FINNHUB_API_KEY=${API_KEY}
EOF
        log_ok ".env 文件已创建"
    fi
}

# --- 步骤 7: 构建项目 ---------------------------------------------------

build_project() {
    cd "$PROJECT_DIR"
    log_info "构建生产版本..."
    npm run build
    log_ok "构建完成"
}

# --- 步骤 8: PM2 启动 ---------------------------------------------------

start_pm2() {
    cd "$PROJECT_DIR"
    # 先尝试停止已有进程，忽略错误
    pm2 delete stockboard 2>/dev/null || true

    log_info "通过 PM2 启动应用..."
    pm2 start npm --name "stockboard" -- start
    pm2 save

    # 设置开机自启
    local startup_cmd
    startup_cmd=$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>&1 | grep -E '(sudo|env)' || true)
    if [[ -n "$startup_cmd" ]]; then
        log_info "执行 PM2 开机自启配置..."
        echo "$startup_cmd" | bash
    fi

    log_ok "PM2 应用已启动"
}

# --- 步骤 9: Nginx -----------------------------------------------------

setup_nginx() {
    local nginx_conf="/etc/nginx/sites-available/stockboard"

    log_info "配置 Nginx..."

    sudo tee "$nginx_conf" > /dev/null <<- NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

    # 启用站点
    if [[ ! -L /etc/nginx/sites-enabled/stockboard ]]; then
        sudo ln -s "$nginx_conf" /etc/nginx/sites-enabled/
    fi

    # 移除默认站点
    if [[ -L /etc/nginx/sites-enabled/default ]]; then
        sudo rm /etc/nginx/sites-enabled/default
    fi

    # 测试配置
    if sudo nginx -t; then
        sudo systemctl reload nginx
        log_ok "Nginx 配置已生效"
    else
        log_err "Nginx 配置测试失败，请手动检查。"
        exit 1
    fi
}

# --- 步骤 10: SSL 证书 --------------------------------------------------

setup_ssl() {
    if [[ "$USE_SSL" != true ]]; then
        return
    fi

    if ! command_exists certbot; then
        log_info "安装 Certbot..."
        sudo apt-get install -y certbot python3-certbot-nginx
    fi

    log_info "申请 Let's Encrypt 证书（域名需已解析到本机）..."
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@${DOMAIN}" || {
        log_warn "SSL 证书申请失败，常见原因："
        log_warn "  1. 域名 $DOMAIN 未正确解析到本机 IP"
        log_warn "  2. 防火墙 80/443 端口未开放"
        log_warn "部署将继续但未配置 SSL，稍后可手动运行: sudo certbot --nginx -d $DOMAIN"
    }
    log_ok "SSL 配置完成"
}

# --- 步骤 11: 防火墙 ----------------------------------------------------

setup_firewall() {
    if ! command_exists ufw; then
        install_packages ufw
    fi

    local ufw_active
    ufw_active=$(sudo ufw status | grep -c "Status: active" || true)

    log_info "配置防火墙..."
    sudo ufw allow OpenSSH
    sudo ufw allow 'Nginx Full'

    if [[ "$ufw_active" -eq 0 ]]; then
        log_warn "防火墙当前未启用。是否启用？(启用后请确保 SSH 端口已放行)"
        read -r -p "启用 UFW？ [Y/n] " ufw_choice
        ufw_choice="${ufw_choice:-Y}"
        if [[ "$ufw_choice" =~ ^[Yy]$ ]]; then
            sudo ufw --force enable
            log_ok "UFW 已启用"
        else
            log_info "跳过 UFW 启用，请自行确保服务器安全。"
        fi
    else
        sudo ufw reload
        log_ok "UFW 规则已更新"
    fi
}

# --- 完成 ---------------------------------------------------------------

print_summary() {
    local protocol="http"
    [[ "$USE_SSL" == true ]] && protocol="https"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   StockBoard 部署完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  访问地址:    ${CYAN}${protocol}://${DOMAIN}${NC}"
    echo ""
    echo "  常用命令:"
    echo "    pm2 status              # 查看进程状态"
    echo "    pm2 logs stockboard     # 查看应用日志"
    echo "    pm2 restart stockboard  # 重启应用"
    echo "    sudo systemctl reload nginx  # 重载 Nginx"
    echo ""
    echo "  项目目录: $PROJECT_DIR"
    echo "  配置文件: $PROJECT_DIR/.env"
    echo ""
    echo -e "${YELLOW}  提示：如使用 IP 访问，建议尽快绑定域名并配置 SSL。${NC}"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

# --- 主流程 -------------------------------------------------------------

main() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}   StockBoard VPS 自动部署脚本${NC}"
    echo -e "${CYAN}   仅支持 Ubuntu 系统${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    check_os
    check_root
    ensure_sudo
    gather_input

    log_info "步骤 1/10: 安装系统依赖..."
    setup_system_deps

    log_info "步骤 2/10: 安装 Node.js..."
    setup_node

    log_info "步骤 3/10: 安装 PM2..."
    setup_pm2

    log_info "步骤 4/10: 克隆项目..."
    setup_project

    log_info "步骤 5/10: 配置环境变量..."
    setup_env

    log_info "步骤 6/10: 构建项目..."
    build_project

    log_info "步骤 7/10: PM2 启动..."
    start_pm2

    log_info "步骤 8/10: 配置 Nginx..."
    setup_nginx

    log_info "步骤 9/10: 配置 SSL..."
    setup_ssl

    log_info "步骤 10/10: 配置防火墙..."
    setup_firewall

    print_summary
}

main "$@"
