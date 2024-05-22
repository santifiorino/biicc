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

app.get('/simulation', (req, res) => {
    res.sendFile(__dirname + '/public/simulation.html');
});

app.get('/controller', (req, res) => {
    res.sendFile(__dirname + '/public/controller.html');
});

let simulations = {}; // { simulationId: simulationWS }
let controllers = {}; // { controllerWS: simulationId }

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
            case '/registerController':
                simId = oscMsg.args[0].value;
                if (!simulations[simId]) return; // Simulation is not registered
                controllers[ws] = simId;
                console.log(`Registered controller for simulation ${simId}`);
                break;
            default:
                if (!controllers[ws]) return; // Controller is not registered
                simId = controllers[ws];
                const simWs = simulations[simId];
                if (!simWs) return;
                simWs.send(osc.writePacket(oscMsg));
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