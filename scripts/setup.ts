#!/usr/bin/env tsx
/**
 * Squads Setup Script
 *
 * Walks you through:
 * 1. Setting up PostgreSQL
 * 2. Running the database schema
 * 3. Creating a GitHub OAuth App
 * 4. Configuring env vars
 * 5. Testing the connection
 */

import { createInterface } from "readline";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

const ROOT = join(import.meta.dirname, "..");
const ENV_PATH = join(ROOT, ".env");

const CLAUDE_THEME = {
  accent: "\x1b[38;2;193;95;60m",   // #C15F3C
  peach: "\x1b[38;2;222;115;86m",   // #DE7356
  dim: "\x1b[38;2;107;101;96m",     // #6B6560
  green: "\x1b[38;2;91;163;124m",   // #5BA37C
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

const c = CLAUDE_THEME;

function header(text: string) {
  console.log(`\n${c.accent}${c.bold}✦ ${text}${c.reset}\n`);
}

function step(n: number, text: string) {
  console.log(`${c.peach}  ${n}.${c.reset} ${text}`);
}

function info(text: string) {
  console.log(`${c.dim}     ${text}${c.reset}`);
}

function success(text: string) {
  console.log(`${c.green}  ✓ ${text}${c.reset}`);
}

async function main() {
  console.log(`
${c.accent}${c.bold}
  ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
  ┃     ✦ SQUADS SETUP ✦        ┃
  ┃   social lobbies for         ┃
  ┃   claude code                ┃
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
${c.reset}`);

  // ─── Step 1: PostgreSQL ───────────────────────────────
  header("Step 1: Set Up PostgreSQL");
  step(1, "Install PostgreSQL if you haven't:");
  info("macOS: brew install postgresql@16 && brew services start postgresql@16");
  info("Linux: sudo apt install postgresql && sudo systemctl start postgresql");
  step(2, 'Create a database:');
  info('createdb squads');
  console.log();

  const databaseUrl = (
    await ask(`${c.peach}  Paste your DATABASE_URL (or press Enter for default): ${c.reset}`)
  ).trim() || "postgresql://localhost:5432/squads";

  success(`Database URL: ${databaseUrl}`);

  // ─── Step 2: Run Schema ─────────────────────────────
  header("Step 2: Run Database Schema");
  const schemaPath = join(ROOT, "server", "schema.sql");
  step(1, `Run the schema:`);
  info(`psql "${databaseUrl}" < ${schemaPath}`);
  console.log();

  await ask(`${c.peach}  Press Enter when schema is applied...${c.reset}`);
  success("Schema applied");

  // ─── Step 3: GitHub OAuth App ───────────────────────
  header("Step 3: Create a GitHub OAuth App");
  step(1, "Go to https://github.com/settings/developers");
  step(2, 'Click "New OAuth App"');
  step(3, "Fill in:");
  info("App name: Squade Code");
  info("Homepage URL: http://localhost:3000");
  info("Authorization callback URL: http://localhost:3000/auth/github/callback");
  step(4, "Copy the Client ID and generate a Client Secret");
  console.log();

  const githubClientId = (await ask(`${c.peach}  GitHub Client ID: ${c.reset}`)).trim();
  const githubClientSecret = (await ask(`${c.peach}  GitHub Client Secret: ${c.reset}`)).trim();

  if (!githubClientId || !githubClientSecret) {
    console.error("\n  Missing GitHub credentials. Please try again.");
    process.exit(1);
  }

  // ─── Step 4: Generate JWT Secret & Save .env ────────
  header("Step 4: Saving Configuration");

  const jwtSecret = Array.from(
    { length: 48 },
    () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[
      Math.floor(Math.random() * 62)
    ]
  ).join("");

  const envContent = `# Server
DATABASE_URL=${databaseUrl}
GITHUB_CLIENT_ID=${githubClientId}
GITHUB_CLIENT_SECRET=${githubClientSecret}
JWT_SECRET=${jwtSecret}
PORT=3000

# Client
SQUADS_SERVER_URL=http://localhost:3000
`;

  writeFileSync(ENV_PATH, envContent);
  success("Saved .env file with generated JWT secret");

  // ─── Step 5: Test Connection ────────────────────────
  header("Step 5: Testing Connection");
  step(1, "Start the server:");
  info("pnpm server:dev");
  step(2, "In another terminal, test:");
  info("curl http://localhost:3000/health");
  console.log();

  // ─── Done ───────────────────────────────────────────
  console.log(`
${c.accent}${c.bold}
  ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
  ┃       ✦ ALL SET! ✦          ┃
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
${c.reset}
  ${c.peach}To start the server:${c.reset}
    pnpm server:dev

  ${c.peach}To launch the overlay:${c.reset}
    pnpm overlay

  ${c.peach}To add the MCP server to Claude Code:${c.reset}
    Add to ~/.claude.json or .mcp.json:

    ${c.dim}"squads": {
      "command": "node",
      "args": ["${ROOT}/dist/mcp-server.js"],
      "env": {
        "SQUADS_SERVER_URL": "http://localhost:3000"
      }
    }${c.reset}

  ${c.peach}Have fun squadding up! ✦${c.reset}
`);

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
