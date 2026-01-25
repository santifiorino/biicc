const http = require("http"),
  WebSocket = require("ws"),
  osc = require("osc"),
  express = require("express"),
  fs = require("fs"),
  path = require("path");

const app = express();
const server = http.createServer(app);

app.use(express.static("public"));

// Load configuration
let config = { maxControllers: 4, wsUrl: "ws://localhost:9000" };
try {
  const configPath = path.join(__dirname, "config.json");
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.maxControllers === "number" &&
      parsed.maxControllers > 0
    ) {
      config.maxControllers = parsed.maxControllers;
    }
    if (parsed && typeof parsed.wsUrl === "string" && parsed.wsUrl.length > 0) {
      config.wsUrl = parsed.wsUrl;
    }
  }
} catch (err) {
  console.warn("Could not read config.json, using defaults. Error:", err);
}

// Derive ports from config (fallbacks if not provided)
const HTTP_PORT =
  typeof config.httpPort === "number" && config.httpPort > 0
    ? config.httpPort
    : 3000;
const WS_PORT =
  typeof config.wsPort === "number" && config.wsPort > 0 ? config.wsPort : 9000;

server.listen(HTTP_PORT, () => {
  console.log(`Server is running on http://localhost:${HTTP_PORT}`);
});

let simulationWs = null;
let controllers = {}; // { controllerId: controllerWs }
const wss = new WebSocket.Server({ port: WS_PORT });

// Capacity check endpoint
app.get("/api/controller/check", (req, res) => {
  const controllerId = req.query.controllerId;
  const current = Object.keys(controllers).length;
  const max = config.maxControllers ?? 4;
  const isReconnecting = controllerId && controllers[controllerId];
  const allowed = isReconnecting || current < max;
  res.json({ current, max, allowed });
});

// Public config endpoint (exposes only non-sensitive values)
app.get("/api/config", (req, res) => {
  // Prefer explicit wsUrl from config; otherwise construct from request host and WS port
  const xfProto = req.headers["x-forwarded-proto"];
  const isSecure = req.protocol === "https" || xfProto === "https";
  const scheme = isSecure ? "wss" : "ws";
  const hostHeader = req.headers.host || "localhost";
  const hostname = hostHeader.split(":")[0];
  const computedWsUrl = `${scheme}://${hostname}:${WS_PORT}`;
  res.json({
    wsUrl: config.wsUrl || computedWsUrl,
    maxControllers: config.maxControllers,
    httpPort: HTTP_PORT,
    wsPort: WS_PORT,
  });
});

wss.on("connection", (ws) => {
  const oscPort = new osc.WebSocketPort({
    socket: ws,
    metadata: true,
  });

  oscPort.on("message", (oscMsg) => {
    let controllerId;
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
      case "registerSimulation":
        simulationWs = ws;
        console.log(
          `Updated current simulation (previous ones won't receive updates)`,
        );
        for (let controllerId of Object.keys(controllers)) {
          simulationWs.send(
            osc.writePacket({
              address: "/getState",
              args: [{ type: "s", value: controllerId }],
            }),
          );
        }
        break;
      case "connectController":
        if (simulationWs == null) return; // no simulation is registered
        controllerId = oscMsg.args[0].value;
        {
          const current = Object.keys(controllers).length;
          const max = config.maxControllers ?? 4;
          const isReconnecting = !!controllers[controllerId];
          const allowed = isReconnecting || current < max;
          if (!allowed) {
            console.log(
              `Connection denied for controller ${controllerId}: capacity reached (${current}/${max})`,
            );
            return;
          }
        }
        controllers[controllerId] = ws;
        // ask the simulation for its state for the controller to sync
        // TODO: since we now only have one simulation, now we might just store the state in the server
        simulationWs.send(
          osc.writePacket({
            address: "/getState",
            args: [{ type: "s", value: controllerId }],
          }),
        );
        console.log(`Connected controller ${controllerId} to simulation`);
        break;
      case "state":
        controllerId = oscMsg.args[0].value;
        controllers[controllerId].send(
          osc.writePacket({
            address: oscMsg.address,
            args: oscMsg.args.slice(1),
          }),
        );
        break;
      case "update":
        // Send the update to the simulation
        controllerId = controllerWs2Id(ws);
        if (simulationWs == null) return; // no simulation is registered
        simulationWs.send(osc.writePacket(oscMsg));
        // Send the update to all other controllers
        for (let controller of Object.keys(controllers)) {
          if (controller == controllerId) continue;
          controllers[controller].send(osc.writePacket(oscMsg));
        }
        break;
    }
  });

  ws.on("close", () => {
    if (simulationWs == ws) {
      simulationWs = null;
      console.log(`Simulation disconnected`);
      return;
    }
    const controllerId = controllerWs2Id(ws);
    if (controllerId) {
      delete controllers[controllerId];
      console.log(`Controller ${controllerId} disconnected`);
    }
  });
});

function controllerWs2Id(controllerWs) {
  for (let controller of Object.keys(controllers))
    if (controllers[controller] == controllerWs) return controller;
  return null;
}
