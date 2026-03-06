# AI Executor MCP Server (Multi-Engine)

Saves Claude Code API tokens by routing execution tasks to Gemini CLI or Qwen Code (both free).

## Quick Setup

```bash
# 1. Copy this folder to your home directory
cp -r gemini-executor-mcp ~/mcp-servers/ai-executor

# 2. Install dependencies
cd ~/mcp-servers/ai-executor
npm install

# 3. Install executors (install whichever you want)
npm install -g @google/gemini-cli        # Gemini: 60 req/min, 1000/day free
npm install -g @qwen-code/qwen-code      # Qwen:   1000 req/day free

# 4. Register with Claude Code (user scope = works everywhere)
# Default to Gemini:
claude mcp add-json ai-executor '{"command":"node","args":["'$HOME'/mcp-servers/ai-executor/index.js"],"env":{"EXECUTOR_CLI":"gemini"}}' --scope user

# Or default to Qwen:
claude mcp add-json ai-executor '{"command":"node","args":["'$HOME'/mcp-servers/ai-executor/index.js"],"env":{"EXECUTOR_CLI":"qwen"}}' --scope user

# 5. Restart Claude Code, then verify
claude mcp list
# Should show: ai-executor: connected

# 6. Copy CLAUDE.md to your project root
cp ~/mcp-servers/ai-executor/CLAUDE.md /path/to/your/project/CLAUDE.md
```

## Switching Executors

You can switch the default anytime:
```bash
claude mcp remove ai-executor
claude mcp add-json ai-executor '{"command":"node","args":["'$HOME'/mcp-servers/ai-executor/index.js"],"env":{"EXECUTOR_CLI":"qwen"}}' --scope user
```

Or Claude can choose per-task by passing `executor: "gemini"` or `executor: "qwen"` in tool calls.

## Project-Level Override

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "ai-executor": {
      "command": "node",
      "args": ["/home/YOUR_USER/mcp-servers/ai-executor/index.js"],
      "env": { "EXECUTOR_CLI": "qwen" }
    }
  }
}
```

## 3 Tools Available

| Tool | Use For | Executor Choice |
|------|---------|----------------|
| `execute_task` | Complex multi-step tasks | gemini / qwen |
| `run_shell` | Simple bash one-liners | N/A (direct bash) |
| `generate_and_apply` | Claude plans → executor codes | gemini / qwen |

## When to Use Which

| Scenario | Recommended Executor |
|----------|---------------------|
| Simple file ops, git, scaffolding | `gemini` (faster) |
| Complex multi-file code generation | `qwen` (stronger coder) |
| Laravel artisan commands | `run_shell` (no AI needed) |
| Applying a detailed refactor plan | `generate_and_apply` with `qwen` |

## How It Works

```
You → Claude Code (plan/debug) → ai-executor MCP → Gemini or Qwen (execute)
     [paid tokens: ~2-4K]                          [FREE tier]
```
