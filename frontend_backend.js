import express from "express";
import cors from "cors";     
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";
import { actualState, stateEmitter } from "./backend_homeassistant.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("Frontend client connected:", socket.id);
  socket.emit("homeassistant_state", actualState);
  
  socket.on("disconnect", () => {
    console.log("Frontend client disconnected:", socket.id);
  });
});

// Listen for state changes from Home Assistant and broadcast to all connected clients
stateEmitter.on("state_update", (update) => {
  const eventName = {
    crop: "crop_changed",
    sensors: "sensor_changed",
    actuators: "actuator_changed",
    warnings: "warning_changed",
    recommendation: "recommendation_changed",
    initial_state: "initial_state",
  }[update.field] || "state_changed";

  io.emit(eventName, update);
  console.log(`State change emitted to clients: ${eventName}`, update.field);
});

const SUPABASE_URL = "https://idyfxzvhpeusxwzvxkmh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NEk5XPA4DDrCbFOiyqE4bQ_EQZkhJGo";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



async function verifyJwtToken(token) {
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user?.id) {
    return null;
  }

  return data.user;
}

app.get("/api/states", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : req.query.token;

  if (!token) {
    return res.status(401).json({ error: "Authorization token is required" });
  }

  try {
    const user = await verifyJwtToken(token);

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    return res.json(actualState);
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(500).json({ error: "Failed to verify token" });
  }
});

const PORT = 5000;
httpServer.listen(PORT, () => console.log(`server is running at the PORT ${PORT}`));
