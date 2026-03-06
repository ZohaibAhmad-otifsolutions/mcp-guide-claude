# Project Instructions for Claude Code

## Token Optimization Mode

You have access to the `ai-executor` MCP server with 3 tools.
Use them to save tokens by delegating execution tasks to Gemini or Qwen (both free).

### Routing Rules

**YOU handle (thinking/planning):**
- Architecture decisions and design
- Debugging and error analysis
- Code review and security audit
- Refactoring strategy and plans
- Complex algorithm logic
- Generating detailed specs/prompts

**Delegate to `execute_task` (free execution):**
- Creating new files from your plans
- Multi-step git workflows
- Running test suites
- Package installation
- Scaffolding (artisan, npm init, etc.)
- Deployment steps
- Bulk file modifications
- Use `executor: "qwen"` for complex code generation
- Use `executor: "gemini"` for simpler/faster tasks (or omit for default)

**Delegate to `run_shell` (simple commands):**
- Single git commands (git add, commit, push)
- Single artisan commands
- composer/npm install
- File listing, grep, find
- Any one-liner bash command

**Delegate to `generate_and_apply` (code generation):**
- When you've planned what code to write, send the plan to an executor
- Include file paths, function signatures, and logic
- Use `executor: "qwen"` for complex multi-file generation
- Use `executor: "gemini"` for simpler scaffolding

### Output Preferences
- When not using MCP tools, output commands as copy-paste ready text
- Use unified diff format for code changes
- Be concise — skip obvious explanations
- Group related operations together

### Project Context
- Framework: Laravel (PHP)
- Frontend: Vue.js
- Internal packages: laravel-settings, curl-handler, CDN utilities
- Refer to SYSTEM_PACKAGES_DOCUMENTATION.md for package APIs
