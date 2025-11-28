let oscWebSocket;
let simulationInput, connectButton;

let controllerId
let settings = {}
let neuronsAmount = 0
let maxDC = 150;

let neuronControlElements = []


function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
        case "update":
            switch (addressParts[2]) {
                case "neuron":
                    const neuronId = oscMsg.args[0].value
                    if (neuronControlElements[neuronControlElements.length-2].value == neuronId + 1) {
                        neuronControlElements[neuronControlElements.length-1].value = oscMsg.args[1].value
                    }
                    break
            }
            break
        case "state":
            switch (addressParts[2]) {
                case "setting":
                    const setting = addressParts[3]
                    const value = oscMsg.args[0].value       
                    settings[setting] = value
                    if (/^dc \d+$/.test(setting)) { // dc + number
                        neuronsAmount++
                    }
                    break;
                }
            createNeuronControlElements()
            break
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
        connectToSimulation()
    });

    oscWebSocket.on("message", function (oscMsg) {
        parseOscMessage(oscMsg);
    });

    oscWebSocket.open();
}

function createNeuronControlElements() {
    neuronControlElements = []
    let yPos = 110;
    for (let i = 0; i < min(4, neuronsAmount); i++) {
        let slider = new Slider(settings["dc " + (i+1)], 50, yPos, 200, 20, 0, maxDC, null)
        slider.parameter = "dc " + (i+1)
        let idSelector = new IdSelector(i+1, 270, yPos, 1, neuronsAmount, (val) => {
            slider.parameter = "dc " + val
            slider.value = settings["dc " + val]
        })
        slider.onChange = (val) => {
            updateNeuronSliders(idSelector.value, val)
            updateSetting(slider.parameter, val)
        }
        neuronControlElements.push(idSelector)
        neuronControlElements.push(slider)
        yPos += 45;
    }
    yPos += 20;
    let pad = new Pad(settings["dc 1"], settings["dc 2"], 50, yPos, 200, 200, 0, maxDC, null)
    pad.parameterX = "dc 1"
    pad.parameterY = "dc 2"
    yPos += 30
    let IdSelectorX = new IdSelector(1, 270, yPos, 1, neuronsAmount, (val) => {
        pad.valueX = settings["dc " + val]
        pad.parameterX = "dc " + val
    })
    yPos += 70
    let idSelectorY = new IdSelector(2, 270, yPos, 1, neuronsAmount, (val) => {
        pad.valueY = settings["dc " + val]
        pad.parameterY = "dc " + val
    })
    pad.onChange = (valX, valY) => {
        updateNeuronSliders(IdSelectorX.value, valX)
        updateSetting(pad.parameterX, valX)
        updateNeuronSliders(idSelectorY.value, valY)
        updateSetting(pad.parameterY, valY)
    }
    neuronControlElements.push(pad)
    neuronControlElements.push(IdSelectorX)
    neuronControlElements.push(idSelectorY)
}

function updateNeuronSliders(neuronId, value) {
    for (let i = 0; i < neuronControlElements.length-3; i+=2) {
        if (neuronControlElements[i].value == neuronId) {
            neuronControlElements[i+1].value = value
        }
    }
    if (neuronControlElements.at(-2).value == neuronId) {
        neuronControlElements.at(-3).valueX = value
    }
    if (neuronControlElements.at(-1).value == neuronId) {
        neuronControlElements.at(-3).valueY = value
    }
}

function updateSetting(setting, value) {
    settings[setting] = value;
    const oscMessage = {
        address: "/update/setting/" + setting,
        args: [
            {
                type: "f",
                value: value
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function updateNeuronType(neuronId, value) {
    const oscMessage = {
        address: "/update/neuron",
        args: [
            {
                type: "i",
                value: neuronId
            },
            {
                type: "i",
                value: value
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function draw() {
    background("#2C2428");
    fill(0);
    for (let controlElement of neuronControlElements) {
        controlElement.draw();
    }
}

function connectToSimulation() {
    settings = {}
    neuronsAmount = 0
    const oscMessage = {
        address: "/connectController",
        args: [
            {
                type: "s",
                value: controllerId
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function mousePressed() {
    for (let controlElement of neuronControlElements) {
        controlElement.mousePressed()
    }
}

function touchStarted() {
    mousePressed();
}

function mouseReleased() {
    for (let controlElement of neuronControlElements) {
        controlElement.mouseReleased()
    }
}

function touchEnded() {
    mouseReleased()
}

function mouseDragged() {
    for (let controlElement of neuronControlElements) {
        controlElement.mouseDragged()
    }
}

function touchMoved() {
    mouseDragged()
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if (neuronControlElements.length > 0) {
        createNeuronControlElements();
    }
}