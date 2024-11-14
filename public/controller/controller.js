let oscWebSocket;
let simulationInput, connectButton;
let selectedNavbarTab = "MENU_CURRENTS"

let controllerId
let settings = {}
let neuronsAmount = 0
let neuronSynTypes = []
let synapsesWeights = []
let synapsesDelays = []
let synapsesDropouts = []
let maxDC = 150;

let neuronControlElements = []
let synapseControlElements = []
let networkControlElements = []


function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
        case "update":
            switch (addressParts[2]) {
                case "setting":
                    const setting = addressParts[3]
                    let value = oscMsg.args[0].value

                    settings[setting] = value
                    // update control elements controlling this setting
                    for (let controlElement of neuronControlElements.concat(networkControlElements)) {
                        if ((controlElement.parameter || "") == setting) {
                            controlElement.value = value
                        }
                        if ((controlElement.parameterX || "") == setting) {
                            controlElement.valueX = value
                        }
                        if ((controlElement.parameterY || "") == setting) {
                            controlElement.valueY = value
                        }
                    }
                    break

                case "synapse":
                    const from = oscMsg.args[0].value
                    const to = oscMsg.args[1].value
                    switch (addressParts[3]) {
                        case "weight":
                            synapsesWeights[from][to] = oscMsg.args[2].value
                            break;
                        case "delay":
                            synapsesDelays[from][to] = oscMsg.args[2].value
                            break;
                        case "dropout":
                            synapsesDropouts[from][to] = Boolean(oscMsg.args[2].value)
                            break;
                    }
                    if (synapseControlElements[3].value == from + 1 && synapseControlElements[4].value == to + 1) {
                        switch (addressParts[3]) {
                            case "weight":
                                synapseControlElements[0].value = oscMsg.args[2].value
                                break
                            case "delay":
                                synapseControlElements[1].value = oscMsg.args[2].value
                                break
                            case "dropout":
                                synapseControlElements[2].value = Boolean(oscMsg.args[2].value)
                                break
                        }
                    }
                    
                    break
                case "neuron":
                    const neuronId = oscMsg.args[0].value
                    neuronSynTypes[neuronId] = oscMsg.args[1].value
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
                        neuronSynTypes = Array(neuronsAmount).fill().map(() => 0)
                        synapsesWeights = Array(neuronsAmount).fill().map(() => Array(neuronsAmount).fill(0))
                        synapsesDelays = Array(neuronsAmount).fill().map(() => Array(neuronsAmount).fill(0))
                        synapsesDropouts = Array(neuronsAmount).fill().map(() => Array(neuronsAmount).fill(false))
                        
                    }
                    break;
                case "synapse":
                    const from = oscMsg.args[0].value
                    const to = oscMsg.args[1].value
                    synapsesWeights[from][to] = oscMsg.args[2].value
                    synapsesDelays[from][to] = oscMsg.args[3].value
                    synapsesDropouts[from][to] = Boolean(oscMsg.args[4].value)
                    break
                case "neuron":
                    const neuronId = oscMsg.args[0].value
                    neuronSynTypes[neuronId] = oscMsg.args[1].value
                    break
            }
            createNetworkControlElements()
            createNeuronControlElements()
            createSynapseControlElements()
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

    yPos += 140
    let neuronSwitchSelector = new IdSelector(1, 130, yPos, 1, neuronsAmount, null)

    yPos += 45
    neuronTypeSwitch = new Switch(-1, 1, 50, yPos, (val) => {
        updateNeuronType(neuronSwitchSelector.value - 1, val)
    }, "inhibitory", "excitatory")

    neuronTypeSwitch.value = neuronSynTypes[0]

    neuronSwitchSelector.onChange = (val) => {
        neuronTypeSwitch.value = neuronSynTypes[val - 1]
    }

    neuronControlElements.push(neuronSwitchSelector)
    neuronControlElements.push(neuronTypeSwitch)

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

