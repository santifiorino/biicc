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

function parseOscMessage(oscMsg) {
  const addressParts = oscMsg.address.split("/");
  switch (addressParts[1]) {
    case "update":
      const neuronName = addressParts[2];
      for (let i = 0; i < neuronIds.length; i++) {
        if ("dc " + neuronIds[i] == neuronName) {
          neuronControlElements[i].value = oscMsg.args[0].value;
          break;
        }
      }
      break;
    case "state":
      console.log(oscMsg);
      for (let i = 0; i < oscMsg.args.length; i++) {
        settings["dc " + (i + 1)] = oscMsg.args[i].value;
      }
      neuronsAmount = oscMsg.args.length;
      createNeuronControlElements();
      break;
  }
}

class Text {
  constructor(text, x, y, textSize) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.color = color(255);
    this.textSize = 16;
  }

  draw() {
    fill(this.color);
    textSize(this.textSize);
    text(this.text, this.x, this.y);
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
  fetch(`/api/controller/check?controllerId=${encodeURIComponent(controllerId)}`)
    .then((r) => r.json())
    .then((data) => {
      if (!data.allowed) {
        const msg = document.createElement("div");
        msg.textContent = "Maximum number of controllers reached. Please try again later.";
        msg.style.color = "#fff";
        msg.style.fontFamily = "sans-serif";
        msg.style.fontSize = "20px";
        msg.style.textAlign = "center";
        msg.style.marginTop = "20vh";
        document.body.style.background = "#2C2428";
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
          document.body.style.background = "#2C2428";
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
  const slidersAmount = min(3, neuronsAmount);
  neuronIds = [];
  let usedIds = new Set();
  while (neuronIds.length < slidersAmount) {
    const id = Math.floor(Math.random() * neuronsAmount) + 1;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      neuronIds.push(id);
    }
  }
  neuronControlElements = [];
  neuronExplanationTexts = [];
  let yPos = 110;
  for (let i = 0; i < neuronIds.length; i++) {
    let slider = new Slider(
      settings["dc " + neuronIds[i]],
      50,
      yPos,
      windowWidth - 100,
      30,
      0,
      maxDC,
      null,
    );
    slider.parameter = "dc " + neuronIds[i];
    slider.onChange = (val) => {
      updateSetting(slider.parameter, val);
    };
    neuronControlElements.push(slider);
    yPos += 40;
    for (let explanation of slidersExplanations[slider.parameter]) {
      sliderExplanation = new Text(explanation, 50, yPos + 20, 24);
      neuronExplanationTexts.push(sliderExplanation);
      yPos += 20;
    }
    yPos += 50;
  }
  yPos += 20;
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
  const oscMessage = {
    address: "/update/" + setting,
    args: [
      {
        type: "f",
        value: value,
      },
    ],
  };
  oscWebSocket.send(oscMessage);
}

function draw() {
  if (!initialized) return;
  background("#2C2428");
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
