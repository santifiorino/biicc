/**
 * sketch.js — Pure visual renderer for the SNN simulation.
 *
 * The NeuralNetwork now runs server-side.  This client:
 *   • Registers as a visual client (/registerVisual)
 *   • Receives /server/init with full network structure (JSON)
 *   • Receives /server/voltages every tick (Vnorm per neuron)
 *   • Receives /server/spike/{id} when a neuron fires
 *   • Receives /server/* param changes for rendering updates
 *   • Keeps the force-directed layout, circles, pulses, scopes, audio
 */

// ── Global visual state ────────────────────────────────────────────────────

var syn_colors;
var net_score_border;
var frame_rate = 60;
var showScopes = false;

var maxDC = 150;
var maxWeight = 80;
var pulseDecay = 0.85;

var marginx = 50;
var gravityConstant = 1;
var forceConstantRepulsive = 10000;
var forceConstantAttractive = 0.00005;
var mass = 1;
var knobR = 20;
var score_sep;

var settings = defaultSettings();

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

// Visual / audio objects
var circles = [];
var pulses = [];
var knobs = [];
var scopes = [];
var voices = [];
var scores = [];

var nodes = [];
var nodeCon = [];

var clicked = false;
var lerpValue = 0.2;
var closeNode = null;

// Network data received from server
var networkData = null; // { neurons, synapses } from server init
var neuronVnorms = []; // updated every tick from /server/voltages
var neuronSpikes = []; // flags set to true for one frame on spike
var synapseMap = {}; // "fromId-toId" → index in networkData.synapses
var numSynapses = 0;

// Musical scales
var escala_mayor = [
  "D3","E3","F#3","G#3","A3","B3","C#4","D4","E4","F#4","G#4","A4",
];
var escala_menor = [
  "D3","E3","F3","G3","A3","B3","C4","D4","E4","F4","G4","A4",
];

var oscWebSocket;
var initialized = false;

// ── OSC message handling ───────────────────────────────────────────────────

