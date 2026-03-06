#!/bin/bash
# ============================================================
# Gemini Executor MCP Server - Installation Script
# Saves Claude Code tokens by routing execution to Gemini CLI
# ============================================================

set -e

MCP_DIR="$HOME/mcp-servers/ai-executor"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Installing AI Executor MCP Server (Multi-Engine)${NC}"
echo "============================================"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required. Found: $(node -v)${NC}"
    exit 1
fi
echo -e "  ✅ Node.js $(node -v)"

if ! command -v gemini &> /dev/null; then
    echo -e "${YELLOW}⚠️  Gemini CLI not found. Installing...${NC}"
    npm install -g @google/gemini-cli
    echo -e "  ✅ Gemini CLI installed. Run 'gemini' once to authenticate."
else
    echo -e "  ✅ Gemini CLI found"
fi

if ! command -v claude &> /dev/null; then
    echo -e "${RED}❌ Claude Code not found. Install with: npm install -g @anthropic-ai/claude-code${NC}"
    exit 1
fi
echo -e "  ✅ Claude Code found"

# Create MCP server directory
echo -e "\n${YELLOW}Setting up MCP server...${NC}"
mkdir -p "$MCP_DIR"

# Copy files
cp "$(dirname "$0")/package.json" "$MCP_DIR/"
cp "$(dirname "$0")/index.js" "$MCP_DIR/"

# Install dependencies
cd "$MCP_DIR"
npm install 2>&1 | tail -3
echo -e "  ✅ Dependencies installed"

# Make executable
chmod +x "$MCP_DIR/index.js"

# Register with Claude Code (user scope - available everywhere)
echo -e "\n${YELLOW}Registering MCP server with Claude Code...${NC}"

# Remove existing if any
claude mcp remove ai-executor 2>/dev/null || true

# Add at user scope (default executor from env or gemini)
EXECUTOR=${EXECUTOR_CLI:-gemini}
claude mcp add-json ai-executor "{\"command\":\"node\",\"args\":[\"$MCP_DIR/index.js\"],\"env\":{\"EXECUTOR_CLI\":\"$EXECUTOR\"}}" --scope user

echo -e "  ✅ Registered at user scope (default executor: $EXECUTOR)"

# Verify
echo -e "\n${YELLOW}Verifying installation...${NC}"
claude mcp list 2>&1 | grep -A2 "ai-executor" || echo "  Listed in mcp config"

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Installation complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "📋 What was installed:"
echo "   Server location: $MCP_DIR"
echo "   Scope: user (available in all projects)"
echo "   Default executor: $EXECUTOR"
echo ""
echo "📋 Available tools in Claude Code:"
echo "   1. execute_task      - Delegate tasks to Gemini or Qwen"
echo "   2. run_shell         - Run shell commands directly"
echo "   3. generate_and_apply - Code generation via Gemini or Qwen"
echo ""
echo "📋 Next steps:"
echo "   1. Restart Claude Code for changes to take effect"
echo "   2. Copy the CLAUDE.md to your project root"
echo "   3. Test: ask Claude Code to 'use run_shell to list files'"
echo ""
echo "📋 To switch default executor:"
echo "   claude mcp remove ai-executor"
echo "   EXECUTOR_CLI=qwen ./install.sh"
echo ""
echo "📋 For project-level override, add to your project's .mcp.json:"
echo '   {'
echo '     "mcpServers": {'
echo '       "ai-executor": {'
echo "         \"command\": \"node\","
echo "         \"args\": [\"$MCP_DIR/index.js\"],"
echo '         "env": { "EXECUTOR_CLI": "qwen" }'
echo '       }'
echo '     }'
echo '   }'
