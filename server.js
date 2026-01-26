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
// Assignment tracking
let numNeurons = null; // learned from simulation state
let neuronLoad = []; // length = numNeurons, counts of connected controllers
let controllerAssignment = {}; // controllerId -> 1-based neuron index

function ensureNeuronCapacity(n) {
  if (typeof n !== "number" || n <= 0) return;
  if (numNeurons !== n) {
    numNeurons = n;
    const newLoad = new Array(numNeurons).fill(0);
    // Recount from existing assignments to be safe
    for (const cid of Object.keys(controllerAssignment)) {
      const idx = controllerAssignment[cid];
      if (idx >= 1 && idx <= numNeurons) {
        newLoad[idx - 1] += 1;
      }
    }
    neuronLoad = newLoad;
  } else if (neuronLoad.length !== numNeurons) {
    neuronLoad = new Array(numNeurons).fill(0);
    for (const cid of Object.keys(controllerAssignment)) {
      const idx = controllerAssignment[cid];
      if (idx >= 1 && idx <= numNeurons) {
        neuronLoad[idx - 1] += 1;
      }
    }
  }
}

function assignNeuronToController(controllerId) {
  if (!controllerId) return null;
  if (controllerAssignment[controllerId])
    return controllerAssignment[controllerId];
  if (!numNeurons || numNeurons <= 0) return null; // wait until we know
  if (!neuronLoad || neuronLoad.length !== numNeurons) {
    neuronLoad = new Array(numNeurons).fill(0);
  }
  // Find smallest load, then smallest index among those
  let minLoad = Infinity;
  for (let i = 0; i < numNeurons; i++) {
    if (neuronLoad[i] < minLoad) minLoad = neuronLoad[i];
  }
  let chosen = 0; // 0-based
  for (let i = 0; i < numNeurons; i++) {
    if (neuronLoad[i] === minLoad) {
      chosen = i;
      break;
    }
  }
  neuronLoad[chosen] += 1;
  const assigned = chosen + 1; // 1-based neuron numbering
  controllerAssignment[controllerId] = assigned;
  return assigned;
}

function notifyAssignment(controllerId) {
  const ws = controllers[controllerId];
  const assigned = controllerAssignment[controllerId];
  if (!ws || !assigned) return;
  ws.send(
    osc.writePacket({
      address: "/assignment/neuron",
      args: [{ type: "i", value: assigned }],
    }),
  );
}

function freeAssignmentFor(controllerId) {
  const assigned = controllerAssignment[controllerId];
  if (assigned && neuronLoad && neuronLoad.length >= assigned) {
    neuronLoad[assigned - 1] = Math.max(0, neuronLoad[assigned - 1] - 1);
  }
  delete controllerAssignment[controllerId];
}

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
        // If we already know number of neurons, assign immediately; otherwise we'll assign after first state
        if (numNeurons) {
          const assigned = assignNeuronToController(controllerId);
          if (assigned) notifyAssignment(controllerId);
        }
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
        // Learn neuron count from state length and ensure structures
        // Exclude the first arg (controllerId)
        ensureNeuronCapacity(oscMsg.args.length - 1);
        // Forward state to the controller (without controllerId)
        controllers[controllerId].send(
          osc.writePacket({
            address: oscMsg.address,
            args: oscMsg.args.slice(1),
          }),
        );
        // If not assigned yet, assign now that we know numNeurons
        if (!controllerAssignment[controllerId]) {
          const assigned = assignNeuronToController(controllerId);
          if (assigned) notifyAssignment(controllerId);
        }
        break;
      case "update":
        console.log("update", oscMsg);
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
      case "pulse":
        console.log("pulse", oscMsg);
        // Forward pulse to simulation and other controllers (same as update)
        controllerId = controllerWs2Id(ws);
        if (simulationWs == null) return; // no simulation is registered
        simulationWs.send(osc.writePacket(oscMsg));
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
      freeAssignmentFor(controllerId);
      console.log(`Controller ${controllerId} disconnected`);
    }
  });
});

function controllerWs2Id(controllerWs) {
  for (let controller of Object.keys(controllers))
    if (controllers[controller] == controllerWs) return controller;
  return null;
}
