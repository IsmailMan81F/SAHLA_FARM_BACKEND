import "./env.js";
import express from "express";
import cors from "cors";
import { createServer } from "http";

import { createStatesRouter } from "./routes/farm.js";
import { createAuthRouter } from "./routes/auth.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createHistoryRouter } from "./routes/history.js";

import {
  createSocketServer,
  registerSocketHandlers,
  setCredentialsProvider,
} from "./sockets/front_back_manager.js";

import {
  getCredentials,
  authenticateClient,
} from "./services/homeassistantService.js";

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS APP
// ─────────────────────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));

// ─── REST API routes ──────────────────────────────────────────────────────────
app.use("/api/farm", createStatesRouter());
app.use("/api/auth", createAuthRouter());
app.use("/api/settings", createSettingsRouter());
app.use("/api/notifications", createNotificationsRouter());
app.use("/api/history", createHistoryRouter());

// ─────────────────────────────────────────────────────────────────────────────
// HTTP + SOCKET.IO SERVER
// ─────────────────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const io = createSocketServer(httpServer);

// Inject the DB credentials provider into the HA connection manager
setCredentialsProvider(getCredentials);

// Register all socket.io connection and event handlers
registerSocketHandlers(io, authenticateClient);

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`[Server] Running at http://localhost:${PORT}`);
});
