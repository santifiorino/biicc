let oscWebSocket;
let simulationInput, connectButton;
let controlElements = [];
let controllerId;
let neuronValues = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
        case "sliders":
            const sliderId = int(addressParts[2])-1;
            const sliderValue = oscMsg.args[0].value;
            neuronValues[sliderId] = sliderValue;
            break;
        case "pads":
            const padId = int(addressParts[2])-1;
            const padId2 = int(addressParts[3])-1;
            const xValue = oscMsg.args[0].value;
            const yValue = oscMsg.args[1].value;
            neuronValues[padId] = xValue;
            neuronValues[padId2] = yValue;
            break;
        case "getState":
            neuronValues = [];
            for (let i = 0; i < oscMsg.args.length; i++) {
                neuronValues.push(oscMsg.args[i].value);
            }
            break;
    }
}

function setup() {
    createCanvas(windowWidth, windowHeight);

    controllerId = Math.random().toString(36).substring(2, 8);

    oscWebSocket = new osc.WebSocketPort({
        url: "ws://<IP_ADDR>:9000",
        metadata: true
    });

    oscWebSocket.on("ready", function () {
        console.log("WebSocket ready");
    });

    oscWebSocket.on("message", function (oscMsg) {
        parseOscMessage(oscMsg);
    });

    oscWebSocket.open();

    textSize(32);
    simulationInput = createInput();
    simulationInput.position(30, 30);
    simulationInput.size(200);
    simulationInput.attribute("placeholder", "Simulation ID");

    connectButton = createButton("Connect");
    connectButton.position(250, 30);
    connectButton.mousePressed(connectToSimulation);

    createControlElements();
}

function createControlElements() {
    controlElements = [];
    for (let i = 0; i < 5; i++) {
        controlElements.push(new Slider(i, 50, 70 + i * 45, 200, 20, 0, 1));
    }
    if (windowHeight > windowWidth) {
        controlElements.push(new Pad(0, 1, 50, 300, 200, 200));
    } else {
        controlElements.push(new Pad(0, 1, 400, 70, 200, 200));
    }
}

function draw() {
    background("#2C2428");

    for (let controlElement of controlElements) {
        controlElement.draw();
    }
}

function connectToSimulation() {
    const oscMessage = {
        address: "/connectController",
        args: [
            {
                type: "s",
                value: simulationInput.value().toLowerCase().trimEnd()
            },
            {
                type: "s",
                value: controllerId
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function mousePressed() {
    for (let controlElement of controlElements) {
        controlElement.mousePressed();
    }
}

function touchStarted() {
    for (let controlElement of controlElements) {
        controlElement.touchStarted();
    }
}

function mouseReleased() {
    for (let controlElement of controlElements) {
        controlElement.mouseReleased();
    }
}

function touchEnded() {
    for (let controlElement of controlElements) {
        controlElement.touchEnded();
    }
}

function mouseDragged() {
    for (let controlElement of controlElements) {
        controlElement.mouseDragged();
    }
}

function touchMoved() {
    for (let controlElement of controlElements) {
        controlElement.touchMoved();
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    createControlElements();
}