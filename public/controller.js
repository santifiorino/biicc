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
    simulationInput.position(30, 60);
    simulationInput.size(200);
    simulationInput.attribute("placeholder", "Simulation ID");

    connectButton = createButton("Connect");
    connectButton.position(240, 60);
    connectButton.mousePressed(connectToSimulation);

    for (let i = 0; i < 3; i++) {
        controlElements.push(new Slider(i, 30, 100 + i * 40, 200, 20, 0, 1));
    }
    controlElements.push(new Pad(0, 30, 220, 200, 200));
    controlElements.push(new Pad(1, 240, 220, 200, 200));
}

function draw() {
    background("#2C2428");
    
    fill(255);
    text("Controller", 30, 30);

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