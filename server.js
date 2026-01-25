const http = require("http"),
  WebSocket = require("ws"),
  osc = require("osc"),
  express = require("express");

const app = express();
const server = http.createServer(app);
const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.use(express.static("public"));

let simulationWs = null;
let controllers = {}; // { controllerId: controllerWs }
const wss = new WebSocket.Server({ port: 9000 });

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
