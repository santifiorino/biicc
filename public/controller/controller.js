let oscWebSocket;
let simulationInput, connectButton;

let controllerId;
let settings = {};
let neuronsAmount = 0;
let maxDC = 150;

let neuronControlElements = [];
let neuronExplanationTexts = [];
let neuronIds = []; // ids of the neurons that are being controlled
let initialized = false;
let assignedNeuronId = null; // 1-based neuron id assigned by backend
let hasState = false;

function handleDisconnect(message) {
  // Hide all controls
  noLoop(); // Stop p5.js draw loop
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.style.display = 'none';
  
  // Show disconnect message - full screen, same background as canvas
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    color: #fff;
    font-family: 'Courier New', monospace;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 20px;
    z-index: 10000;
  `;
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);
}

function parseOscMessage(oscMsg) {
  const addressParts = oscMsg.address.split("/");
  switch (addressParts[1]) {
    case "disconnect":
      const message = oscMsg.args?.[0]?.value || "Disconnected by server";
      handleDisconnect(message);
      break;
    case "server":
      // Handle /server/neuron (single neuron DC update)
      if (addressParts[2] === "neuron") {
        const id = oscMsg.args?.[0]?.value;
        const value = oscMsg.args?.[1]?.value;
        if (typeof id === "number" && typeof value === "number") {
          for (let i = 0; i < neuronIds.length; i++) {
            if (neuronIds[i] === id) {
              neuronControlElements[i].value = value;
              break;
            }
          }
          // Keep settings in sync
          settings["dc " + id] = value;
        }
      }
      // Handle /server/neurons/dc (initial state for all neurons)
      else if (addressParts[2] === "neurons" && addressParts[3] === "dc") {
        // args[0] is controllerId string, rest are DC values
        for (let i = 1; i < oscMsg.args.length; i++) {
          settings["dc " + i] = oscMsg.args[i].value;
        }
        neuronsAmount = oscMsg.args.length - 1;
        hasState = true;
        maybeCreateUI();
      }
      break;
    case "assignment":
      if (addressParts[2] === "neuron") {
        const value = oscMsg.args?.[0]?.value;
        if (typeof value === "number" && value >= 1) {
          assignedNeuronId = value;
          maybeCreateUI();
        }
      }
      break;
  }
}



function getPersistentControllerId() {
  try {
    const key = "controllerId";
    let id = localStorage.getItem(key);
    if (!id) {
      id = Math.random().toString(36).substring(2, 8);
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    // Fallback if localStorage unavailable
    return Math.random().toString(36).substring(2, 8);
  }
}

function setup() {
  // Check capacity before initializing UI and WebSocket
  controllerId = getPersistentControllerId();
  fetch(
    `/api/controller/check?controllerId=${encodeURIComponent(controllerId)}`,
  )
    .then((r) => r.json())
    .then((data) => {
      if (!data.allowed) {
        const msg = document.createElement("div");
        msg.textContent =
          "Maximum number of controllers reached. Please try again later.";
        msg.style.color = "#fff";
        msg.style.fontFamily = "sans-serif";
        msg.style.fontSize = "20px";
        msg.style.textAlign = "center";
        msg.style.marginTop = "20vh";
        document.body.style.background = "#010101";
        document.body.appendChild(msg);
        noLoop(); // prevent draw from running
        return;
      }

      createCanvas(windowWidth, windowHeight);

      fetch("/api/config")
        .then((r) => r.json())
        .then((cfg) => {
          const wsUrl =
            (cfg && typeof cfg.wsUrl === "string" && cfg.wsUrl) ||
            `ws://${location.hostname}:9000`;

          oscWebSocket = new osc.WebSocketPort({
            url: wsUrl,
            metadata: true,
          });

          oscWebSocket.on("ready", function () {
            console.log("WebSocket ready");
            connectToSimulation();
          });

          oscWebSocket.on("message", function (oscMsg) {
            parseOscMessage(oscMsg);
          });

          oscWebSocket.open();
          initialized = true;
        })
        .catch((err) => {
          const msg = document.createElement("div");
          msg.textContent = "Error loading configuration. Please try again.";
          msg.style.color = "#fff";
          msg.style.fontFamily = "sans-serif";
          msg.style.fontSize = "20px";
          msg.style.textAlign = "center";
          msg.style.marginTop = "20vh";
          document.body.style.background = "#010101";
          document.body.appendChild(msg);
          noLoop();
          console.error(err);
        });
    })
    .catch((err) => {
      const msg = document.createElement("div");
      msg.textContent = "Error checking capacity. Please try again.";
      msg.style.color = "#fff";
      msg.style.fontFamily = "sans-serif";
      msg.style.fontSize = "20px";
      msg.style.textAlign = "center";
      msg.style.marginTop = "20vh";
      document.body.style.background = "#2C2428";
      document.body.appendChild(msg);
      noLoop();
      console.error(err);
    });
}

