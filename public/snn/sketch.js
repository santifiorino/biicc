var syn_colors;
var net_score_border;
var frame_rate = 60;
var showScopes = false;

maxDC = 150;
maxWeight = 80;
pulseDecay = 0.85;

i = 0;
marginx = 50;
gravityConstant = 1;
forceConstantRepulsive = 10000;
forceConstantAttractive = 0.00005;
mass = 1;
knobR = 20;
score_sep = (12 - n_neurons) * 5 + 60;

settings = defaultSettings();

function defaultSettings() {
  return {
    "weight mean": maxWeight / 2,
    "weight size": maxWeight / 4,
    "delay mean": 1,
    "delay size": 0.001,
    dt: 0.25,
    "circle size": 50,
    "note duration": 0.125,
    "note volume": -12,
    "syn type": 0.5,
    dropout: 0.5,
    net: true,
    scale: "Major",
    "dc all": 0.0,
    noise: 0,
    knobs: false,
    "syn tau": 1,
    "types all": "rs",
    "sim steps": 2,
    "pulse force": 1.0,
    "gravity force": gravityConstant,
    "repel force": forceConstantRepulsive,
    "attract force": forceConstantAttractive,
  };
}

circles = [];
pulses = [];
knobs = [];
scopes = [];
voices = [];
scores = [];
NN = null;

nodes = [];
nodeCon = [];

clicked = false;
lerpValue = 0.2;

// scale = ["A4",]
escala_mayor = [
  "D3",
  "E3",
  "F#3",
  "G#3",
  "A3",
  "B3",
  "C#4",
  "D4",
  "E4",
  "F#4",
  "G#4",
  "A4",
];
escala_menor = [
  "D3",
  "E3",
  "F3",
  "G3",
  "A3",
  "B3",
  "C4",
  "D4",
  "E4",
  "F4",
  "G4",
  "A4",
];
drumnotes = ["A1", "B1", "C2", "D2", "E2", "F2", "G2", "A2", "B2"];

let oscWebSocket;

