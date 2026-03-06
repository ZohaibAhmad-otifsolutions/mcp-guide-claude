#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn, spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typesPath = resolve(__dirname, "node_modules/@modelcontextprotocol/sdk/dist/esm/types.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = await import(typesPath);

// ============================================================
// Prompt Router MCP Server
// Translates / forwards a prompt to an AI agent (Gemini, Qwen,
// or any CLI-based agent) and returns the raw response.
// No file writes, no shell execution — pure prompt relay.
// ============================================================

const AGENTS = {
  gemini: {
    name: "Gemini CLI",
    cmd: "gemini",
    // gemini -p "<prompt>" --yolo => non-interactive output
    buildArgs: (prompt) => ["-p", prompt, "--yolo"],
  },
  qwen: {
    name: "Qwen Code",
    cmd: "qwen",
    buildArgs: (prompt) => ["-p", prompt, "--yolo"],
  },
  // Easy to extend: add more agents here following the same shape
  // opencode: { name: "OpenCode", cmd: "opencode", buildArgs: (p) => ["run", p] },
};

const DEFAULT_AGENT = process.env.ROUTER_AGENT || "gemini";

if (!AGENTS[DEFAULT_AGENT]) {
  console.error(`Invalid ROUTER_AGENT: "${DEFAULT_AGENT}". Use: ${Object.keys(AGENTS).join(", ")}`);
  process.exit(1);
}

// Detect which agents are actually installed at startup
function isInstalled(cmd) {
  try {
    const result = spawnSync(cmd, ["--version"], { timeout: 3000 });
    return result.status === 0 || result.status === 1; // some CLIs exit 1 on --version but still exist
  } catch {
    return false;
  }
}

// Build ordered fallback chain: requested default first, then the rest
const AGENT_ORDER = [DEFAULT_AGENT, ...Object.keys(AGENTS).filter((k) => k !== DEFAULT_AGENT)];
const AVAILABLE_AGENTS = AGENT_ORDER.filter((k) => isInstalled(AGENTS[k].cmd));

if (AVAILABLE_AGENTS.length === 0) {
  console.error(`No AI agent CLI found. Install one of: ${Object.keys(AGENTS).map((k) => AGENTS[k].cmd).join(", ")}`);
  process.exit(1);
}

// Resolve an agent key with fallback: try requested → fallback chain → error
function resolveAgent(requestedKey) {
  const chain = requestedKey
    ? [requestedKey, ...AGENT_ORDER.filter((k) => k !== requestedKey)]
    : AGENT_ORDER;

  for (const key of chain) {
    if (AVAILABLE_AGENTS.includes(key)) {
      return { agent: AGENTS[key], key, usedFallback: key !== (requestedKey || DEFAULT_AGENT) };
    }
  }
  return null;
}

// ---- Server Setup ----

const server = new Server(
  { name: "prompt-router", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ---- Tool Definitions ----

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ask",
      description: `Send a prompt to an AI agent and get back the raw text response. Available agents: ${AVAILABLE_AGENTS.join(", ")}. Falls back to the next available agent if the requested one is not installed. Default agent: ${AVAILABLE_AGENTS[0]}.`,
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The prompt or question to send to the AI agent.",
          },
          agent: {
            type: "string",
            enum: Object.keys(AGENTS),
            description: `Which agent to use. Available: ${AVAILABLE_AGENTS.join(", ")}. Falls back to next available if not installed. Default: "${AVAILABLE_AGENTS[0]}".`,
          },
          system: {
            type: "string",
            description: "Optional system/role context to prepend to the prompt (e.g. 'You are a senior PHP developer.').",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds. Default 60.",
            default: 60,
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "compare",
      description: "Send the same prompt to multiple agents in parallel and return all responses for comparison.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The prompt to send to all agents.",
          },
          agents: {
            type: "array",
            items: { type: "string", enum: Object.keys(AGENTS) },
            description: `List of agents to query. Defaults to all available: ${AVAILABLE_AGENTS.join(", ")}. Unavailable agents are skipped with a note.`,
          },
          system: {
            type: "string",
            description: "Optional system context prepended to the prompt.",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds per agent. Default 60.",
            default: 60,
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

// ---- Tool Handlers ----

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "ask") {
    const resolved = resolveAgent(args.agent || null);
    if (!resolved) {
      return { content: [{ type: "text", text: `No available agent found. Install one of: ${Object.keys(AGENTS).map((k) => AGENTS[k].cmd).join(", ")}` }], isError: true };
    }

    const { agent, key, usedFallback } = resolved;
    const fullPrompt = buildPrompt(args.system, args.prompt);
    const timeoutMs = (args.timeout || 60) * 1000;
    const fallbackNote = usedFallback ? `(requested: ${args.agent}, fell back to: ${key})\n` : "";

    try {
      const result = await runAgent(agent, fullPrompt, timeoutMs);
      return {
        content: [{ type: "text", text: `[${agent.name}] ${fallbackNote}\n${result}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `[${agent.name}] Error: ${err.message}\n${err.stderr || ""}` }],
        isError: true,
      };
    }
  }

  if (name === "compare") {
    const requestedKeys = args.agents && args.agents.length > 0 ? args.agents : Object.keys(AGENTS);
    const fullPrompt = buildPrompt(args.system, args.prompt);
    const timeoutMs = (args.timeout || 60) * 1000;

    const parts = [];

    // Split into available and unavailable upfront
    const toRun = requestedKeys.filter((k) => AVAILABLE_AGENTS.includes(k));
    const skipped = requestedKeys.filter((k) => !AVAILABLE_AGENTS.includes(k));

    if (skipped.length > 0) {
      parts.push(`> Skipped (not installed): ${skipped.join(", ")}`);
    }

    if (toRun.length === 0) {
      parts.push(`No available agents to query. Install one of: ${Object.keys(AGENTS).map((k) => AGENTS[k].cmd).join(", ")}`);
      return { content: [{ type: "text", text: parts.join("\n\n") }], isError: true };
    }

    const results = await Promise.allSettled(
      toRun.map(async (key) => {
        const agent = AGENTS[key];
        const output = await runAgent(agent, fullPrompt, timeoutMs);
        return { key, name: agent.name, output };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        parts.push(`## ${r.value.name}\n\n${r.value.output}`);
      } else {
        parts.push(`## (ERROR)\n\n${r.reason?.message || r.reason}`);
      }
    }

    return {
      content: [{ type: "text", text: parts.join("\n\n---\n\n") }],
    };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

// ---- Helpers ----

function buildPrompt(system, prompt) {
  if (system) return `${system}\n\n${prompt}`;
  return prompt;
}

function runAgent(agent, prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = agent.buildArgs(prompt);
    const proc = spawn(agent.cmd, args, {
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim() || stderr.trim());
      } else {
        const err = new Error(`${agent.name} exited with code ${code}`);
        err.stderr = stderr.trim();
        err.stdout = stdout.trim();
        reject(err);
      }
    });

    proc.on("error", (err) => {
      err.stderr = stderr.trim();
      reject(err);
    });
  });
}

// ---- Start ----

const transport = new StdioServerTransport();
await server.connect(transport);