function parseOscMessage(oscMsg) {
  const addressParts = oscMsg.address.split("/");
  const prefix = addressParts[1];

  // ── /server/init — full network state from server ─────────────────────
  if (prefix === "server" && addressParts[2] === "init") {
    // args[0] = our clientId (string), args[1] = JSON blob
    const jsonStr = oscMsg.args[1].value;
    const initData = JSON.parse(jsonStr);
    applyInitState(initData);
    return;
  }

  // ── /server/voltages — per-tick voltage broadcast ─────────────────────
  if (prefix === "server" && addressParts[2] === "voltages") {
    for (let i = 0; i < oscMsg.args.length && i < n_neurons; i++) {
      neuronVnorms[i] = oscMsg.args[i].value;
    }
    return;
  }

  // ── /server/spike/{id} — neuron spike event ───────────────────────────
  if (prefix === "server" && addressParts[2] === "spike") {
    const neuronId = parseInt(addressParts[3], 10); // 1-based
    if (neuronId >= 1 && neuronId <= n_neurons) {
      neuronSpikes[neuronId - 1] = true;
      // Trigger sound
      if (voices[neuronId - 1]) {
        voices[neuronId - 1].trigger();
      }
      // Trigger visual pulses on all synapses FROM this neuron
      if (networkData && networkData.synapses) {
        for (let k = 0; k < networkData.synapses.length; k++) {
          if (networkData.synapses[k].from === neuronId - 1) {
            if (pulses[k]) pulses[k].add_event();
          }
        }
      }
    }
    return;
  }

  // ── /server/neuron — DC update ────────────────────────────────────────
  if (prefix === "server" && addressParts[2] === "neuron") {
    const id = oscMsg.args?.[0]?.value;
    const value = oscMsg.args?.[1]?.value;
    if (typeof id === "number" && typeof value === "number") {
      settings["dc " + id] = value;
    }
    return;
  }

  // ── /server/weight/{from}/{to} — individual weight change ─────────────
  if (prefix === "server" && addressParts[2] === "weight" && addressParts[3] && addressParts[4]) {
    const fromId = parseInt(addressParts[3], 10) - 1;
    const toId = parseInt(addressParts[4], 10) - 1;
    const value = oscMsg.args[0].value;
    const key = fromId + "-" + toId;
    const k = synapseMap[key];
    if (k !== undefined) {
      networkData.synapses[k].weight = value;
      if (nodeCon[k]) nodeCon[k][2] = value;
      if (knobs[k]) knobs[k].set_value(map(value, 0, maxWeight, 0, 1));
    }
    return;
  }

  // ── /server/delay/{from}/{to} — individual delay change ───────────────
  if (prefix === "server" && addressParts[2] === "delay" && addressParts[3] && addressParts[4]) {
    const fromId = parseInt(addressParts[3], 10) - 1;
    const toId = parseInt(addressParts[4], 10) - 1;
    const value = oscMsg.args[0].value;
    const key = fromId + "-" + toId;
    const k = synapseMap[key];
    if (k !== undefined) {
      networkData.synapses[k].delay = value;
      if (pulses[k]) pulses[k].set_delay(value);
    }
    return;
  }

  // ── /server/syntype/{id} — neuron syn type change ─────────────────────
  if (prefix === "server" && addressParts[2] === "syntype" && addressParts[3]) {
    const neuronId = parseInt(addressParts[3], 10);
    const value = oscMsg.args[0].value;
    if (networkData && networkData.neurons[neuronId - 1]) {
      networkData.neurons[neuronId - 1].syn_type = value;
      if (circles[neuronId - 1]) {
        circles[neuronId - 1].color = syn_colors[value];
      }
      // Update pulse colors for synapses from this neuron
      for (let k = 0; k < networkData.synapses.length; k++) {
        if (networkData.synapses[k].from === neuronId - 1) {
          if (pulses[k]) pulses[k].set_syn_type(value);
        }
      }
    }
    return;
  }

  // ── /server/drop/{from}/{to} — synapse drop change ────────────────────
  if (prefix === "server" && addressParts[2] === "drop" && addressParts[3] && addressParts[4]) {
    const fromId = parseInt(addressParts[3], 10) - 1;
    const toId = parseInt(addressParts[4], 10) - 1;
    const value = oscMsg.args[0].value;
    const key = fromId + "-" + toId;
    const k = synapseMap[key];
    if (k !== undefined) {
      networkData.synapses[k].drop = value >= 0.5;
    }
    return;
  }

  // ── Rendering / physics parameter changes ─────────────────────────────
  if (prefix === "server") {
    const setting = addressParts[2];
    if (!setting) return;
    const value = oscMsg.args?.[0]?.value;
    if (value === undefined) return;

    if (setting === "pulse_force" || setting === "pulse force") {
      settings["pulse force"] = value;
    } else if (setting === "gravity_force" || setting === "gravity force") {
      gravityConstant = value;
      settings["gravity force"] = value;
    } else if (setting === "repel_force" || setting === "repel force") {
      forceConstantRepulsive = value;
      settings["repel force"] = value;
    } else if (setting === "attract_force" || setting === "attract force") {
      forceConstantAttractive = value;
      settings["attract force"] = value;
    } else if (setting === "audio_volume" || setting === "audio volume") {
      settings["audio volume"] = value;
      if (typeof Tone !== "undefined" && Tone.Destination) {
        Tone.Destination.volume.value = value;
      }
    } else if (setting === "audio_mute" || setting === "audio mute") {
      settings["audio mute"] = value;
      if (typeof Tone !== "undefined" && Tone.Destination) {
        Tone.Destination.mute = value > 0.5;
      }
    } else if (setting === "show_scopes" || setting === "show scopes") {
      settings["show scopes"] = value;
      showScopes = value > 0.5;
      createScopes();
      updateNetLayout();
    } else if (setting === "circle_size" || setting === "circle size") {
      settings["circle size"] = value;
      for (let i = 0; i < circles.length; i++) {
        circles[i].diameter = value;
      }
    } else {
      // Generic setting storage
      settings[setting.replace(/_/g, " ")] = value;
    }
    return;
  }
}

// ── Apply full init state from server ──────────────────────────────────────

