import express from "express";
import { actualState } from "./backend_homeassistant.js";
const app = express();

app.use(express.json());

app.use("/api/states", (req, res) => {
  res.json(actualState)
});

const PORT = 5000;

app.listen(PORT, () => console.log(`server is running at the PORT ${PORT}`));
