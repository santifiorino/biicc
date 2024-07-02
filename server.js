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

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/snn', (req, res) => {
    res.sendFile(__dirname + '/public/simulation.html');
});

app.get('/controller', (req, res) => {
    res.sendFile(__dirname + '/public/controller/index.html');
});

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
        switch (oscMsg.address) {
            case '/registerSimulation':
                simId = oscMsg.args[0].value;
                simulations[simId] = ws;
                console.log(`Registered simulation ${simId}`);
                break;
            case '/connectController':
                simId = oscMsg.args[0].value;
                const controllerId = oscMsg.args[1].value;
                if (!simulations[simId]) return; // Simulation is not registered
                controllers[controllerId] = ws;
                connections[controllerId] = simId;
                simulations[simId].send(osc.writePacket({
                    address: "/getState",
                    args: []
                }));
                console.log(`Connected controller to simulation ${simId}`);
                break;
            case '/getState':
                simId = oscMsg.args[0].value;
                oscMsg.args.shift();
                for (let controller in connections) {
                    if (connections[controller] == simId) {
                        controllers[controller].send(osc.writePacket({
                            address: "/getState",
                            args: oscMsg.args
                        }));
                    }
                }
                break;
            default:
                // neuron update message
                for (let controller in controllers) {
                    if (controllers[controller] == ws) {
                        // send message to simId
                        simId = connections[controller];
                        const simWs = simulations[simId];
                        if (!simWs) break;
                        simWs.send(osc.writePacket(oscMsg));
                        // send message to other controllers connected to simId
                        for (let controller2 in connections) {
                            if (controller2 != controller && connections[controller2] == simId) {
                                controllers[controller2].send(osc.writePacket(oscMsg));
                            }
                        }
                        break;
                    }
                }
        }
    });

    ws.on('close', () => {
        if (controllers[ws]) {
            console.log(`Controller disconnected from simulation ${controllers[ws]}`)
            delete controllers[ws];
        } else {
            for (const simId in simulations) {
                if (simulations[simId] === ws) {
                    console.log(`Simulation ${simId} disconnected`);
                    delete simulations[simId];
                    break;
                }
            }
        }
    });
});