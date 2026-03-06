#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "module";
import { spawn } from "child_process";
import { homedir } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load schemas - SDK exports them from types.js but not via package exports map
const __dirname = dirname(fileURLToPath(import.meta.url));
const typesPath = resolve(__dirname, "node_modules/@modelcontextprotocol/sdk/dist/esm/types.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = await import(typesPath);

// ============================================================
// AI Executor MCP Server (Multi-Engine)
// Routes execution tasks to Gemini CLI or Qwen Code (both free)
// Set default via EXECUTOR_CLI env var: "gemini" | "qwen"
// ============================================================

// Supported executors and their CLI configs
const EXECUTORS = {
  gemini: { cmd: "gemini", name: "Gemini CLI", yoloFlag: "--yolo", sandboxFlag: "--sandbox" },
  qwen:   { cmd: "qwen",   name: "Qwen Code",  yoloFlag: "--yolo", sandboxFlag: "--sandbox" },
};

const DEFAULT_EXECUTOR = process.env.EXECUTOR_CLI || "gemini";

// Validate default
if (!EXECUTORS[DEFAULT_EXECUTOR]) {
  console.error(`Invalid EXECUTOR_CLI: "${DEFAULT_EXECUTOR}". Use: ${Object.keys(EXECUTORS).join(", ")}`);
  process.exit(1);
}

function getExecutor(name) {
  return EXECUTORS[name] || EXECUTORS[DEFAULT_EXECUTOR];
}

const server = new Server(
  {
    name: "ai-executor",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ---- Tool Definitions ----

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_task",
      description:
        `Delegate a task to an AI CLI agent for execution. Use this for: git operations, file creation/editing, running tests, installing packages, scaffolding, deployments, and any mechanical/execution task. Both Gemini and Qwen run FREE so this saves Claude tokens. Default executor: ${DEFAULT_EXECUTOR}.`,
      inputSchema: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description:
              "Clear instruction for the executor to carry out. Be specific about file paths, commands, and expected behavior.",
          },
          executor: {
            type: "string",
            enum: Object.keys(EXECUTORS),
            description:
              `Which CLI to use: "gemini" (Gemini CLI) or "qwen" (Qwen Code). Default: "${DEFAULT_EXECUTOR}".`,
          },
          working_directory: {
            type: "string",
            description:
              "Absolute path to run the task in. Defaults to current working directory.",
          },
          yolo_mode: {
            type: "boolean",
            description:
              "If true (default), auto-approves all file writes and shell commands. Set false for sensitive operations.",
            default: true,
          },
          sandbox: {
            type: "boolean",
            description:
              "If true, run in sandbox/container mode for safety. Default false.",
            default: false,
          },
        },
        required: ["task"],
      },
    },
    {
      name: "run_shell",
      description:
        "Run a shell command directly without AI involvement. Use for simple one-liner commands like: git add, git commit, npm install, composer install, php artisan commands, etc. Faster than Gemini for simple commands. Returns stdout and stderr.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute directly.",
          },
          working_directory: {
            type: "string",
            description: "Absolute path to run the command in.",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds. Default 60.",
            default: 60,
          },
        },
        required: ["command"],
      },
    },
    {
      name: "generate_and_apply",
      description:
        `Give an AI executor a code generation task with specific instructions and let it create/modify files directly. Best for: creating new files from specs, applying diffs, scaffolding features, bulk find-and-replace. Claude provides the plan, the executor writes the code. Default executor: ${DEFAULT_EXECUTOR}.`,
      inputSchema: {
        type: "object",
        properties: {
          plan: {
            type: "string",
            description:
              "Detailed plan/spec for what code to generate. Include file paths, function signatures, and logic description.",
          },
          files_context: {
            type: "string",
            description:
              "Optional: relevant existing code or file contents that the executor needs as context.",
          },
          executor: {
            type: "string",
            enum: Object.keys(EXECUTORS),
            description:
              `Which CLI to use. Default: "${DEFAULT_EXECUTOR}". Use "qwen" for complex code gen, "gemini" for simpler tasks.`,
          },
          working_directory: {
            type: "string",
            description: "Absolute path to the project root.",
          },
        },
        required: ["plan"],
      },
    },
  ],
}));

// ---- Tool Handlers ----

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cwd = args.working_directory || process.cwd();

  switch (name) {
    case "execute_task":
      return await executeTask(args.task, cwd, args.executor, args.yolo_mode !== false, args.sandbox === true);

    case "run_shell":
      return await runShell(args.command, cwd, (args.timeout || 60) * 1000);

    case "generate_and_apply":
      return await generateAndApply(args.plan, args.files_context, args.executor, cwd);

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// ---- Execution Functions ----

async function executeTask(task, cwd, executorName, yoloMode, sandbox) {
  const exec = getExecutor(executorName);
  const args = ["-p", task];
  if (yoloMode) args.push(exec.yoloFlag);
  if (sandbox && exec.sandboxFlag) args.push(exec.sandboxFlag);

  try {
    const result = await spawnAsync(exec.cmd, args, { cwd, timeout: 180000 });
    return {
      content: [
        {
          type: "text",
          text: `✅ ${exec.name} executed successfully in ${cwd}\n\n--- Output ---\n${result.stdout}${result.stderr ? `\n--- Stderr ---\n${result.stderr}` : ""}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${exec.name} execution failed\n\nError: ${error.message}\n${error.stderr ? `Stderr: ${error.stderr}` : ""}`,
        },
      ],
      isError: true,
    };
  }
}

async function runShell(command, cwd, timeout) {
  try {
    const result = await spawnAsync("bash", ["-c", command], { cwd, timeout });
    return {
      content: [
        {
          type: "text",
          text: `✅ Command completed\n$ ${command}\n\n${result.stdout}${result.stderr ? `\nStderr: ${result.stderr}` : ""}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Command failed\n$ ${command}\n\nExit code: ${error.exitCode}\nStdout: ${error.stdout || "(empty)"}\nStderr: ${error.stderr || "(empty)"}`,
        },
      ],
      isError: true,
    };
  }
}

async function generateAndApply(plan, filesContext, executorName, cwd) {
  const prompt = `You are a code executor. Apply the following plan EXACTLY as specified.
Do NOT ask questions. Do NOT explain. Just create/modify the files.

${filesContext ? `## Existing Code Context\n${filesContext}\n` : ""}
## Plan to Execute
${plan}

Execute this plan now. Create or modify all files as specified.`;

  return await executeTask(prompt, cwd, executorName, true, false);
}

// ---- Utility: Promise-based spawn ----

function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 120000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code });
      } else {
        const err = new Error(`Process exited with code ${code}`);
        err.stdout = stdout.trim();
        err.stderr = stderr.trim();
        err.exitCode = code;
        reject(err);
      }
    });

    proc.on("error", (err) => {
      err.stdout = stdout.trim();
      err.stderr = stderr.trim();
      reject(err);
    });
  });
}

// ---- Start Server ----

const transport = new StdioServerTransport();
await server.connect(transport);