function createNeuronControlElements() {
  const chosenId =
    typeof assignedNeuronId === "number" && assignedNeuronId >= 1
      ? assignedNeuronId
      : 1;
  neuronIds = [chosenId];
  neuronControlElements = [];
  neuronExplanationTexts = [];
  
  // Convert neuron ID to letter (1->A, 2->B, etc.)
  const neuronLetter = String.fromCharCode(64 + chosenId); // 65 is 'A'
  
  // Big neuron label above the slider
  const bigLabel = new MyText(neuronLetter, windowWidth / 2, 110, 64);
  bigLabel.textSize = 64;
  bigLabel.align = "center";
  neuronExplanationTexts.push(bigLabel);
  // Centered vertical slider
  const thickness = 60;
  const yTop = 160; // below the big number
  const buttonRadius = 40; // keep in sync with button below
  const spacing = 40; // space between slider and button
  const bottomPadding = 40;
  // Make sure all three elements (number, slider, button) fit on screen
  const availableForSlider = max(
    120,
    windowHeight - yTop - spacing - buttonRadius * 2 - bottomPadding,
  );
  const sliderHeight = availableForSlider;
  const xCenter = (windowWidth - thickness) / 2;
  let yPos = yTop;
  for (let i = 0; i < neuronIds.length; i++) {
    let slider = new VerticalSlider(
      settings["dc " + neuronIds[i]],
      xCenter,
      yPos,
      thickness,
      sliderHeight,
      0,
      maxDC,
      null,
    );
    slider.parameter = "dc " + neuronIds[i];
    slider.onChange = (val) => {
      updateSetting(slider.parameter, val);
    };
    neuronControlElements.push(slider);
  }
  // Add a circular button under the slider to send pulse
  // Place center so the button's top is exactly `spacing` below the slider
  const buttonY = yTop + sliderHeight + spacing + buttonRadius;
  const buttonX = windowWidth / 2;
  const pulseButton = new CircleButton(buttonX, buttonY, buttonRadius, () => {
    if (assignedNeuronId) {
      const oscMessage = {
        address: `/client/spike ${assignedNeuronId}`,
        args: [
          {
            type: "f",
            value: 1,
          },
        ],
      };
      oscWebSocket.send(oscMessage);
    }
  });
  neuronControlElements.push(pulseButton);
  yPos = buttonY + buttonRadius + 20;
  let pad = new Pad(
    settings["dc 1"],
    settings["dc 2"],
    50,
    yPos,
    200,
    200,
    0,
    maxDC,
    null,
  );
  pad.parameterX = "dc 1";
  pad.parameterY = "dc 2";
  yPos += 30;
  let IdSelectorX = new IdSelector(1, 270, yPos, 1, neuronsAmount, (val) => {
    pad.valueX = settings["dc " + val];
    pad.parameterX = "dc " + val;
  });
  yPos += 70;
  let idSelectorY = new IdSelector(2, 270, yPos, 1, neuronsAmount, (val) => {
    pad.valueY = settings["dc " + val];
    pad.parameterY = "dc " + val;
  });
  pad.onChange = (valX, valY) => {
    updateNeuronSliders(IdSelectorX.value, valX);
    updateSetting(pad.parameterX, valX);
    updateNeuronSliders(idSelectorY.value, valY);
    updateSetting(pad.parameterY, valY);
  };
  // neuronControlElements.push(pad)
  // neuronControlElements.push(IdSelectorX)
  // neuronControlElements.push(idSelectorY)
}

function maybeCreateUI() {
  if (!initialized) return;
  if (!hasState) return;
  if (neuronControlElements.length === 0) {
    createNeuronControlElements();
  }
}

function updateNeuronSliders(neuronId, value) {
  for (let i = 0; i < neuronControlElements.length - 3; i += 2) {
    if (neuronControlElements[i].value == neuronId) {
      neuronControlElements[i + 1].value = value;
    }
  }
  if (neuronControlElements.at(-2).value == neuronId) {
    neuronControlElements.at(-3).valueX = value;
  }
  if (neuronControlElements.at(-1).value == neuronId) {
    neuronControlElements.at(-3).valueY = value;
  }
}

function updateSetting(setting, value) {
  settings[setting] = value;
  let oscMessage;
  if (/^dc \d+$/.test(setting)) {
    const id = parseInt(setting.split(" ")[1], 10);
    oscMessage = {
      address: "/client/neuron",
      args: [
        { type: "i", value: id },
        { type: "f", value: value },
      ],
    };
  } else {
    oscMessage = {
      address: "/client/" + setting.replace(/\s+/g, "_"),
      args: [{ type: "f", value: value }],
    };
  }
  oscWebSocket.send(oscMessage);
}

function draw() {
  if (!initialized) return;
  background("#010101");
  fill(0);
  for (let controlElement of neuronControlElements) {
    controlElement.draw();
  }
  for (let text of neuronExplanationTexts) {
    text.draw();
  }
}

function connectToSimulation() {
  settings = {};
  neuronsAmount = 0;
  const oscMessage = {
    address: "/connectController",
    args: [
      {
        type: "s",
        value: controllerId,
      },
    ],
  };
  oscWebSocket.send(oscMessage);
}

function mousePressed() {
  for (let controlElement of neuronControlElements) {
    controlElement.mousePressed();
  }
}

function touchStarted() {
  mousePressed();
}

function mouseReleased() {
  for (let controlElement of neuronControlElements) {
    controlElement.mouseReleased();
  }
}

function touchEnded() {
  mouseReleased();
}

function mouseDragged() {
  for (let controlElement of neuronControlElements) {
    controlElement.mouseDragged();
  }
}

function touchMoved() {
  mouseDragged();
}

function windowResized() {
  if (!initialized) return;
  resizeCanvas(windowWidth, windowHeight);
  if (neuronControlElements.length > 0) {
    createNeuronControlElements();
  }
}
