#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本名称和描述
echo -e "${BLUE}=== Python 虚拟环境设置脚本 ===${NC}"
echo -e "${YELLOW}此脚本将帮助您创建虚拟环境并安装项目依赖${NC}"
echo

# 检查是否存在requirements.txt
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}错误: 在当前目录中未找到 requirements.txt 文件${NC}"
    echo -e "${YELLOW}请确保您在正确的项目目录中运行此脚本${NC}"
    exit 1
fi

# 检查Python3是否安装
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}错误: 未找到 python3 命令${NC}"
    echo -e "${YELLOW}请先安装 Python 3: sudo apt install python3 python3-venv python3-pip${NC}"
    exit 1
fi

# 虚拟环境目录名
VENV_DIR="venv"

# 检查虚拟环境是否已存在
if [ -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}虚拟环境已存在，是否要重新创建？ (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}删除现有虚拟环境...${NC}"
        rm -rf "$VENV_DIR"
    else
        echo -e "${GREEN}使用现有虚拟环境${NC}"
    fi
fi

# 创建虚拟环境（如果不存在）
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${BLUE}创建虚拟环境...${NC}"
    python3 -m venv "$VENV_DIR"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}创建虚拟环境失败${NC}"
        echo -e "${YELLOW}请尝试安装: sudo apt install python3-venv${NC}"
        exit 1
    fi
    echo -e "${GREEN}虚拟环境创建成功！${NC}"
fi

# 激活虚拟环境
echo -e "${BLUE}激活虚拟环境...${NC}"
source "$VENV_DIR/bin/activate"

if [ $? -ne 0 ]; then
    echo -e "${RED}激活虚拟环境失败${NC}"
    exit 1
fi

echo -e "${GREEN}虚拟环境已激活！${NC}"

# 升级pip
echo -e "${BLUE}升级 pip...${NC}"
pip install --upgrade pip

# 安装依赖
echo -e "${BLUE}安装项目依赖...${NC}"
pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 依赖安装成功！${NC}"
    echo
    echo -e "${BLUE}=== 使用说明 ===${NC}"
    echo -e "${YELLOW}1. 激活虚拟环境: ${NC}source venv/bin/activate"
    echo -e "${YELLOW}2. 运行您的项目: ${NC}python your_script.py"
    echo -e "${YELLOW}3. 退出虚拟环境: ${NC}deactivate"
    echo
    echo -e "${GREEN}当前虚拟环境已激活，您可以直接运行项目了！${NC}"
else
    echo -e "${RED}❌ 依赖安装失败${NC}"
    echo -e "${YELLOW}请检查 requirements.txt 文件内容${NC}"
    exit 1
fi

# 显示已安装的包
echo -e "${BLUE}已安装的包列表:${NC}"
pip list
