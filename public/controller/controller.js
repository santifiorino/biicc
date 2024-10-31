let oscWebSocket;
let simulationInput, connectButton;
let selectedNavbarTab = "MENU_CURRENTS"

let controllerId;
let settings = {}
let synapses_weights = []
let synapses_delays = []
let maxDC = 150;

let neuronControlElements = []
let synapseControlElements = []
let settingsControlElements = []


function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
        case "update":
            for (let i = 0; i < oscMsg.args.length; i+=2) {
                settings[oscMsg.args[i].value] = oscMsg.args[i+1].value
                for (let controlElement of neuronControlElements.concat(settingsControlElements)) {
                    if ((controlElement.parameter || "") == oscMsg.args[i].value) {
                        controlElement.value = oscMsg.args[i+1].value
                    }
                    if ((controlElement.parameterX || "") == oscMsg.args[i].value) {
                        controlElement.valueX = oscMsg.args[i+1].value
                    }
                    if ((controlElement.parameterY || "") == oscMsg.args[i].value) {
                        controlElement.valueY = oscMsg.args[i+1].value
                    }
                }
            }
            break;
        case "getState":
            const splitIndex = oscMsg.args.findIndex(item => item.type == "s" && item.value == "synapse")
            const stateArray = oscMsg.args.slice(0, splitIndex)
            const synapseArray = oscMsg.args.slice(splitIndex)
            
            settings = {}
            neuronsAmount = 0;
            for (let i = 0; i < stateArray.length; i+=2) {
                settings[stateArray[i].value] = stateArray[i+1].value;
                if (stateArray[i].value.startsWith("dc"))
                    neuronsAmount++;
            }
            neuronsAmount-- // "dc all" is not an actual neuron

            synapses_weights = Array(neuronsAmount+1).fill().map(() => Array(neuronsAmount+1).fill(-1))
            synapses_delays = Array(neuronsAmount+1).fill().map(() => Array(neuronsAmount+1).fill(-1))
            for (let i = 0; i < synapseArray.length; i+=5) {
                synapses_weights[synapseArray[i+1].value][synapseArray[i+2].value] = synapseArray[i+3].value
                synapses_delays[synapseArray[i+1].value][synapseArray[i+2].value] = synapseArray[i+4].value
            }
            createNeuronControlElements()
            createSynapseControlElements()
            createSettingsControlElements()
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
    neuronControlElements = []
    let yPos = 110;
    for (let i = 0; i < min(5, neuronsAmount); i++) {
        let slider = new Slider(settings["dc " + (i+1)], 50, yPos, 200, 20, 0, maxDC, null)
        slider.parameter = "dc " + (i+1)
        let idSelector = new IdSelector(i+1, 270, yPos, 1, neuronsAmount, (val) => {
            slider.parameter = "dc " + val
            slider.value = settings["dc " + val]
        })
        slider.onChange = (val) => {
            updateNeuronSliders(idSelector.value, val)
            updateParameter(slider.parameter, val)
        }
        neuronControlElements.push(idSelector)
        neuronControlElements.push(slider)
        yPos += 45;
    }
    yPos += 20;
    let pad = new Pad(settings["dc 1"], settings["dc 2"], 50, yPos, 200, 200, 0, maxDC, null)
    pad.parameterX = "dc 1"
    pad.parameterY = "dc 2"
    let IdSelectorX = new IdSelector(1, 270, yPos + 30, 1, neuronsAmount, (val) => {
        pad.valueX = settings["dc " + val]
        pad.parameterX = "dc " + val
    })
    let idSelectorY = new IdSelector(2, 270, yPos + 100, 1, neuronsAmount, (val) => {
        pad.valueY = settings["dc " + val]
        pad.parameterY = "dc " + val
    })
    pad.onChange = (valX, valY) => {
        updateNeuronSliders(IdSelectorX.value, valX)
        updateParameter(pad.parameterX, valX)
        updateNeuronSliders(idSelectorY.value, valY)
        updateParameter(pad.parameterY, valY)
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

function updateParameter(parameter, value) {
    settings[parameter] = value;
    const oscMessage = {
        address: "/update",
        args: [
            {
                type: "s",
                value: parameter
            },
            {
                type: "f",
                value: value
            }
        ]
    };
    oscWebSocket.send(oscMessage);
}

function createSynapseControlElements() {
    synapseControlElements = [];
    let weightSlider = new Slider(synapses_weights[0][1], 50, 230, 250, 20, 0, 80, null)
    let delaySlider = new Slider(synapses_weights[0][1], 50, 310, 250, 20, 0, 80, null)

    let idSelectorFrom = new IdSelector(1, 50, 150, 1, neuronsAmount, (val) => {
        console.log(val)
    })
    let idSelectorTo = new IdSelector(2, 220, 150, 1, neuronsAmount, (val) => {
        console.log(val)
    })

    weightSlider.onChange = (val) => {
        console.log(synapses_weights)
        synapses_weights[idSelectorFrom.value][idSelectorTo.value] = val
        // TODO: actually update it, send it to the nn
    }
    
    delaySlider.onChange = (val) => {
        console.log(synapses_delays)
        synapses_delays[idSelectorFrom.value][idSelectorTo.value] = val
    }

    synapseControlElements.push(weightSlider)
    synapseControlElements.push(delaySlider)
    synapseControlElements.push(idSelectorFrom)
    synapseControlElements.push(idSelectorTo)
    //synapseControlElements.push(new IdSelector(1, 50, 50, 1, neuronsAmount, (val) => {)
    // synapseControlElements.push(new Slider("weight", 50, 110, 250, 20, 0, 1))
    // synapseControlElements.push(new Slider("delay", 50, 170, 250, 20, 0.01, 2))
}

function createSettingsControlElements() {
    settingsControlElements = [];
    let slider = new Slider(settings["syn type"], 50, 140, 250, 20, 0, 1, (val) => {
        updateParameter("syn type", val)
    })
    slider.parameter = "syn type"
    settingsControlElements.push(slider)

    slider = new Slider(settings["dropout"], 50, 200, 250, 20, 0, 1, (val) => {
        updateParameter("dropout", val)
    })
    slider.parameter = "dropout"
    settingsControlElements.push(slider)

    slider = new Slider(settings["weight mean"], 50, 260, 250, 20, 0, 80, (val) => {
        updateParameter("weight mean", val)
    })
    slider.parameter = "weight mean"
    settingsControlElements.push(slider)

    slider = new Slider(settings["weight size"], 50, 320, 250, 20, 0, 40, (val) => {
        updateParameter("weight size", val)
    })
    slider.parameter = "weight size"
    settingsControlElements.push(slider)

    slider = new Slider(settings["delay mean"], 50, 380, 250, 20, 0.01, 2, (val) => {
        updateParameter("delay mean", val)
    })
    slider.parameter = "delay mean"
    settingsControlElements.push(slider)

    slider = new Slider(settings["delay size"], 50, 440, 250, 20, 0.001, 0.5, (val) => {
        updateParameter("delay size", val)
    })
    slider.parameter = "delay size"
    settingsControlElements.push(slider)

    slider = new Slider(settings["syn tau"], 50, 510, 250, 20, 0.5, 2, (val) => {
        updateParameter("syn tau", val)
    })
    slider.parameter = "syn tau"
    settingsControlElements.push(slider)
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
            for (let controlElement of neuronControlElements) {
                controlElement.draw();
            }
            break;
        case "MENU_SYNAPSES":
            rect(windowWidth/3, 0, windowWidth/3, 50);
            textSize(20);
            fill(255);
            text("from:", 50, 130)
            text("to:", 220, 130)
            text("weight:", 50, 210)
            text("delay:", 50, 290)
            for (let controlElement of synapseControlElements) {
                controlElement.draw();
            }
            break;
        case "MENU_NETWORK":
            rect(2*windowWidth/3, 0, windowWidth/3, 50);
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
            for (let controlElement of settingsControlElements) {
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
        for (let controlElement of settingsControlElements) {
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