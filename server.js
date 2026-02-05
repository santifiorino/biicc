const http = require("http"),
  WebSocket = require("ws"),
  osc = require("osc"),
  express = require("express"),
  fs = require("fs"),
  path = require("path");

const app = express();
const server = http.createServer(app);

app.use(express.static("public"));

// Parse CLI arguments
const args = process.argv.slice(2);
let cliHost = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--ip" || args[i] === "--host") && args[i + 1]) {
    cliHost = args[i + 1];
    i++;
  }
}

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
    if (parsed && parsed.oscForward) {
      config.oscForward = parsed.oscForward;
    }
    if (parsed && typeof parsed.httpPort === "number") {
      config.httpPort = parsed.httpPort;
    }
    if (parsed && typeof parsed.wsPort === "number") {
      config.wsPort = parsed.wsPort;
    }
  }
} catch (err) {
  console.warn("Could not read config.json, using defaults. Error:", err);
}

// Override wsUrl with CLI argument if provided
if (cliHost) {
  const wsPort = typeof config.wsPort === "number" && config.wsPort > 0 ? config.wsPort : 9000;
  config.wsUrl = `ws://${cliHost}:${wsPort}`;
  console.log(`Using CLI-provided host: ${config.wsUrl}`);
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

// Setup OSC UDP client for forwarding messages
let oscUdpPort = null;
if (config.oscForward && config.oscForward.host && config.oscForward.port) {
  oscUdpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 0, // Use any available port
    remoteAddress: config.oscForward.host,
    remotePort: config.oscForward.port,
    metadata: true
  });
  
  oscUdpPort.open();
  
  oscUdpPort.on("ready", () => {
    console.log(`OSC forwarding to ${config.oscForward.host}:${config.oscForward.port}`);
  });
  
  oscUdpPort.on("error", (err) => {
    console.error("OSC UDP error:", err);
  });
}

let simulationWs = null;
let controllers = {}; // { controllerId: controllerWs }
let adminPanels = {}; // { adminId: adminWs }
let monitorWs = null; // monitor WebSocket connection
let clientActivity = {}; // { clientId: lastActivityTimestamp }
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

// Monitor API: Get connected clients
app.get("/api/clients", (req, res) => {
  const clientsData = {};
  
  // Add simulation
  if (simulationWs) {
    clientsData['simulation'] = {
      type: 'Simulation',
      lastActivity: clientActivity['simulation'] || null
    };
  }
  
  // Add controllers
  Object.keys(controllers).forEach(cid => {
    clientsData[cid] = {
      type: 'Controller',
      assignment: controllerAssignment[cid] || null,
      lastActivity: clientActivity[cid] || null
    };
  });
  
  // Add admin panels
  Object.keys(adminPanels).forEach(aid => {
    clientsData[aid] = {
      type: 'Admin',
      lastActivity: clientActivity[aid] || null
    };
  });
  
  res.json({
    clients: clientsData,
    hasSimulation: !!simulationWs,
    controllerCount: Object.keys(controllers).length,
    adminCount: Object.keys(adminPanels).length,
    totalClients: Object.keys(clientsData).length
  });
});

// Monitor API: Disconnect a client
app.delete("/api/clients/:id", (req, res) => {
  const clientId = req.params.id;
  
  if (clientId === 'simulation' && simulationWs) {
    simulationWs.close();
    simulationWs = null;
    delete clientActivity['simulation'];
    res.json({ success: true, message: 'Simulation disconnected' });
  } else if (controllers[clientId]) {
    // Send disconnect notification to controller before closing
    const ws = controllers[clientId];
    try {
      ws.send(osc.writePacket({
        address: "/disconnect",
        args: [{ type: "s", value: "Desconectado por el servidor. Espera un minuto antes de recargar." }]
      }));
    } catch (e) {
      console.error('Error sending disconnect message:', e);
    }
    ws.close();
    freeAssignmentFor(clientId);
    delete controllers[clientId];
    delete clientActivity[clientId];
    res.json({ success: true, message: 'Controller disconnected' });
  } else if (adminPanels[clientId]) {
    // Send disconnect notification to admin panel before closing
    const ws = adminPanels[clientId];
    try {
      ws.send(osc.writePacket({
        address: "/disconnect",
        args: [{ type: "s", value: "Desconectado por el servidor. Espera un minuto antes de recargar." }]
      }));
    } catch (e) {
      console.error('Error sending disconnect message:', e);
    }
    ws.close();
    delete adminPanels[clientId];
    delete clientActivity[clientId];
    res.json({ success: true, message: 'Admin panel disconnected' });
  } else {
    res.status(404).json({ success: false, message: 'Client not found' });
  }
});