function applyInitState(initData) {
  n_neurons = initData.numNeurons;
  score_sep = (12 - n_neurons) * 5 + 60;
  networkData = initData.network; // { neurons: [...], synapses: [...] }

  // Merge settings
  if (initData.settings) {
    Object.assign(settings, initData.settings);
    gravityConstant = settings["gravity force"] || 1;
    forceConstantRepulsive = settings["repel force"] || 10000;
    forceConstantAttractive = settings["attract force"] || 0.00005;
    showScopes = (settings["show scopes"] || 0) > 0.5;
  }

  // Init per-neuron DC settings if missing
  for (let i = 0; i < n_neurons; i++) {
    if (settings["dc " + (i + 1)] === undefined) {
      settings["dc " + (i + 1)] = 0;
    }
  }

  // Build synapse lookup map
  synapseMap = {};
  numSynapses = networkData.synapses.length;
  for (let k = 0; k < numSynapses; k++) {
    const s = networkData.synapses[k];
    synapseMap[s.from + "-" + s.to] = k;
  }

  // Init voltage / spike arrays
  neuronVnorms = new Array(n_neurons).fill(0);
  neuronSpikes = new Array(n_neurons).fill(false);

  // Build visual structures
  createNodes();
  createCircles();
  createPulsesAndKnobs();
  createScopes();
  updateNetLayout();

  initialized = true;
  console.log(`Visual client initialised: ${n_neurons} neurons, ${numSynapses} synapses`);
}

// ── p5.js setup ────────────────────────────────────────────────────────────

function setup() {
  createCanvas(windowWidth, windowHeight);

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

  score_sep = (12 - n_neurons) * 5 + 60;
  updateNetLayout();
  frameRate(frame_rate);

  // Connect to server via WebSocket
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

      oscWebSocket.on("open", function () {
        // Register as a visual client (not a simulation!)
        oscWebSocket.send({
          address: "/registerVisual",
          args: [
            {
              type: "s",
              value: "visual-" + Math.random().toString(36).substring(2, 8),
            },
          ],
        });
      });

      oscWebSocket.on("message", function (oscMsg) {
        parseOscMessage(oscMsg);
      });

      oscWebSocket.open();
    })
    .catch((err) => {
      console.error("Error loading configuration", err);
    });
}

// ── Visual structure creation ──────────────────────────────────────────────

function createNodes() {
  nodes = [];
  for (let i = 0; i < n_neurons; i++) {
    let x = random(-width * 0.25, width * 0.25);
    let y = random(-height * 0.25, height * 0.25);
    let node = new Node(createVector(x, y), mass);
    nodes.push(node);
  }
  closeNode = nodes[0];
}

function createCircles() {
  circles = [];
  voices = [];
  for (let i = 0; i < n_neurons; i++) {
    // Audio voice
    let nota;
    if (i < escala_mayor.length) nota = escala_mayor[i];
    else nota = escala_mayor[0];
    let voice = new Voice(nota, 1 / 16, casio);
    voices.push(voice);

    // Visual circle
    let circle = new Circle(nodes[i].pos, settings["circle size"]);
    // Set color from network data
    if (networkData && networkData.neurons[i]) {
      circle.color = syn_colors[networkData.neurons[i].syn_type];
    }
    circles.push(circle);
  }
}