function parseOscMessage(oscMsg) {
  const addressParts = oscMsg.address.split("/");
  switch (addressParts[1]) {
    case "update":
      if (addressParts[2] === "dc") {
        const id = oscMsg.args?.[0]?.value;
        const value = oscMsg.args?.[1]?.value;
        if (typeof id === "number" && typeof value === "number") {
          settings["dc " + id] = value;
        }
      } else {
        const setting = addressParts[2];
        const value = oscMsg.args[0].value;
        
        // Debug logging for syn type messages
        if (setting.includes("syn type")) {
          console.log(`Received OSC: address="${oscMsg.address}", setting="${setting}", value=${value}`);
        }
        
        // Handle spike trigger
        if (/^spike \d+$/.test(setting) && value) {
          const neuronId = parseInt(setting.split(" ")[1], 10);
          const neuron = NN?.neurons?.[neuronId - 1];
          if (neuron) {
            neuron.V = neuron.maxV + 1;
          }
          break;
        }
        
        // Handle syn type per neuron
        if (/^syn type \d+$/.test(setting)) {
          const neuronId = parseInt(setting.split(" ")[2], 10);
          const neuron = NN?.neurons?.[neuronId - 1];
          console.log(`Received syn type update: setting="${setting}", neuronId=${neuronId}, value=${value}, neuron exists=${!!neuron}`);
          if (neuron) {
            const oldType = neuron.syn_type;
            neuron.syn_type = value >= 0 ? 1 : -1;
            console.log(`Set neuron ${neuronId} syn_type from ${oldType} to ${neuron.syn_type} (value: ${value})`);
            
            // Update circle color
            if (circles && circles[neuronId - 1]) {
              circles[neuronId - 1].color = syn_colors[neuron.syn_type];
            }
            
            // Update all pulses from this neuron
            for (let k = 0; k < NN.synapses.length; k++) {
              if (NN.synapses[k].from.id === neuronId - 1) {
                pulses[k].set_syn_type(neuron.syn_type);
              }
            }
          }
          break;
        }
        
        // Handle weight updates
        if (/^weight \d+ \d+$/.test(setting)) {
          const parts = setting.split(" ");
          const fromId = parseInt(parts[1], 10) - 1;
          const toId = parseInt(parts[2], 10) - 1;
          for (let k = 0; k < NN.synapses.length; k++) {
            const S = NN.synapses[k];
            if (S.from.id === fromId && S.to.id === toId) {
              S.set_weight(value);
              if (nodeCon && nodeCon[k]) {
                nodeCon[k][2] = value;
              }
              if (knobs && knobs[k]) {
                knobs[k].set_value(map(value, 0, maxWeight, 0, 1));
              }
              break;
            }
          }
          break;
        }
        
        // Handle drop updates
        if (/^drop \d+ \d+$/.test(setting)) {
          const parts = setting.split(" ");
          const fromId = parseInt(parts[1], 10) - 1;
          const toId = parseInt(parts[2], 10) - 1;
          for (let k = 0; k < NN.synapses.length; k++) {
            const S = NN.synapses[k];
            if (S.from.id === fromId && S.to.id === toId) {
              S.drop = value >= 0.5;
              break;
            }
          }
          break;
        }
        
        // Handle weight mean/size - regenerate all weights
        if (setting === "weight mean" || setting === "weight size") {
          settings[setting] = value;
          NN.set_random_weight(settings["weight mean"], settings["weight size"]);
          weights_to_nodes(true);
          broadcastWeights();
          break;
        }
        
        // Handle delay mean/size - regenerate all delays
        if (setting === "delay mean" || setting === "delay size") {
          settings[setting] = value;
          NN.set_random_delay(settings["delay mean"], settings["delay size"]);
          delay_to_pulses();
          break;
        }
        
        // Handle syn type proportion
        if (setting === "syn type") {
          settings[setting] = value;
          NN.set_type_proportion(value);
          console.log(`Set syn type proportion to ${value}`);
          broadcastSynTypes();
          break;
        }
        
        // Handle force updates
        if (setting === "pulse force") {
          settings[setting] = value;
          break;
        }
        if (setting === "gravity force") {
          gravityConstant = value;
          settings[setting] = value;
          break;
        }
        if (setting === "repel force") {
          forceConstantRepulsive = value;
          settings[setting] = value;
          break;
        }
        if (setting === "attract force") {
          forceConstantAttractive = value;
          settings[setting] = value;
          break;
        }
        
        // Handle audio controls
        if (setting === "audio volume") {
          settings[setting] = value;
          if (typeof Tone !== "undefined" && Tone.Destination) {
            Tone.Destination.volume.value = value;
          }
          break;
        }
        if (setting === "audio mute") {
          settings[setting] = value;
          if (typeof Tone !== "undefined" && Tone.Destination) {
            Tone.Destination.mute = value > 0.5;
          }
          break;
        }
        
        // Handle show scopes toggle
        if (setting === "show scopes") {
          settings[setting] = value;
          showScopes = value > 0.5;
          createScopes();
          updateNetLayout();
          break;
        }
        
        settings[setting] = value;
      }
      break;
    case "getState":
      const controllerId = oscMsg.args[0].value;
      let values = [];
      for (const setting in settings) {
        if (/^dc \d+$/.test(setting)) {
          values.push({
            type: "f",
            value: settings[setting],
          });
        }
      }
      oscWebSocket.send({
        address: "/state/neurons",
        args: [
          {
            type: "s",
            value: controllerId,
          },
          ...values,
        ],
      });
      break;
  }
}

function setup() {
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
      });

      oscWebSocket.on("open", function (err) {
        oscWebSocket.send({
          address: "/registerSimulation",
          args: [],
        });
      });

      oscWebSocket.on("message", function (oscMsg) {
        //console.log(oscMsg);
        parseOscMessage(oscMsg);
      });

      oscWebSocket.open();
    })
    .catch((err) => {
      console.error("Error loading configuration", err);
    });

  createCanvas(windowWidth, windowHeight);
  updateNetLayout();
  syn_colors = {
    "-1": color(
      synapseInhibitoryColor[0],
      synapseInhibitoryColor[1],
      synapseInhibitoryColor[2],
    ),
    1: color(
      synapseExcitatoryColor[0],
      synapseExcitatoryColor[1],
      synapseExcitatoryColor[2],
    ),
  };

  NN = new NeuralNetwork();
  NN.add_neurons(n_neurons);
  NN.add_all_synapses();

  NN.set_random_weight(settings["weight mean"], settings["weight size"]);
  NN.set_random_delay(settings["delay mean"], settings["delay size"]);
  NN.set_dropout(settings["dropout"]);
  NN.set_type_proportion(settings["syn type"]);

  createNodes();
  createCircles();
  createPulsesAndKnobs();
  createScopes();
  windowResized();
  frameRate(frame_rate);
}

function createNodes() {
  nodes = [];
  for (let i = 0; i < n_neurons; i++) {
    let x = random(-width * 0.25, width * 0.25);
    let y = random(-height * 0.25, height * 0.25);
    node = new Node(createVector(x, y), mass);
    nodes.push(node);
  }
  closeNode = nodes[0];
}