wss.on("connection", (ws) => {
  const oscPort = new osc.WebSocketPort({
    socket: ws,
    metadata: true,
  });

  oscPort.on("message", (oscMsg) => {
    let controllerId;
    const addressParts = oscMsg.address.split("/");
    
    // Track activity for monitor and broadcast to monitor WebSocket
    let activeClientId = null;
    if (ws === simulationWs) {
      clientActivity['simulation'] = Date.now();
      activeClientId = 'simulation';
      
      // Forward simulation messages to external OSC
      if (oscUdpPort && oscMsg.address === "/pulse") {
        try {
          console.log(`[OSC Forward] simulation -> ${config.oscForward.host}:${config.oscForward.port} | ${oscMsg.address} ${JSON.stringify(oscMsg.args)}`);
          oscUdpPort.send(oscMsg);
        } catch (e) {
          console.error("Error forwarding simulation pulse:", e);
        }
      }
    } else {
      controllerId = controllerWs2Id(ws);
      if (controllerId) {
        clientActivity[controllerId] = Date.now();
        activeClientId = controllerId;
      } else {
        const adminId = adminWs2Id(ws);
        if (adminId) {
          clientActivity[adminId] = Date.now();
          activeClientId = adminId;
        }
      }
    }
    
    // Broadcast activity to monitor
    if (activeClientId && monitorWs && monitorWs.readyState === WebSocket.OPEN) {
      try {
        monitorWs.send(osc.writePacket({
          address: "/activity",
          args: [{ type: "s", value: activeClientId }]
        }));
      } catch (e) {
        console.error('Error sending activity to monitor:', e);
      }
    }
    
    switch (addressParts[1]) {
      case "connectMonitor":
        monitorWs = ws;
        console.log('Monitor connected');
        break;
      case "registerSimulation":
        simulationWs = ws;
        clientActivity['simulation'] = Date.now();
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
      case "connectAdmin":
        if (simulationWs == null) return; // no simulation is registered
        const connectAdminId = oscMsg.args[0].value;
        adminPanels[connectAdminId] = ws;
        clientActivity[connectAdminId] = Date.now();
        // Send current state to admin panel
        simulationWs.send(
          osc.writePacket({
            address: "/getState",
            args: [{ type: "s", value: connectAdminId }],
          }),
        );
        console.log(`Connected admin panel ${connectAdminId}`);
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
        clientActivity[controllerId] = Date.now();
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
        // Forward state to the controller or admin (without controllerId)
        const targetWs = controllers[controllerId] || adminPanels[controllerId];
        if (targetWs) {
          targetWs.send(
            osc.writePacket({
              address: oscMsg.address,
              args: oscMsg.args.slice(1),
            }),
          );
        }
        // If it's a controller and not assigned yet, assign now that we know numNeurons
        if (controllers[controllerId] && !controllerAssignment[controllerId]) {
          const assigned = assignNeuronToController(controllerId);
          if (assigned) notifyAssignment(controllerId);
        }
        break;
      case "update":
        console.log("update", oscMsg);
        // Send the update to the simulation
        controllerId = controllerWs2Id(ws);
        const updateAdminId = adminWs2Id(ws);
        const senderId = controllerId || updateAdminId;
        if (simulationWs == null) return; // no simulation is registered
        simulationWs.send(osc.writePacket(oscMsg));
        
        // Forward dc updates to external OSC
        if (oscUdpPort && oscMsg.address.includes("/dc")) {
          try {
            console.log(`[OSC Forward] ${senderId || 'unknown'} -> ${config.oscForward.host}:${config.oscForward.port} | ${oscMsg.address} ${JSON.stringify(oscMsg.args)}`);
            oscUdpPort.send(oscMsg);
          } catch (e) {
            console.error("Error forwarding OSC message:", e);
          }
        }
        
        // Send the update to all other controllers
        for (let controller of Object.keys(controllers)) {
          if (controller == senderId) continue;
          controllers[controller].send(osc.writePacket(oscMsg));
        }
        // Send the update to all admin panels
        for (let admin of Object.keys(adminPanels)) {
          if (admin == senderId) continue;
          adminPanels[admin].send(osc.writePacket(oscMsg));
        }
        break;
      case "pulse":
        console.log("pulse", oscMsg);
        // Forward pulse to simulation and other controllers (same as update)
        controllerId = controllerWs2Id(ws);
        const pulseAdminId = adminWs2Id(ws);
        const pulseSenderId = controllerId || pulseAdminId;
        if (simulationWs == null) return; // no simulation is registered
        simulationWs.send(osc.writePacket(oscMsg));
        
        // Forward pulse to external OSC
        if (oscUdpPort) {
          try {
            console.log(`[OSC Forward] ${pulseSenderId || 'unknown'} -> ${config.oscForward.host}:${config.oscForward.port} | ${oscMsg.address} ${JSON.stringify(oscMsg.args)}`);
            oscUdpPort.send(oscMsg);
          } catch (e) {
            console.error("Error forwarding pulse message:", e);
          }
        }
        
        for (let controller of Object.keys(controllers)) {
          if (controller == pulseSenderId) continue;
          controllers[controller].send(osc.writePacket(oscMsg));
        }
        for (let admin of Object.keys(adminPanels)) {
          if (admin == pulseSenderId) continue;
          adminPanels[admin].send(osc.writePacket(oscMsg));
        }
        break;
        if (simulationWs == null) return; // no simulation is registered
        simulationWs.send(osc.writePacket(oscMsg));
        for (let controller of Object.keys(controllers)) {
          if (controller == pulseSenderId) continue;
          controllers[controller].send(osc.writePacket(oscMsg));
        }
        for (let admin of Object.keys(adminPanels)) {
          if (admin == pulseSenderId) continue;
          adminPanels[admin].send(osc.writePacket(oscMsg));
        }
        break;
    }
  });

  ws.on("close", () => {
    if (monitorWs == ws) {
      monitorWs = null;
      console.log(`Monitor disconnected`);
      return;
    }
    if (simulationWs == ws) {
      simulationWs = null;
      delete clientActivity['simulation'];
      console.log(`Simulation disconnected`);
      // Notify monitor of simulation disconnect
      if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
        try {
          monitorWs.send(osc.writePacket({
            address: "/clientDisconnected",
            args: [{ type: "s", value: "simulation" }]
          }));
        } catch (e) {
          console.error('Error notifying monitor of simulation disconnect:', e);
        }
      }
      return;
    }
    const controllerId = controllerWs2Id(ws);
    if (controllerId) {
      delete controllers[controllerId];
      delete clientActivity[controllerId];
      freeAssignmentFor(controllerId);
      console.log(`Controller ${controllerId} disconnected`);
      // Notify monitor of controller disconnect
      if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
        try {
          monitorWs.send(osc.writePacket({
            address: "/clientDisconnected",
            args: [{ type: "s", value: controllerId }]
          }));
        } catch (e) {
          console.error('Error notifying monitor of controller disconnect:', e);
        }
      }
      return;
    }
    const adminId = adminWs2Id(ws);
    if (adminId) {
      delete adminPanels[adminId];
      delete clientActivity[adminId];
      console.log(`Admin panel ${adminId} disconnected`);
      // Notify monitor of admin panel disconnect
      if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
        try {
          monitorWs.send(osc.writePacket({
            address: "/clientDisconnected",
            args: [{ type: "s", value: adminId }]
          }));
        } catch (e) {
          console.error('Error notifying monitor of admin disconnect:', e);
        }
      }
    }
  });
});

function controllerWs2Id(controllerWs) {
  for (let controller of Object.keys(controllers))
    if (controllers[controller] == controllerWs) return controller;
  return null;
}

function adminWs2Id(adminWs) {
  for (let admin of Object.keys(adminPanels))
    if (adminPanels[admin] == adminWs) return admin;
  return null;
}
