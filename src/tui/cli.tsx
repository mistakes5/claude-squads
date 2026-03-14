import React from "react";
import { render } from "ink";
import { io as ioClient } from "socket.io-client";

import { App } from "./app.js";
import { loadToken, loadSettings, getServerUrl } from "../shared/config.js";
import { login } from "../shared/auth.js";

async function main() {
  // Load env from .env file if present
  try {
    // @ts-ignore — dotenv is optional
    const { config } = await import("dotenv");
    config();
  } catch {
    // dotenv not available, rely on environment variables
  }

  let token = loadToken();

  // If not logged in, start OAuth flow
  if (!token) {
    console.log("Welcome to Squads! Let's log you in with GitHub...\n");
    try {
      const user = await login();
      token = loadToken();
      if (!token) throw new Error("Login succeeded but no token saved");
      console.log(`\nLogged in as ${user.github_username}!\n`);
    } catch (err: any) {
      console.error("Login failed:", err.message);
      process.exit(1);
    }
  }

  const settings = loadSettings();

  // Connect to server via Socket.io
  const socket = ioClient(getServerUrl(), {
    auth: { token: token.access_token },
    reconnection: true,
    reconnectionDelay: 2000,
  });

  render(
    <App
      socket={socket}
      token={token}
      initialMode={settings.overlay_mode}
    />
  );
}

main().catch((err) => {
  console.error("Squads crashed:", err.message);
  process.exit(1);
});
