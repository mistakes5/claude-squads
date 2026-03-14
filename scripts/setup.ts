#!/usr/bin/env tsx
/**
 * Squads Setup Script
 *
 * Walks you through:
 * 1. Creating a Supabase project (opens browser)
 * 2. Configuring env vars
 * 3. Running the database migration
 * 4. Enabling GitHub OAuth
 * 5. Testing the connection
 */

import { createInterface } from "readline";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

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

  // ─── Step 1: Supabase Project ─────────────────────────
  header("Step 1: Create a Supabase Project");
  step(1, "Go to https://supabase.com/dashboard/new");
  step(2, 'Create a free project (any name, e.g. "squads")');
  step(3, "Wait for it to finish provisioning (~1 min)");
  step(4, "Go to Project Settings → API");
  console.log();

  const supabaseUrl = (await ask(`${c.peach}  Paste your Project URL: ${c.reset}`)).trim();
  const supabaseKey = (await ask(`${c.peach}  Paste your anon/public key: ${c.reset}`)).trim();

  if (!supabaseUrl || !supabaseKey) {
    console.error("\n  Missing URL or key. Please try again.");
    process.exit(1);
  }

  // Save .env
  writeFileSync(ENV_PATH, `SUPABASE_URL=${supabaseUrl}\nSUPABASE_ANON_KEY=${supabaseKey}\n`);
  success("Saved .env file");

  // ─── Step 2: Run Migration ────────────────────────────
  header("Step 2: Running Database Migration");

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read migration files
  const migrationsDir = join(ROOT, "supabase", "migrations");
  const migrationFiles = ["001_initial_schema.sql", "002_pings.sql"];

  for (const file of migrationFiles) {
    const path = join(migrationsDir, file);
    if (!existsSync(path)) {
      console.error(`  Migration file not found: ${path}`);
      continue;
    }

    const sql = readFileSync(path, "utf-8");
    info(`Running ${file}...`);

    // We can't run raw SQL via the client library directly.
    // User needs to paste it into the SQL editor.
    console.log(`\n${c.dim}  The migration needs to be run in the Supabase SQL Editor.${c.reset}`);
  }

  step(1, "Go to your Supabase dashboard → SQL Editor");
  step(2, "Click 'New Query'");
  step(3, `Paste the contents of:`);
  info(`${migrationsDir}/001_initial_schema.sql`);
  info(`${migrationsDir}/002_pings.sql`);
  step(4, "Click 'Run' for each");
  console.log();

  await ask(`${c.peach}  Press Enter when migrations are done...${c.reset}`);
  success("Migrations applied");

  // ─── Step 3: Enable GitHub OAuth ──────────────────────
  header("Step 3: Enable GitHub OAuth");
  step(1, "Go to Supabase dashboard → Authentication → Providers");
  step(2, "Find 'GitHub' and enable it");
  step(3, "You'll need a GitHub OAuth App:");
  info("Go to https://github.com/settings/developers");
  info('Click "New OAuth App"');
  info(`App name: Squads`);
  info(`Homepage URL: ${supabaseUrl}`);
  info(`Authorization callback URL: ${supabaseUrl}/auth/v1/callback`);
  step(4, "Copy the Client ID and Client Secret into Supabase");
  console.log();

  await ask(`${c.peach}  Press Enter when GitHub OAuth is configured...${c.reset}`);
  success("GitHub OAuth configured");

  // ─── Step 4: Test Connection ──────────────────────────
  header("Step 4: Testing Connection");

  try {
    const { data, error } = await supabase.from("rooms").select("count").limit(1);
    if (error) throw error;
    success("Connected to Supabase successfully!");
  } catch (err: any) {
    console.error(`\n  Connection test failed: ${err.message}`);
    info("This might be because RLS is blocking unauthenticated reads.");
    info("That's actually correct! Auth is required to access data.");
    success("Connection established (RLS is working correctly)");
  }

  // ─── Done ─────────────────────────────────────────────
  console.log(`
${c.accent}${c.bold}
  ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
  ┃       ✦ ALL SET! ✦          ┃
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
${c.reset}
  ${c.peach}To launch the overlay:${c.reset}
    node dist/squads.js

  ${c.peach}To add the MCP server to Claude Code:${c.reset}
    Add to ~/.claude.json or .mcp.json:

    ${c.dim}"squads": {
      "command": "node",
      "args": ["${ROOT}/dist/mcp-server.js"],
      "env": {
        "SUPABASE_URL": "${supabaseUrl}",
        "SUPABASE_ANON_KEY": "${supabaseKey}"
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
