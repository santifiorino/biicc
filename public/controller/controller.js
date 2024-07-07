let oscWebSocket;
let simulationInput, connectButton;
let selectedNavbarTab = "MENU_CURRENTS";
let neuronControlElements = [];
let settingsControlElements = [];
let controllerId;
let settings = {};
let maxDC = 150;

function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
        case "update":
            for (let i = 0; i < oscMsg.args.length; i+=2) {
                settings[oscMsg.args[i].value] = oscMsg.args[i+1].value
            }
            break;
        case "getState":
            settings = {};
            neuronsAmount = 0;
            for (let i = 0; i < oscMsg.args.length; i+=2) {
                settings[oscMsg.args[i].value] = oscMsg.args[i+1].value;
                if (oscMsg.args[i].value.startsWith("dc"))
                    neuronsAmount++;
            }
            neuronsAmount--; // "dc all" is not an actual neuron
            createNeuronControlElements();
            createSettingsControlElements();
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
    simulationInput.position(50, 70);
    simulationInput.size(200);
    simulationInput.attribute("placeholder", "Simulation ID");

    connectButton = createButton("Connect");
    connectButton.position(270, 70);
    connectButton.mousePressed(connectToSimulation);
}

function createNeuronControlElements() {
    neuronControlElements = [];
    let yPos = 110;
    for (let i = 0; i < min(5, neuronsAmount); i++) {
        neuronControlElements.push(new Slider("dc " + (i+1), 50, yPos, 200, 20, 0, maxDC, true));
        yPos += 45;
    }
    yPos += 20;
    neuronControlElements.push(new Pad("dc 1", "dc 2", 50, yPos, 200, 200, 0, maxDC));
}

function createSettingsControlElements() {
    settingsControlElements = [];
    settingsControlElements.push(new Slider("syn type", 50, 140, 250, 20, 0, 1));
    settingsControlElements.push(new Slider("dropout", 50, 200, 250, 20, 0, 1));
    settingsControlElements.push(new Slider("weight mean", 50, 260, 250, 20, 0, 80));
    settingsControlElements.push(new Slider("weight size", 50, 320, 250, 20, 0, 40));
    settingsControlElements.push(new Slider("delay mean", 50, 380, 250, 20, 0.01, 2));
    settingsControlElements.push(new Slider("delay size", 50, 440, 250, 20, 0.001, 0.5));
    settingsControlElements.push(new Slider("syn tau", 50, 510, 250, 20, 0.5, 2));
}

function draw() {
    background("#2C2428");
    fill(0);
    rect(0, 0, windowWidth, 50);
    fill("#2C2428");
    strokeWeight(0);
    switch (selectedNavbarTab) {
        case "MENU_CURRENTS":
            rect(0, 0, windowWidth/2, 50);
            for (let controlElement of neuronControlElements) {
                controlElement.draw();
            }
            break;
        case "MENU_NETWORK":
            rect(windowWidth/2, 0, windowWidth/2, 50);
            if (settingsControlElements.length > 0) {
                textSize(20);
                fill(255);
                text("syn type", 50, 130)
                text("dropout", 50, 190)
                text("weight mean", 50, 250)
                text("weight size", 50, 310)
                text("delay mean", 50, 370)
                text("delay size", 50, 430)
                text("syn tau", 50, 490)
            }
            for (let controlElement of settingsControlElements) {
                controlElement.draw();
            }
            break;
    }
    fill(255);
    textSize(32);
    text("Currents", 30, 35);
    text("Network", windowWidth/2 + 30, 35);
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
    if (mouseY < 50) {
        if (mouseX < windowWidth/2) {
            selectedNavbarTab = "MENU_CURRENTS";
        } else {
            selectedNavbarTab = "MENU_NETWORK";
        }
    }
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.mousePressed();
        }
    } else if (selectedNavbarTab == "MENU_NETWORK") {
        for (let controlElement of settingsControlElements) {
            controlElement.mousePressed();
        }
    }
}

function touchStarted() {
    if (mouseY < 50) {
        if (mouseX < windowWidth/2) {
            selectedNavbarTab = "MENU_CURRENTS";
        } else {
            selectedNavbarTab = "MENU_NETWORK";
        }
    }
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.touchStarted();
        }
    } else if (selectedNavbarTab == "MENU_NETWORK") {
        for (let controlElement of settingsControlElements) {
            controlElement.touchStarted();
        }
    }
}

function mouseReleased() {
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.mouseReleased();
        }
    } else if (selectedNavbarTab == "MENU_NETWORK") {
        for (let controlElement of settingsControlElements) {
            controlElement.mouseReleased();
        }
    }
}

function touchEnded() {
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.touchEnded();
        }
    } else if (selectedNavbarTab == "MENU_NETWORK") {
        for (let controlElement of settingsControlElements) {
            controlElement.touchEnded();
        }
    }
}

function mouseDragged() {
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.mouseDragged();
        }
    } else if (selectedNavbarTab == "MENU_NETWORK") {
        for (let controlElement of settingsControlElements) {
            controlElement.mouseDragged();
        }
    }
}

function touchMoved() {
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.touchMoved();
        }
    } else if (selectedNavbarTab == "MENU_NETWORK") {
        for (let controlElement of settingsControlElements) {
            controlElement.touchMoved();
        }
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if (neuronControlElements.length > 0) {
        createNeuronControlElements();
    }
}