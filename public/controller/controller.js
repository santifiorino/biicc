let oscWebSocket;
let simulationInput, connectButton;
let controlElements = [];

function setup() {
    createCanvas(windowWidth, windowHeight);

    oscWebSocket = new osc.WebSocketPort({
        url: "ws://<IP_ADDR>:9000",
        metadata: true
    });
    oscWebSocket.on("ready", function () {
        console.log("WebSocket ready");
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
        controlElements.push(new Slider(i+1, 30, 70 + i * 45, 200, 20, 0, 1));
    }
    if (windowHeight > windowWidth) {
        controlElements.push(new Pad(0, 30, 300, 200, 200));
    } else {
        controlElements.push(new Pad(0, 400, 70, 200, 200));
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
        address: "/registerController",
        args: [
            {
                type: "s",
                value: simulationInput.value()
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