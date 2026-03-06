# Prompt Router MCP

An MCP server that **only** forwards your prompt to an AI agent (Gemini CLI, Qwen Code, or any CLI-based model) and returns the raw response. No file writes, no shell execution — just pure prompt relay.

## What it does

```
Claude Code  -->  prompt-router MCP  -->  Gemini / Qwen / other agent
                                     <--  raw text response
```

Use it to:
- Get a second opinion from another model
- Generate content via a free-tier model
- Compare answers across multiple agents
- Route expensive prompts away from paid Claude tokens

## Tools

| Tool | Description |
|------|-------------|
| `ask` | Send a prompt to one agent, get the response |
| `compare` | Send the same prompt to multiple agents in parallel and compare all responses |

Both tools accept an optional `system` parameter for role/context.

## Installation

### 1. Install at least one AI agent CLI

```bash
# Gemini CLI (free: 60 req/min, 1000 req/day)
npm install -g @google/gemini-cli
gemini          # run once to authenticate via Google account

# Qwen Code (free: 1000 req/day)
npm install -g @qwen-code/qwen-code
qwen            # run once to authenticate
```

### 2. Run the install script

```bash
git clone https://github.com/your-repo/mcp-guide-claude
cd mcp-guide-claude/prompt-router
./install.sh
```

The script will:
- Copy files to `~/mcp-servers/prompt-router/`
- Install npm dependencies
- Register the MCP with Claude Code at user scope

### 3. Manual installation (alternative)

```bash
# Copy files
mkdir -p ~/mcp-servers/prompt-router
cp index.js package.json ~/mcp-servers/prompt-router/
cd ~/mcp-servers/prompt-router
npm install

# Register with Claude Code
claude mcp add-json prompt-router \
  '{"command":"node","args":["'$HOME'/mcp-servers/prompt-router/index.js"],"env":{"ROUTER_AGENT":"gemini"}}' \
  --scope user
```

### 4. Restart Claude Code

```bash
# Verify it's registered
claude mcp list
# Should show: prompt-router: connected
```

## Usage in Claude Code

Once installed, Claude can call the tools directly:

```
Ask: use the prompt-router ask tool to send "What is idempotency?" to gemini
Ask: use prompt-router compare to compare gemini and qwen on "Best way to handle errors in PHP?"
Ask: use prompt-router ask with system "You are a senior Laravel developer" and prompt "How do I cache heavy queries?"
```

## Switching Default Agent

```bash
claude mcp remove prompt-router
ROUTER_AGENT=qwen ./install.sh
```

Or per-call — just pass `agent: "qwen"` in the tool call.

## Adding a New Agent

Edit `index.js` and add an entry to the `AGENTS` object:

```js
const AGENTS = {
  gemini: { name: "Gemini CLI", cmd: "gemini", buildArgs: (p) => ["-p", p, "--yolo"] },
  qwen:   { name: "Qwen Code",  cmd: "qwen",   buildArgs: (p) => ["-p", p, "--yolo"] },

  // Example: add OpenCode
  opencode: { name: "OpenCode", cmd: "opencode", buildArgs: (p) => ["run", p] },
};
```

Any CLI tool that accepts a prompt flag and prints output to stdout works.

## Project-Level Config (`.mcp.json`)

```json
{
  "mcpServers": {
    "prompt-router": {
      "command": "node",
      "args": ["/home/YOUR_USER/mcp-servers/prompt-router/index.js"],
      "env": { "ROUTER_AGENT": "qwen" }
    }
  }
}
```

## Comparison: prompt-router vs ai-executor

| Feature | `prompt-router` | `ai-executor` |
|---------|----------------|--------------|
| Purpose | Forward prompts, get AI response | Execute tasks, write files, run commands |
| File writes | No | Yes |
| Shell execution | No | Yes |
| Tools | `ask`, `compare` | `execute_task`, `run_shell`, `generate_and_apply` |
| Use when | You need an AI answer/opinion | You need an AI to *do* something |
