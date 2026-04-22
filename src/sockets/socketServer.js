import { Server } from "socket.io";

export function createSocketServer(httpServer) {
  return new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
}

export function registerSocketHandlers(io, actualState, stateEmitter) {
  io.on("connection", (socket) => {
    console.log("Frontend client connected:", socket.id);
    socket.emit("homeassistant_state", actualState);

    socket.on("disconnect", () => {
      console.log("Frontend client disconnected:", socket.id);
    });
  });

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
}
