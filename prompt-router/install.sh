#!/bin/bash
# ============================================================
# Prompt Router MCP - Installation Script
# Forwards prompts to Gemini CLI, Qwen Code, or any AI agent
# ============================================================

set -e

MCP_DIR="$HOME/mcp-servers/prompt-router"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Installing Prompt Router MCP Server${NC}"
echo "======================================"

# --- Prerequisites ---
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js 18+ required. Found: $(node -v)${NC}"
    exit 1
fi
echo -e "  Node.js $(node -v)"

if ! command -v claude &> /dev/null; then
    echo -e "${RED}Claude Code not found. Install: npm install -g @anthropic-ai/claude-code${NC}"
    exit 1
fi
echo -e "  Claude Code found"

# --- At least one agent must be available ---
FOUND_AGENT=""

if command -v gemini &> /dev/null; then
    echo -e "  Gemini CLI found"
    FOUND_AGENT="gemini"
else
    echo -e "${YELLOW}  Gemini CLI not found. Install: npm install -g @google/gemini-cli${NC}"
fi

if command -v qwen &> /dev/null; then
    echo -e "  Qwen Code found"
    [ -z "$FOUND_AGENT" ] && FOUND_AGENT="qwen"
else
    echo -e "${YELLOW}  Qwen Code not found. Install: npm install -g @qwen-code/qwen-code${NC}"
fi

if [ -z "$FOUND_AGENT" ]; then
    echo -e "${RED}No AI agent CLI found. Install at least one of:${NC}"
    echo "  npm install -g @google/gemini-cli"
    echo "  npm install -g @qwen-code/qwen-code"
    exit 1
fi

# --- Set up server directory ---
echo -e "\n${YELLOW}Setting up MCP server at $MCP_DIR ...${NC}"
mkdir -p "$MCP_DIR"
cp "$(dirname "$0")/package.json" "$MCP_DIR/"
cp "$(dirname "$0")/index.js" "$MCP_DIR/"

cd "$MCP_DIR"
npm install 2>&1 | tail -3
chmod +x "$MCP_DIR/index.js"
echo -e "  Dependencies installed"

# --- Register with Claude Code ---
echo -e "\n${YELLOW}Registering with Claude Code...${NC}"

AGENT=${ROUTER_AGENT:-$FOUND_AGENT}
claude mcp remove prompt-router 2>/dev/null || true
claude mcp add-json prompt-router \
  "{\"command\":\"node\",\"args\":[\"$MCP_DIR/index.js\"],\"env\":{\"ROUTER_AGENT\":\"$AGENT\"}}" \
  --scope user

echo -e "  Registered at user scope (default agent: $AGENT)"

# --- Summary ---
echo ""
echo -e "${GREEN}======================================"
echo -e "Installation complete!"
echo -e "======================================${NC}"
echo ""
echo "Server location : $MCP_DIR"
echo "Default agent   : $AGENT"
echo ""
echo "Tools available in Claude Code:"
echo "  ask     - Forward a prompt to one agent, get the response"
echo "  compare - Send the same prompt to multiple agents and compare"
echo ""
echo "Quick usage:"
echo "  ask Claude to: use prompt-router ask tool, send 'Explain async/await in JS' to gemini"
echo "  ask Claude to: use prompt-router compare tool, compare gemini and qwen on 'Best sorting algorithm?'"
echo ""
echo "To change default agent:"
echo "  claude mcp remove prompt-router"
echo "  ROUTER_AGENT=qwen ./install.sh"
echo ""
echo "Restart Claude Code for changes to take effect."
