const http = require("http"),
  WebSocket = require("ws"),
  osc = require("osc"),
  express = require("express"),
  fs = require("fs"),
  path = require("path");

const { SimulationRunner } = require("./simulation/simulation");

const app = express();
const server = http.createServer(app);

app.use(express.static("public"));

// ── Parse CLI arguments ────────────────────────────────────────────────────

const args = process.argv.slice(2);
let cliHost = null;
let cliStateFile = null;
let cliNeurons = null;
let cliAutosave = false;
let cliAutosavePath = null;
let cliAutosaveDelay = 750;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--ip" || args[i] === "--host") && args[i + 1]) {
    cliHost = args[i + 1];
    i++;
  }
  if (args[i] === "--state" && args[i + 1]) {
    cliStateFile = args[i + 1];
    i++;
  }
  if (args[i] === "--neurons" && args[i + 1]) {
    cliNeurons = parseInt(args[i + 1], 10);
    i++;
  }
  if (args[i] === "--autosave") {
    cliAutosave = true;
  }
  if (args[i] === "--autosave-path" && args[i + 1]) {
    cliAutosavePath = args[i + 1];
    i++;
  }
  if (args[i] === "--autosave-delay" && args[i + 1]) {
    const parsedDelay = parseInt(args[i + 1], 10);
    if (!Number.isNaN(parsedDelay) && parsedDelay >= 0) {
      cliAutosaveDelay = parsedDelay;
    }
    i++;
  }
}

// ── Load configuration ─────────────────────────────────────────────────────

let config = {
  maxControllers: 4,
  wsUrl: "ws://localhost:9000",
  controllerAssignmentMode: "sequential",
};
try {
  const configPath = path.join(__dirname, "config.json");
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.maxControllers === "number" && parsed.maxControllers > 0) {
      config.maxControllers = parsed.maxControllers;
    }
    if (parsed && typeof parsed.wsUrl === "string" && parsed.wsUrl.length > 0) {
      config.wsUrl = parsed.wsUrl;
    }
    if (
      parsed &&
      typeof parsed.controllerAssignmentMode === "string" &&
      ["sequential", "random"].includes(
        parsed.controllerAssignmentMode.toLowerCase(),
      )
    ) {
      config.controllerAssignmentMode =
        parsed.controllerAssignmentMode.toLowerCase();
    }
    if (parsed && parsed.oscForward) {
      config.oscForward = parsed.oscForward;
    }
    if (parsed && typeof parsed.httpPort === "number") {
      config.httpPort = parsed.httpPort;
    }
    if (parsed && typeof parsed.wsPort === "number") {
      config.wsPort = parsed.wsPort;
    }
    if (parsed && typeof parsed.numNeurons === "number") {
      config.numNeurons = parsed.numNeurons;
    }
  }
} catch (err) {
  console.warn("Could not read config.json, using defaults. Error:", err);
}

if (cliHost) {
  const wsPort =
    typeof config.wsPort === "number" && config.wsPort > 0
      ? config.wsPort
      : 9000;
  config.wsUrl = `ws://${cliHost}:${wsPort}`;
  console.log(`Using CLI-provided host: ${config.wsUrl}`);
}

const HTTP_PORT =
  typeof config.httpPort === "number" && config.httpPort > 0
    ? config.httpPort
    : 3000;
const WS_PORT =
  typeof config.wsPort === "number" && config.wsPort > 0 ? config.wsPort : 9000;

// ── Start HTTP server ──────────────────────────────────────────────────────

server.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on http://localhost:${HTTP_PORT}`);
});

// ── OSC UDP forwarding ─────────────────────────────────────────────────────

let oscUdpPort = null;
if (config.oscForward && config.oscForward.host && config.oscForward.port) {
  oscUdpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 0,
    remoteAddress: config.oscForward.host,
    remotePort: config.oscForward.port,
    metadata: true,
  });
  oscUdpPort.open();
  oscUdpPort.on("ready", () => {
    console.log(
      `OSC forwarding to ${config.oscForward.host}:${config.oscForward.port}`,
    );
  });
  oscUdpPort.on("error", (err) => {
    console.error("OSC UDP error:", err);
  });
}

// ── Create & start the server-side simulation ──────────────────────────────

const numNeurons = cliNeurons || config.numNeurons || 12;
const sim = new SimulationRunner({
  numNeurons,
  frameRate: 60,
  stateFile: cliStateFile || null,
});