function createCircles() {
  circles = [];
  for (let i = 0; i < n_neurons; i++) {
    if (i < escala_mayor.length) nota = escala_mayor[i];
    else nota = escala_mayor[0];
    let voice = new Voice(nota, 1 / 16, casio);
    NN.neurons[i].set_event_callback(function () {
      voice.trigger();
      // Send OSC pulse message when neuron spikes
      if (oscWebSocket) {
        oscWebSocket.send({
          address: `/pulse`,
          args: [{ type: "i", value: i + 1 }] // Send 1-based neuron ID
        });
      }
    });
    voices.push(voice);
    let circle = new Circle(nodes[i].pos, settings["circle size"]);
    circles.push(circle);
    settings["dc " + (i + 1)] = 0;
  }
}

function createScopes() {
  scopes = [];
  scores = [];
  if (!showScopes) return;
  for (let i = 0; i < NN.neurons.length; i++) {
    let y = -i * score_sep + ((NN.neurons.length - 1) * score_sep) / 2;
    scope = new Scope(
      -width / 2 + net_score_border,
      y,
      width - net_score_border - marginx,
      40,
    );
    scopes.push(scope);
    score = new Score(
      -width / 2 + net_score_border,
      y,
      width - net_score_border - marginx,
      40,
    );
    scores.push(score);
  }
}

function updateNetLayout() {
  if (showScopes) {
    net_score_border = (net_scale - 0.5) * width;
    net_offset_x = -width / 2 + net_score_border / 2;
  } else {
    net_score_border = 0;
    net_offset_x = 0;
  }
}

function createPulsesAndKnobs() {
  pulses = [];
  nodeCon = [];
  knobs = [];
  for (let k = 0; k < NN.synapses.length; k++) {
    let S = NN.synapses[k];
    i = S.from.id;
    j = S.to.id;
    syn_type = NN.neurons[i].syn_type;
    let pulse = new Pulse(
      circles[i].position,
      circles[j].position,
      S.delay,
      syn_type,
      i,
      j,
    );
    pulse.set_arrival_callback(handlePulseArrival);
    S.set_event_callback(pulse.add_event.bind(pulse));
    pulses.push(pulse);
    nodeCon.push([i, j, S.weight]);

    // let y = NN.neurons.length - j + 1
    // let x = -i + (NN.neurons.length - 1) * 0.5
    let x = i;
    let y = j;
    let knob = new Knob(
      knobR * x * 2.2 - 200,
      knobR * y * 2.2 - width / 5,
      knobR,
      0,
    );
    knob.set_callback(function (v) {
      if (v < 0.01) v = 0;
      S.set_weight(v * maxWeight);
      weights_to_nodes(false);
    });
    knobs.push(knob);
  }
}

function handlePulseArrival(fromId, toId, size) {
  if (!nodes?.[toId] || !nodes?.[fromId]) return;
  const dir = nodes[toId].pos.copy().sub(nodes[fromId].pos);
  if (dir.mag() === 0) return;
  dir.normalize();
  const scale = settings["pulse force"] ?? 0;
  const impulse = dir.mult(scale * size);
  nodes[toId].impulse.add(impulse);
}

function saveNetwork() {
  let network = {
    neurons: [],
    synapses: [],
  };
  for (const neuron of NN.neurons) {
    network.neurons.push({
      id: neuron.id,
      syn_type: neuron.syn_type,
    });
  }
  for (const synapse of NN.synapses) {
    network.synapses.push({
      from: synapse.from.id,
      to: synapse.to.id,
      weight: synapse.weight,
      delay: synapse.delay,
      drop: synapse.drop,
    });
  }
  return btoa(JSON.stringify(network));
}

function loadNetwork(encodedNetwork) {
  settings = defaultSettings();
  const network = JSON.parse(atob(encodedNetwork));
  n_neurons = network.neurons.length;
  NN = new NeuralNetwork();
  NN.add_neurons(network.neurons.length);
  NN.add_all_synapses();
  for (let i = 0; i < network.neurons.length; i++) {
    NN.neurons[i].id = network.neurons[i].id;
    NN.neurons[i].syn_type = network.neurons[i].syn_type;
    settings["dc " + (i + 1)] = 0;
  }
  for (let i = 0; i < network.synapses.length; i++) {
    NN.synapses[i].set_weight(network.synapses[i].weight);
    NN.synapses[i].set_delay(network.synapses[i].delay);
    NN.synapses[i].drop = network.synapses[i].drop;
  }

  createNodes();
  createCircles();
  createPulsesAndKnobs();
  createScopes();
}