function updateSynapseWeight(from, to, value) {
    synapsesWeights[from][to] = value
    const oscMessage = {
        address: "/update/synapse/weight",
        args: [
            {
                type: "i",
                value: from
            },
            {
                type: "i",
                value: to
            },
            {
                type: "f",
                value: value
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function updateSynapseDelay(from, to, value) {
    synapsesDelays[from][to] = value
    const oscMessage = {
        address: "/update/synapse/delay",
        args: [
            {
                type: "i",
                value: from
            },
            {
                type: "i",
                value: to
            },
            {
                type: "f",
                value: value
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function updateSynapseDropout(from, to, value) {
    synapsesDropouts[from][to] = value
    const oscMessage = {
        address: "/update/synapse/dropout",
        args: [
            {
                type: "i",
                value: from
            },
            {
                type: "i",
                value: to
            },
            {
                type: "i",
                value: value
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function updateNeuronType(neuronId, value) {
    neuronSynTypes[neuronId] = value
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

function createSynapseControlElements() {
    synapseControlElements = [];
    let weightSlider = new Slider(synapsesWeights[0][1], 50, 290, 250, 20, 0, 80, null)
    let delaySlider = new Slider(synapsesDelays[0][1], 50, 370, 250, 20, 0, 5, null)

    let synapseDropoutSwitch = new Switch(true, false, 50, 195, null, "OFF", "ON")
    synapseDropoutSwitch.value = synapsesDropouts[0][1]

    let idSelectorFrom = new IdSelector(1, 50, 150, 1, neuronsAmount, () => {
        weightSlider.value = synapsesWeights[idSelectorFrom.value - 1][idSelectorTo.value - 1]
        delaySlider.value = synapsesDelays[idSelectorFrom.value - 1][idSelectorTo.value - 1]
        synapseDropoutSwitch.value = synapsesDropouts[idSelectorFrom.value - 1][idSelectorTo.value - 1]
    })

    let idSelectorTo = new IdSelector(2, 220, 150, 1, neuronsAmount, () => {
        weightSlider.value = synapsesWeights[idSelectorFrom.value - 1][idSelectorTo.value - 1]
        delaySlider.value = synapsesDelays[idSelectorFrom.value - 1][idSelectorTo.value - 1]
        synapseDropoutSwitch.value = synapsesDropouts[idSelectorFrom.value - 1][idSelectorTo.value - 1]
    })

    weightSlider.onChange = (val) => {
        updateSynapseWeight(idSelectorFrom.value - 1, idSelectorTo.value - 1, val)
    }
    
    delaySlider.onChange = (val) => {
        updateSynapseDelay(idSelectorFrom.value - 1, idSelectorTo.value - 1, val)
    }

    synapseDropoutSwitch.onChange = (val) => {
        updateSynapseDropout(idSelectorFrom.value - 1, idSelectorTo.value - 1, val)
    }

    synapseControlElements.push(weightSlider)
    synapseControlElements.push(delaySlider)
    synapseControlElements.push(synapseDropoutSwitch)
    synapseControlElements.push(idSelectorFrom)
    synapseControlElements.push(idSelectorTo)
}

function createNetworkControlElements() {
    networkControlElements = [];
    let slider = new Slider(settings["syn type"], 50, 140, 250, 20, 0, 1, (val) => {
        updateSetting("syn type", val)
    })
    slider.parameter = "syn type"
    networkControlElements.push(slider)

    slider = new Slider(settings["dropout"], 50, 200, 250, 20, 0, 1, (val) => {
        updateSetting("dropout", val)
    })
    slider.parameter = "dropout"
    networkControlElements.push(slider)

    slider = new Slider(settings["weight mean"], 50, 260, 250, 20, 0, 80, (val) => {
        updateSetting("weight mean", val)
    })
    slider.parameter = "weight mean"
    networkControlElements.push(slider)

    slider = new Slider(settings["weight size"], 50, 320, 250, 20, 0, 40, (val) => {
        updateSetting("weight size", val)
    })
    slider.parameter = "weight size"
    networkControlElements.push(slider)

    slider = new Slider(settings["delay mean"], 50, 380, 250, 20, 0.01, 2, (val) => {
        updateSetting("delay mean", val)
    })
    slider.parameter = "delay mean"
    networkControlElements.push(slider)

    slider = new Slider(settings["delay size"], 50, 440, 250, 20, 0.001, 0.5, (val) => {
        updateSetting("delay size", val)
    })
    slider.parameter = "delay size"
    networkControlElements.push(slider)

    slider = new Slider(settings["syn tau"], 50, 510, 250, 20, 0.5, 2, (val) => {
        updateSetting("syn tau", val)
    })
    slider.parameter = "syn tau"
    networkControlElements.push(slider)
}

function draw() {
    background("#2C2428");
    fill(0);
    rect(0, 0, windowWidth, 50);
    fill("#2C2428");
    strokeWeight(0);
    switch (selectedNavbarTab) {
        case "MENU_CURRENTS":
            rect(0, 0, windowWidth/3, 50);
            if (neuronControlElements.length > 0) {
                textSize(20);
                fill(255);
                text("neuron", 50, neuronControlElements[neuronControlElements.length-1].y - 30)
                text("type", 230, neuronControlElements[neuronControlElements.length-1].y - 30)
            }
            for (let controlElement of neuronControlElements) {
                controlElement.draw();
            }
            break;
        case "MENU_SYNAPSES":
            rect(windowWidth/3, 0, windowWidth/3, 50);
            if (synapseControlElements.length > 0) {
                textSize(20)
                fill(255)
                text("from:", 50, 130)
                text("to:", 220, 130)
                synapseControlElements[3].draw()
                synapseControlElements[4].draw()
                if (synapseControlElements[3].value != synapseControlElements[4].value) {
                    for (let i = 0; i < 3; ++i) {
                        synapseControlElements[i].draw()
                    }
                    textSize(20)
                    fill(255)
                    text("weight:", 50, 270)
                    text("delay:", 50, 350)
                    for (let i = 0; i < 2; ++i) {
                        controlElement = synapseControlElements[i]
                        text(controlElement.value.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), synapseControlElements[i].x + synapseControlElements[i].w + 20, synapseControlElements[i].y + 16)
                    }
                }
            }
            break;
        case "MENU_NETWORK":
            rect(2*windowWidth/3, 0, windowWidth/3, 50);
            if (networkControlElements.length > 0) {
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
            for (let controlElement of networkControlElements) {
                controlElement.draw()
                textSize(20);
                fill(255);
                text(controlElement.value.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), controlElement.x + controlElement.w + 20, controlElement.y + 16)
            }
            break;
    }
    fill(255);
    textSize(24);
    text("Currents", 1/10 * windowWidth/3, 35);
    text("Synapses", windowWidth/3 + 1/10 * windowWidth/3, 35);
    text("Network", 2*windowWidth/3 + 1/10 * windowWidth/3, 35);
}

function connectToSimulation() {
    settings = {}
    neuronsAmount = 0
    // let neuronSynTypes = []
    // let synapsesWeights = []
    // let synapsesDelays = []
    // let synapsesDropouts = []
    // let maxDC = 150;

    // let neuronControlElements = []
    // let synapseControlElements = []
    // let networkControlElements = []
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
        if (mouseX < windowWidth/3) {
            selectedNavbarTab = "MENU_CURRENTS"
            for (let controlElement of neuronControlElements) {
                controlElement.mousePressed()
            }
        } else if (mouseX < 2*windowWidth/3) {
            selectedNavbarTab = "MENU_SYNAPSES"
            for (let controlElement of synapseControlElements) {
                controlElement.mousePressed()
            }
        } else {
            selectedNavbarTab = "MENU_NETWORK"
            for (let controlElement of networkControlElements) {
                controlElement.mousePressed()
            }
        }
    }
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.mousePressed()
        }
    } else if (selectedNavbarTab == "MENU_SYNAPSES") {
        for (let controlElement of synapseControlElements) {
            controlElement.mousePressed()
        }
    } else {
        for (let controlElement of networkControlElements) {
            controlElement.mousePressed()
        }
    }
}

function touchStarted() {
    mousePressed();
}

function mouseReleased() {
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.mouseReleased()
        }
    } else if (selectedNavbarTab == "MENU_SYNAPSES") {
        for (let controlElement of synapseControlElements) {
            controlElement.mouseReleased()
        }
    } else {
        for (let controlElement of networkControlElements) {
            controlElement.mouseReleased();
        }
    }
}

function touchEnded() {
    mouseReleased()
}

function mouseDragged() {
    if (selectedNavbarTab == "MENU_CURRENTS") {
        for (let controlElement of neuronControlElements) {
            controlElement.mouseDragged()
        }
    } else if (selectedNavbarTab == "MENU_SYNAPSES") {
        for (let controlElement of synapseControlElements) {
            controlElement.mouseDragged()
        }
    } else {
        for (let controlElement of networkControlElements) {
            controlElement.mouseDragged()
        }
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