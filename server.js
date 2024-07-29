const http = require('http'),
      WebSocket = require('ws'),
      osc = require('osc'),
      express = require('express');

const app = express();
const server = http.createServer(app);
const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  }
);

app.use(express.static('public'));

let simulations = {}; // { simulationId: simulationWs }
let controllers = {}; // { controllerId: controllerWs }
let connections = {}; // { controllerId: simulationId }

const wss = new WebSocket.Server({ port: 9000 });

wss.on('connection', (ws) => {
    const oscPort = new osc.WebSocketPort({
        socket: ws,
        metadata: true
    });

    oscPort.on('message', (oscMsg) => {
        let simId;
        let controllerId;
        switch (oscMsg.address) {
            case '/registerSimulation':
                simId = oscMsg.args[0].value;
                simulations[simId] = ws;
                console.log(`Registered simulation ${simId}`);
                break;
            case '/connectController':
                simId = oscMsg.args[0].value;
                if (!simulations[simId]) return; // sim is not registered
                controllerId = oscMsg.args[1].value;
                controllers[controllerId] = ws;
                connections[controllerId] = simId;
                // get sim state to later update controller's state
                simulations[simId].send(osc.writePacket({
                    address: "/getState",
                    args: []
                }));
                console.log(`Connected controller ${controllerId} to simulation ${simId}`);
                break;
            case '/getState':
                simId = simWs2Id(ws);
                sendSimStateToControllers(simId, {
                    address: "/getState",
                    args: oscMsg.args
                });
                break;
            case '/update':
                controllerId = controllerWs2Id(ws);
                sendUpdateMessage(controllerId, oscMsg);
                break;
        }
    });

    ws.on('close', () => {
        const simId = simWs2Id(ws);
        const controllerId = controllerWs2Id(ws);
        if (controllerId) {
            delete controllers[controllerId];
            if (connections[controllerId]) {
                delete connections[controllerId];
            }
        } else {
            delete simulations[simId];
        }
    });
});

function sendUpdateMessage(controllerId, oscMsg) {
    const simId = connections[controllerId];
    const simWs = simulations[simId];
    if (!simWs) return; // it's connected to a closed sim
    simWs.send(osc.writePacket(oscMsg));
    sendUpdateToAllControllers(controllerId, oscMsg);
}

/** Sends oscMsg to every controller connected to the same simulation of fromControllerId */
function sendUpdateToAllControllers(fromControllerId, oscMsg) {
    const simId = connections[fromControllerId];
    for (let controllerId of getControllersConnectedToSim(simId))
        if (controllerId != fromControllerId)
            controllers[controllerId].send(osc.writePacket(oscMsg));
}

/** Sends oscMsg to every controller connected to simId */
function sendSimStateToControllers(simId, oscMsg) {
    for (let controllerId of getControllersConnectedToSim(simId)){
        controllers[controllerId].send(osc.writePacket(oscMsg));
    }
}

function getControllersConnectedToSim(simId) {
    return Object.keys(connections).filter(key => connections[key] == simId);
}

function controllerWs2Id(controllerWs) {
    for (let controller of Object.keys(controllers))
        if (controllers[controller] == controllerWs)
            return controller
    return null;
}

function simWs2Id(simWs) {
    for (const simId of Object.keys(simulations)) {
        if (simulations[simId] === simWs) {
            return simId;
        }
    }
    return null;
}