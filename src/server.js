import express from "express";
import cors from "cors";
import { createServer } from "http";
import { createStatesRouter } from "./routes/states.js";
import { createAuthRouter } from "./routes/auth.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createHistoryRouter } from "./routes/history.js";
import {
  createSocketServer,
  registerSocketHandlers,
} from "./sockets/socketServer.js";
//import { actualState, stateEmitter } from "../backend_homeassistant.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
//app.use("/api/states", createStatesRouter({ actualState }));
app.use("/api/auth", createAuthRouter());
app.use("/api/settings", createSettingsRouter());
app.use("/api/notifications", createNotificationsRouter());
app.use("/api/history", createHistoryRouter());

const httpServer = createServer(app);
//const io = createSocketServer(httpServer);
//registerSocketHandlers(io, actualState, stateEmitter);

const PORT = 5000;
httpServer.listen(PORT, () =>
  console.log(`server is running at the PORT ${PORT}`),
);