// ── Autosave (optional) ───────────────────────────────────────────────────

const autosaveEnabled = cliAutosave;
const autosavePath =
  cliAutosavePath || path.join(__dirname, "state_dump.json");
const autosaveDelay = cliAutosaveDelay;
let autosaveTimer = null;

function scheduleAutosave() {
  if (!autosaveEnabled) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      sim.saveStateFile(autosavePath);
    } catch (e) {
      console.error("Autosave failed:", e.message);
    }
  }, autosaveDelay);
}

// ── Client tracking ────────────────────────────────────────────────────────

let controllers = {}; // { controllerId: ws }
let adminPanels = {}; // { adminId: ws }
let visualClients = {}; // { visualId: ws }   (browser renderers)
let monitorWs = null;
let clientActivity = {};

// ── Neuron assignment (for controllers) ────────────────────────────────────

let neuronLoad = new Array(sim.numNeurons).fill(0);
let controllerAssignment = {};

function assignNeuronToController(controllerId) {
  if (!controllerId) return null;
  if (controllerAssignment[controllerId])
    return controllerAssignment[controllerId];
  if (neuronLoad.length !== sim.numNeurons) {
    neuronLoad = new Array(sim.numNeurons).fill(0);
  }
  let minLoad = Infinity;
  for (let i = 0; i < sim.numNeurons; i++) {
    if (neuronLoad[i] < minLoad) minLoad = neuronLoad[i];
  }
  const candidates = [];
  for (let i = 0; i < sim.numNeurons; i++) {
    if (neuronLoad[i] === minLoad) {
      candidates.push(i);
    }
  }
  let chosen = 0;
  if (candidates.length > 0) {
    if (config.controllerAssignmentMode === "random") {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      chosen = candidates[randomIndex];
    } else {
      chosen = candidates[0];
    }
  }
  neuronLoad[chosen] += 1;
  const assigned = chosen + 1;
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
  if (assigned && neuronLoad.length >= assigned) {
    neuronLoad[assigned - 1] = Math.max(0, neuronLoad[assigned - 1] - 1);
  }
  delete controllerAssignment[controllerId];
}

// ── Broadcast helpers ──────────────────────────────────────────────────────

function sendOscTo(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(osc.writePacket(msg));
    } catch (e) {
      console.error("Error sending OSC:", e);
    }
  }
}

function rejectWsConnection(ws, reason) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(
        osc.writePacket({
          address: "/disconnect",
          args: [{ type: "s", value: reason }],
        }),
      );
    } catch (_) {}
  }
  try {
    ws.close();
  } catch (_) {}
}

/**
 * Send an OSC message to every connected client (controllers + admins +
 * visual clients), optionally excluding one sender.
 */
function broadcastToAll(msg, excludeWs) {
  const packet = osc.writePacket(msg);
  for (const id of Object.keys(controllers)) {
    const ws = controllers[id];
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try { ws.send(packet); } catch (_) { }
    }
  }
  for (const id of Object.keys(adminPanels)) {
    const ws = adminPanels[id];
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try { ws.send(packet); } catch (_) { }
    }
  }
  for (const id of Object.keys(visualClients)) {
    const ws = visualClients[id];
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try { ws.send(packet); } catch (_) { }
    }
  }
}

function broadcastToVisuals(msg) {
  const packet = osc.writePacket(msg);
  for (const id of Object.keys(visualClients)) {
    const ws = visualClients[id];
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(packet); } catch (_) { }
    }
  }
}

// ── Wire simulation events ─────────────────────────────────────────────────

sim.on("spike", (neuronId) => {
  // Broadcast spike to all visual clients + controllers + admins
  broadcastToAll({
    address: `/server/spike/${neuronId}`,
    args: [],
  });

  // Forward /pulse to external OSC
  if (oscUdpPort) {
    try {
      oscUdpPort.send({
        address: "/pulse",
        args: [{ type: "i", value: neuronId }],
      });
    } catch (e) {
      console.error("Error forwarding spike to OSC:", e);
    }
  }
});

sim.on("dc", ({ id, value }) => {
  if (typeof id !== "number" || typeof value !== "number") return;
  broadcastToAll({
    address: "/server/neuron",
    args: [
      { type: "i", value: id },
      { type: "f", value },
    ],
  });
});