function createScopes() {
  scopes = [];
  scores = [];
  if (!showScopes) return;
  for (let i = 0; i < n_neurons; i++) {
    let y = -i * score_sep + ((n_neurons - 1) * score_sep) / 2;
    let scope = new Scope(
      -width / 2 + net_score_border,
      y,
      width - net_score_border - marginx,
      40,
    );
    scopes.push(scope);
    let score = new Score(
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

  if (!networkData) return;

  for (let k = 0; k < networkData.synapses.length; k++) {
    const S = networkData.synapses[k];
    const i = S.from;
    const j = S.to;
    const syn_type = networkData.neurons[i].syn_type;

    let pulse = new Pulse(
      circles[i].position,
      circles[j].position,
      S.delay,
      syn_type,
      i,
      j,
    );
    pulse.set_arrival_callback(handlePulseArrival);
    pulses.push(pulse);
    nodeCon.push([i, j, S.weight]);

    let x = i;
    let y = j;
    let knob = new Knob(
      knobR * x * 2.2 - 200,
      knobR * y * 2.2 - width / 5,
      knobR,
      0,
    );
    knob.set_value(map(S.weight, 0, maxWeight, 0, 1));
    knob.set_callback(function (v) {
      if (v < 0.01) v = 0;
      const newWeight = v * maxWeight;
      // Send weight change to server
      if (oscWebSocket) {
        oscWebSocket.send({
          address: `/client/weight/${i + 1}/${j + 1}`,
          args: [{ type: "f", value: newWeight }],
        });
      }
      // Update local immediately for responsive UI
      S.weight = newWeight;
      nodeCon[k][2] = newWeight;
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

// ── Draw loop ──────────────────────────────────────────────────────────────

function draw() {
  if (!initialized) {
    background(backgroundColor[0], backgroundColor[1], backgroundColor[2]);
    // Show waiting text
    fill(200);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text("Connecting to simulation server…", width / 2, height / 2);
    return;
  }

  background(backgroundColor[0], backgroundColor[1], backgroundColor[2]);
  translate(width / 2, height / 2);

  // Physics forces (visual only)
  applyForces(nodes);
  nodes.forEach((node) => node.update());

  // Dragging interaction
  if (clicked && closeNode) {
    let mousePos = createVector(
      mouseX - width / 2 - net_offset_x,
      mouseY - height / 2 - net_offset_y,
    );
    closeNode.pos.lerp(mousePos, lerpValue);
    if (lerpValue < 0.95) lerpValue += 0.02;
  }

  // Draw synapse lines
  for (let k = 0; k < numSynapses; k++) {
    const S = networkData.synapses[k];
    let wnorm = map(S.weight, 0, maxWeight, 0, 10);
    wnorm = wnorm * !S.drop;
    pulses[k].draw_line(Math.sqrt(wnorm) * 2);
  }

  // Draw neuron circles using voltages from server
  for (let i = 0; i < n_neurons; i++) {
    circles[i].draw(neuronVnorms[i]);
    if (showScopes && scopes[i]) {
      if (neuronSpikes[i]) scopes[i].draw(1);
      else scopes[i].draw(neuronVnorms[i]);
      scores[i].draw(neuronSpikes[i]);
    }
  }

  // Draw pulses
  for (let k = 0; k < numSynapses; k++) {
    const S = networkData.synapses[k];
    let wnorm = map(S.weight, 0, maxWeight, 0, 10);
    wnorm = wnorm * !S.drop;
    pulses[k].draw(wnorm);
  }

  // Draw knobs
  for (let k = 0; k < knobs.length; k++) {
    knobs[k].draw(mouseX - windowWidth / 2, mouseY - height / 2);
  }

  translate(-windowWidth / 2, -height / 2);

  // Clear spike flags after rendering this frame
  for (let i = 0; i < n_neurons; i++) {
    neuronSpikes[i] = false;
  }
}

// ── Interaction ────────────────────────────────────────────────────────────

function mouseReleased() {
  clicked = false;
  for (let k = 0; k < knobs.length; k++) {
    knobs[k].mouseReleased();
  }
}

function touchStarted() {
  if (clicked) {
    clicked = false;
    lerpValue = 0.2;
  } else {
    clicked = true;
    let mousePos = createVector(
      mouseX - width / 2 - net_offset_x,
      mouseY - height / 2 - net_offset_y,
    );
    closeNode = null;
    for (let i = 0; i < nodes.length; i++) {
      if (
        dist(nodes[i].pos.x, nodes[i].pos.y, mousePos.x, mousePos.y) <
        circles[i].diameter / 2
      ) {
        closeNode = nodes[i];
      }
    }
  }
  for (let k = 0; k < knobs.length; k++) {
    knobs[k].mousePressed(mouseX - width / 2, mouseY - height / 2);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateNetLayout();
}

document.documentElement.addEventListener("mousedown", function () {
  if (Tone.context.state !== "running") {
    Tone.context.resume();
  }
});