function draw() {
  background(backgroundColor[0], backgroundColor[1], backgroundColor[2]);

  translate(width / 2, height / 2);

  applyForces(nodes);

  nodes.forEach((node) => {
    node.update();
  });

  if (clicked == true && closeNode) {
    let mousePos = createVector(
      mouseX - width / 2 - net_offset_x,
      mouseY - height / 2 - net_offset_y,
    );
    closeNode.pos.lerp(mousePos, lerpValue);
    if (lerpValue < 0.95) {
      lerpValue += 0.02;
    }
  }

  for (let i = 0; i < NN.neurons.length; i++) {
    NN.neurons[i].dc = settings["dc " + (i + 1)];
    NN.neurons[i].noise = settings["noise"];
  }

  NN.update();

  for (let k = 0; k < NN.synapses.length; k++) {
    let wnorm = map(NN.synapses[k].weight, 0, maxWeight, 0, 10);
    // console.log(NN.synapses[k].weight, wnorm)
    wnorm = wnorm * !NN.synapses[k].drop;
    pulses[k].draw_line(Math.sqrt(wnorm) * 2);
  }
  for (let i = 0; i < NN.neurons.length; i++) {
    circles[i].draw(NN.neurons[i].Vnorm);
    if (showScopes) {
      if (NN.neurons[i].spike_event) scopes[i].draw(1);
      else scopes[i].draw(NN.neurons[i].Vnorm);
      scores[i].draw(NN.neurons[i].spike_event);
    }
  }
  for (let k = 0; k < NN.synapses.length; k++) {
    let wnorm = map(NN.synapses[k].weight, 0, maxWeight, 0, 10);
    wnorm = wnorm * !NN.synapses[k].drop;
    pulses[k].draw(wnorm);
  }
  for (let k = 0; k < NN.synapses.length; k++) {
    knobs[k].draw(mouseX - windowWidth / 2, mouseY - height / 2);
  }

  translate(-windowWidth / 2, -height / 2);
}

function weights_to_nodes(propagate) {
  for (let k = 0; k < NN.synapses.length; k++) {
    let S = NN.synapses[k];
    nodeCon[k][2] = S.weight;
    if (propagate) knobs[k].set_value(map(S.weight, 0, maxWeight, 0, 1));
  }
}

function broadcastWeights() {
  if (!oscWebSocket || !NN) return;
  for (let k = 0; k < NN.synapses.length; k++) {
    const S = NN.synapses[k];
    oscWebSocket.send({
      address: `/update/weight ${S.from.id + 1} ${S.to.id + 1}`,
      args: [{ type: "f", value: S.weight }],
    });
  }
}

function broadcastSynTypes() {
  if (!oscWebSocket || !NN) return;
  for (let i = 0; i < NN.neurons.length; i++) {
    const neuron = NN.neurons[i];
    oscWebSocket.send({
      address: `/update/syn type ${neuron.id + 1}`,
      args: [{ type: "f", value: neuron.syn_type }],
    });
  }
}

function delay_to_pulses() {
  for (let k = 0; k < NN.synapses.length; k++) {
    let S = NN.synapses[k];
    delay = S.delay;
    pulses[k].set_delay(delay);
  }
}

function mouseReleased() {
  clicked = false;
  for (let k = 0; k < NN.synapses.length; k++) {
    knobs[k].mouseReleased();
  }
}

function touchStarted() {
  if (clicked == true) {
    clicked = false;
    lerpValue = 0.2;
  } else {
    clicked = true;
    // let mousePos = createVector(mouseX - width / 2, mouseY - height / 2)
    let mousePos = createVector(
      mouseX - width / 2 - net_offset_x,
      mouseY - height / 2 - net_offset_y,
    );

    let i = 0;
    closeNode = null;
    nodes.forEach((node) => {
      if (
        dist(node.pos.x, node.pos.y, mousePos.x, mousePos.y) <
        circles[i].diameter / 2
      ) {
        closeNode = node;
      }
      i++;
    });
  }
  for (let k = 0; k < NN.synapses.length; k++) {
    let mousePos = createVector(mouseX - width / 2, mouseY - height / 2);
    knobs[k].mousePressed(mouseX - width / 2, mouseY - height / 2);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateNetLayout();
  for (let i = 0; i < NN.neurons.length; i++) {
    // scopes[i].width = windowWidth;
    // scopes[i].height = windowHeight / NN.neurons.length;
  }
}

document.documentElement.addEventListener("mousedown", function () {
  if (Tone.context.state !== "running") {
    Tone.context.resume();
  }
});