sim.on("voltages", (voltages) => {
  // Build OSC message with all Vnorm values — only visual clients need this
  const args = voltages.map((v) => ({ type: "f", value: v }));
  broadcastToVisuals({
    address: "/server/voltages",
    args,
  });
});

// ── Start simulation loop ──────────────────────────────────────────────────

sim.start();

// ── WebSocket server ───────────────────────────────────────────────────────

const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`WebSocket server on port ${WS_PORT}`);

// ── HTTP API ───────────────────────────────────────────────────────────────

app.get("/api/controller/check", (req, res) => {
  const controllerId = req.query.controllerId;
  const current = Object.keys(controllers).length;
  const max = config.maxControllers ?? 4;
  const isReconnecting = controllerId && controllers[controllerId];
  const allowed = isReconnecting || current < max;
  res.json({ current, max, allowed });
});

app.get("/api/config", (req, res) => {
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

app.get("/api/clients", (req, res) => {
  const clientsData = {};

  // The simulation is always running (server-side)
  clientsData["simulation"] = {
    type: "Simulation (server)",
    running: sim.running,
    neurons: sim.numNeurons,
  };

  // Visual clients
  Object.keys(visualClients).forEach((vid) => {
    clientsData[vid] = {
      type: "Visual",
      lastActivity: clientActivity[vid] || null,
    };
  });

  // Controllers
  Object.keys(controllers).forEach((cid) => {
    clientsData[cid] = {
      type: "Controller",
      assignment: controllerAssignment[cid] || null,
      lastActivity: clientActivity[cid] || null,
    };
  });

  // Admin panels
  Object.keys(adminPanels).forEach((aid) => {
    clientsData[aid] = {
      type: "Admin",
      lastActivity: clientActivity[aid] || null,
    };
  });

  res.json({
    clients: clientsData,
    hasSimulation: sim.running,
    controllerCount: Object.keys(controllers).length,
    adminCount: Object.keys(adminPanels).length,
    visualCount: Object.keys(visualClients).length,
    totalClients: Object.keys(clientsData).length,
  });
});

const disconnection_string = "Desconectado por el servidor. \nEspera un minuto antes de recargar.";

app.delete("/api/clients/:id", (req, res) => {
  const clientId = req.params.id;

  if (controllers[clientId]) {
    const ws = controllers[clientId];
    try {
      ws.send(
        osc.writePacket({
          address: "/disconnect",
          args: [
            {
              type: "s",
              value: disconnection_string,
            },
          ],
        }),
      );
    } catch (_) { }
    ws.close();
    freeAssignmentFor(clientId);
    delete controllers[clientId];
    delete clientActivity[clientId];
    return res.json({ success: true, message: "Controller disconnected" });
  }

  if (adminPanels[clientId]) {
    const ws = adminPanels[clientId];
    try {
      ws.send(
        osc.writePacket({
          address: "/disconnect",
          args: [
            {
              type: "s",
              value: disconnection_string,
            },
          ],
        }),
      );
    } catch (_) { }
    ws.close();
    delete adminPanels[clientId];
    delete clientActivity[clientId];
    return res.json({ success: true, message: "Admin panel disconnected" });
  }

  if (visualClients[clientId]) {
    visualClients[clientId].close();
    delete visualClients[clientId];
    delete clientActivity[clientId];
    return res.json({ success: true, message: "Visual client disconnected" });
  }

  res.status(404).json({ success: false, message: "Client not found" });
});

// Save / Load simulation state via HTTP
app.post("/api/state/save", express.json(), (req, res) => {
  try {
    const filePath =
      (req.body && req.body.path) ||
      path.join(__dirname, "state_dump.json");
    sim.saveStateFile(filePath);
    res.json({ success: true, path: filePath });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/state/load", express.json(), (req, res) => {
  try {
    const filePath =
      (req.body && req.body.path) ||
      path.join(__dirname, "state_dump.json");
    const wasRunning = sim.running;
    if (wasRunning) sim.stop();
    sim.loadStateFile(filePath);
    if (wasRunning) sim.start();
    // Notify all connected clients with fresh init
    sendInitToAllVisuals();
    res.json({ success: true, neurons: sim.numNeurons });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Helper: send init state to all visual clients ──────────────────────────

function sendInitToAllVisuals() {
  const initData = sim.getInitState();
  for (const vid of Object.keys(visualClients)) {
    sendOscTo(visualClients[vid], {
      address: "/server/init",
      args: [
        { type: "s", value: vid },
        { type: "s", value: JSON.stringify(initData) },
      ],
    });
  }
}

// ── WebSocket connection handling ──────────────────────────────────────────

wss.on("connection", (ws) => {
  const oscPort = new osc.WebSocketPort({ socket: ws, metadata: true });

  oscPort.on("message", (oscMsg) => {
    const addressParts = oscMsg.address.split("/");
    const prefix = addressParts[1];

    // ── Track activity for monitor ──────────────────────────────────────
    let activeClientId = null;
    const cid = controllerWs2Id(ws);
    const aid = adminWs2Id(ws);
    const vid = visualWs2Id(ws);
    if (cid) { clientActivity[cid] = Date.now(); activeClientId = cid; }
    else if (aid) { clientActivity[aid] = Date.now(); activeClientId = aid; }
    else if (vid) { clientActivity[vid] = Date.now(); activeClientId = vid; }

    if (activeClientId && monitorWs && monitorWs.readyState === WebSocket.OPEN) {
      try {
        monitorWs.send(
          osc.writePacket({
            address: "/activity",
            args: [{ type: "s", value: activeClientId }],
          }),
        );
      } catch (_) { }
    }

    // ── Route by prefix ─────────────────────────────────────────────────

    switch (prefix) {
      // ── Visual client registration ────────────────────────────────────
      case "registerVisual": {
        const visualId =
          (oscMsg.args && oscMsg.args[0] && oscMsg.args[0].value) ||
          "visual-" + Math.random().toString(36).substring(2, 8);
        visualClients[visualId] = ws;
        clientActivity[visualId] = Date.now();
        console.log(`Visual client connected: ${visualId}`);

        // Send full init state
        const initData = sim.getInitState();
        sendOscTo(ws, {
          address: "/server/init",
          args: [
            { type: "s", value: visualId },
            { type: "s", value: JSON.stringify(initData) },
          ],
        });
        break;
      }

      // ── Backward compat: treat registerSimulation as registerVisual ───
      case "registerSimulation": {
        const visualId = "visual-sim-" + Math.random().toString(36).substring(2, 8);
        visualClients[visualId] = ws;
        clientActivity[visualId] = Date.now();
        console.log(`Visual client (legacy registerSimulation) connected: ${visualId}`);

        const initData = sim.getInitState();
        sendOscTo(ws, {
          address: "/server/init",
          args: [
            { type: "s", value: visualId },
            { type: "s", value: JSON.stringify(initData) },
          ],
        });
        break;
      }

      // ── Monitor ───────────────────────────────────────────────────────
      case "connectMonitor":
        monitorWs = ws;
        console.log("Monitor connected");
        break;

      // ── Admin panel ───────────────────────────────────────────────────
      case "connectAdmin": {
        const connectAdminId = oscMsg.args[0].value;
        adminPanels[connectAdminId] = ws;
        clientActivity[connectAdminId] = Date.now();

        // Get state from SimulationRunner for this admin.
        // Use "admin-" prefix so _buildStateMessages sends weights & syntypes.
        const stateMessages = sim.handleMessage({
          address: "/getState",
          args: [{ type: "s", value: "admin-" + connectAdminId }],
        });
        for (const msg of stateMessages) {
          sendOscTo(ws, msg);
        }

        console.log(`Admin panel connected: ${connectAdminId}`);
        break;
      }

      // ── Controller ────────────────────────────────────────────────────
      case "connectController": {
        const controllerId = oscMsg.args[0].value;
        const current = Object.keys(controllers).length;
        const max = config.maxControllers ?? 4;
        const isReconnecting = !!controllers[controllerId];
        if (!isReconnecting && current >= max) {
          console.log(
            `Connection denied for controller ${controllerId}: capacity (${current}/${max})`,
          );
          rejectWsConnection(
            ws,
            "Máximo número de controladores alcanzado. Intenta reconectar más tarde.",
          );
          return;
        }
        controllers[controllerId] = ws;
        clientActivity[controllerId] = Date.now();

        // Assign neuron
        const assigned = assignNeuronToController(controllerId);
        if (assigned) notifyAssignment(controllerId);

        // Send current state from SimulationRunner
        const stateMessages = sim.handleMessage({
          address: "/getState",
          args: [{ type: "s", value: controllerId }],
        });
        for (const msg of stateMessages) {
          sendOscTo(ws, msg);
        }

        console.log(`Controller connected: ${controllerId}`);
        break;
      }

      // ── Parameter updates from controllers / admins ───────────────────
      case "update":
      case "client": {
        const senderId = controllerWs2Id(ws) || adminWs2Id(ws);
        if (!senderId) {
          console.log(
            `Ignoring ${prefix} from unregistered socket: ${oscMsg.address}`,
          );
          rejectWsConnection(
            ws,
            "Conexión no registrada. Recarga el controlador e inténtalo de nuevo.",
          );
          return;
        }
        console.log(`${prefix}`, oscMsg.address, JSON.stringify(oscMsg.args));

        // Apply to server-side simulation — get back broadcast messages
        const broadcasts = sim.handleMessage(oscMsg);

        if (broadcasts && broadcasts.length > 0) {
          scheduleAutosave();
        }

        // Broadcast resulting /server/* messages to ALL clients (including
        // the sender).  The simulation generates derived values server-side
        // (e.g. individual random weights from weight_mean), so the sender
        // needs them too.  Simple echo-backs are idempotent and harmless.
        for (const msg of broadcasts) {
          broadcastToAll(msg);
        }

        // Forward dc/neuron updates to external OSC
        if (
          oscUdpPort &&
          (oscMsg.address.includes("/dc") ||
            oscMsg.address.includes("/neuron"))
        ) {
          try {
            let forwardMsg = oscMsg;
            if (oscMsg.address.includes("/neuron")) {
              forwardMsg = { address: "/dc", args: oscMsg.args };
            }
            oscUdpPort.send(forwardMsg);
          } catch (e) {
            console.error("Error forwarding OSC:", e);
          }
        }
        break;
      }

      // ── Pulse from external / legacy ──────────────────────────────────
      case "pulse": {
        if (oscUdpPort) {
          try { oscUdpPort.send(oscMsg); } catch (_) { }
        }
        break;
      }

      // ── Explicit getState request (admin sends this after connectAdmin) ─
      case "getState": {
        const requesterId = oscMsg.args?.[0]?.value;
        if (requesterId) {
          const stateMessages = sim.handleMessage(oscMsg);
          for (const msg of stateMessages) {
            sendOscTo(ws, msg);
          }
        }
        break;
      }

      // ── Legacy: browser sim used to send /state/* and /server/* ────────
      case "state":
      case "server":
        break;
    }
  });

  // ── Connection close ──────────────────────────────────────────────────
  ws.on("close", () => {
    if (monitorWs === ws) {
      monitorWs = null;
      console.log("Monitor disconnected");
      return;
    }

    const cid = controllerWs2Id(ws);
    if (cid) {
      delete controllers[cid];
      delete clientActivity[cid];
      freeAssignmentFor(cid);
      console.log(`Controller ${cid} disconnected`);
      notifyMonitorDisconnect(cid);
      return;
    }

    const aid = adminWs2Id(ws);
    if (aid) {
      delete adminPanels[aid];
      delete clientActivity[aid];
      console.log(`Admin panel ${aid} disconnected`);
      notifyMonitorDisconnect(aid);
      return;
    }

    const vid = visualWs2Id(ws);
    if (vid) {
      delete visualClients[vid];
      delete clientActivity[vid];
      console.log(`Visual client ${vid} disconnected`);
      notifyMonitorDisconnect(vid);
    }
  });
});

// ── Utility functions ──────────────────────────────────────────────────────

function controllerWs2Id(targetWs) {
  for (const id of Object.keys(controllers))
    if (controllers[id] === targetWs) return id;
  return null;
}

function adminWs2Id(targetWs) {
  for (const id of Object.keys(adminPanels))
    if (adminPanels[id] === targetWs) return id;
  return null;
}

function visualWs2Id(targetWs) {
  for (const id of Object.keys(visualClients))
    if (visualClients[id] === targetWs) return id;
  return null;
}

function notifyMonitorDisconnect(clientId) {
  if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
    try {
      monitorWs.send(
        osc.writePacket({
          address: "/clientDisconnected",
          args: [{ type: "s", value: clientId }],
        }),
      );
    } catch (_) { }
  }
}
