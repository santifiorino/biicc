/**
 * SimulationRunner — headless SNN simulation that runs server-side.
 *
 * Responsibilities:
 *  • Create & own the NeuralNetwork
 *  • Run the update loop at a fixed tick rate
 *  • Apply parameter changes coming from controllers / admins
 *  • Emit events so the server can broadcast to visual / controller clients
 *  • Save / load full state to/from JSON files
 */

const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");
const {
  NeuralNetwork,
  resetNeuronIdCounter,
  resetSynapseIdCounter,
} = require("./snn");

// ─── Default settings (mirrors sketch.js defaults) ─────────────────────────

const MAX_DC = 150;
const MAX_WEIGHT = 80;

function defaultSettings() {
  return {
    "weight mean": MAX_WEIGHT / 2,
    "weight size": MAX_WEIGHT / 4,
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
    "pulse width": 0.3,
    "gravity force": 1,
    "repel force": 10000,
    "attract force": 0.00005,
    // rendering-only params that we still store so state sync works
    "audio volume": -12,
    "audio mute": 0,
    "show scopes": 0,
  };
}

// ─── SimulationRunner ───────────────────────────────────────────────────────

class SimulationRunner extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.numNeurons  – number of neurons (default 12)
   * @param {number} opts.frameRate   – ticks per second   (default 60)
   * @param {string} opts.stateFile   – path to JSON state dump to load
   */
  constructor(opts = {}) {
    super();
    this.numNeurons = opts.numNeurons || 12;
    this.frameRate = opts.frameRate || 60;
    this.settings = defaultSettings();
    this.NN = null;
    this._interval = null;
    this.running = false;
    this._pulseTimers = new Map();
    this._pulsePrevDc = new Map();

    this._init();

    // If a state dump was supplied, load it (overwrites the init above)
    if (opts.stateFile) {
      this.loadStateFile(opts.stateFile);
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  _init() {
    resetNeuronIdCounter();
    resetSynapseIdCounter();

    this.NN = new NeuralNetwork(this.frameRate);
    this.NN.add_neurons(this.numNeurons);
    this.NN.add_all_synapses();

    // Establish a stable drop order for admin UI (persisted in state dump)
    if (!Array.isArray(this.settings["drop order"])) {
      this.settings["drop order"] = this._buildDropOrder();
    }

    this.NN.set_random_weight(
      this.settings["weight mean"],
      this.settings["weight size"],
    );
    this.NN.set_random_delay(
      this.settings["delay mean"],
      this.settings["delay size"],
    );
    // Apply dropout using the deterministic order instead of random
    this._applyDropoutFromOrder(this.settings["dropout"]);
    this.NN.set_type_proportion(this.settings["syn type"]);

    // Initialise per-neuron DC settings
    for (let i = 0; i < this.numNeurons; i++) {
      this.settings["dc " + (i + 1)] = 0;
    }

    // Wire spike callbacks
    for (let i = 0; i < this.NN.neurons.length; i++) {
      const neuronId = i + 1; // 1-based
      this.NN.neurons[i].set_event_callback(() => {
        this.emit("spike", neuronId);
      });
    }
  }

  _buildDropOrder() {
    const keys = this.NN.synapses.map(
      (S) => `${S.from.id + 1}-${S.to.id + 1}`,
    );
    // Fisher-Yates shuffle (non-cryptographic)
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys;
  }

  _applyDropoutFromOrder(dropoutValue) {
    // Apply drops according to the drop order (deterministic)
    const order = this.settings["drop order"];
    if (!Array.isArray(order) || order.length === 0) return;
    
    const dropCount = Math.round((1 - dropoutValue) * order.length);
    
    // Build a set of dropped synapse keys
    const droppedSet = new Set();
    for (let i = 0; i < dropCount; i++) {
      droppedSet.add(order[i]);
    }
    
    // Apply to synapses
    for (const S of this.NN.synapses) {
      const key = `${S.from.id + 1}-${S.to.id + 1}`;
      S.drop = droppedSet.has(key);
    }
  }

  _startPulse(neuronId, broadcasts) {
    const id = parseInt(neuronId, 10);
    if (!Number.isFinite(id) || id < 1 || id > this.NN.neurons.length) return;

    if (this._pulseTimers.has(id)) {
      clearTimeout(this._pulseTimers.get(id));
      this._pulseTimers.delete(id);
    }

    const prev = this.settings["dc " + id] ?? 0;
    this._pulsePrevDc.set(id, prev);
    this.settings["dc " + id] = MAX_DC;
    broadcasts.push({
      address: "/server/neuron",
      args: [
        { type: "i", value: id },
        { type: "f", value: MAX_DC },
      ],
    });

    const pulseMs = Math.max(0, (this.settings["pulse width"] || 0) * 1000);
    const timer = setTimeout(() => {
      if (!this._pulsePrevDc.has(id)) return;
      const restore = this._pulsePrevDc.get(id);
      this._pulsePrevDc.delete(id);
      this._pulseTimers.delete(id);
      this.settings["dc " + id] = restore;
      this.emit("dc", { id, value: restore });
    }, pulseMs);
    this._pulseTimers.set(id, timer);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const interval = 1000 / this.frameRate;
    this._interval = setInterval(() => this._tick(), interval);
    console.log(
      `Simulation started: ${this.numNeurons} neurons @ ${this.frameRate} fps`,
    );
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this.running = false;
    console.log("Simulation stopped");
  }

  // ── tick ──────────────────────────────────────────────────────────────────

  _tick() {
    const nn = this.NN;

    // Push current settings into neurons
    for (let i = 0; i < nn.neurons.length; i++) {
      nn.neurons[i].dc = this.settings["dc " + (i + 1)] || 0;
      nn.neurons[i].noise = this.settings["noise"] || 0;
    }

    // Advance the simulation (spikes fire inside here → emit "spike")
    nn.update();

    // Collect normalised voltages and emit
    const voltages = new Array(nn.neurons.length);
    for (let i = 0; i < nn.neurons.length; i++) {
      voltages[i] = nn.neurons[i].Vnorm;
    }
    this.emit("voltages", voltages);
  }

  // ── handle incoming OSC from controllers / admins ────────────────────────

  /**
   * Process an OSC message that would previously have been handled by
   * sketch.js's parseOscMessage.
   *
   * Returns an array of "broadcast" objects that the server should send out
   * to all connected clients (visual + controllers + admins).
   * Each object: { address, args }
   *
   * If nothing needs broadcasting, returns [].
   */
  handleMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    const prefix = addressParts[1]; // "client", "update", "getState" …
    const broadcasts = [];

    // ── getState (request from server on behalf of a connecting client) ──
    if (prefix === "getState") {
      const controllerId = oscMsg.args[0].value;
      return this._buildStateMessages(controllerId);
    }

    if (prefix !== "update" && prefix !== "client") return broadcasts;

    // ── path-based /client/{resource}/{id…} ─────────────────────────────
    if (prefix === "client" && addressParts.length >= 3) {
      const resource = addressParts[2];
      const value = oscMsg.args[0].value;

      // /client/syntype/{id}
      if (resource === "syntype" && addressParts[3]) {
        const neuronId = parseInt(addressParts[3], 10);
        const neuron = this.NN.neurons[neuronId - 1];
        if (neuron) {
          neuron.syn_type = value >= 0 ? 1 : -1;
          broadcasts.push({
            address: `/server/syntype/${neuronId}`,
            args: [{ type: "f", value: neuron.syn_type }],
          });
        }
        return broadcasts;
      }

      // /client/weight/{from}/{to}
      if (resource === "weight" && addressParts[3] && addressParts[4]) {
        const fromId = parseInt(addressParts[3], 10) - 1;
        const toId = parseInt(addressParts[4], 10) - 1;
        for (const S of this.NN.synapses) {
          if (S.from.id === fromId && S.to.id === toId) {
            S.set_weight(value);
            broadcasts.push({
              address: `/server/weight/${fromId + 1}/${toId + 1}`,
              args: [{ type: "f", value }],
            });
            break;
          }
        }
        return broadcasts;
      }

      // /client/drop/{from}/{to}
      if (resource === "drop" && addressParts[3] && addressParts[4]) {
        const fromId = parseInt(addressParts[3], 10) - 1;
        const toId = parseInt(addressParts[4], 10) - 1;
        for (const S of this.NN.synapses) {
          if (S.from.id === fromId && S.to.id === toId) {
            S.drop = value >= 0.5;
            broadcasts.push({
              address: `/server/drop/${fromId + 1}/${toId + 1}`,
              args: [{ type: "f", value: S.drop ? 1 : 0 }],
            });
            break;
          }
        }
        return broadcasts;
      }

      // /client/pulse/{id}
      if (resource === "pulse" && addressParts[3]) {
        const neuronId = parseInt(addressParts[3], 10);
        this._startPulse(neuronId, broadcasts);
        return broadcasts;
      }
    }

    const setting = addressParts[2];

    // ── DC / neuron current ─────────────────────────────────────────────
    if (setting === "dc" || setting === "neuron") {
      const id = oscMsg.args?.[0]?.value;
      const value = oscMsg.args?.[1]?.value;
      if (typeof id === "number" && typeof value === "number") {
        if (this._pulseTimers.has(id)) {
          clearTimeout(this._pulseTimers.get(id));
          this._pulseTimers.delete(id);
          this._pulsePrevDc.delete(id);
        }
        this.settings["dc " + id] = value;
        broadcasts.push({
          address: "/server/neuron",
          args: [
            { type: "i", value: id },
            { type: "f", value },
          ],
        });
      }
      return broadcasts;
    }

    const value = oscMsg.args[0].value;

    // ── spike trigger ───────────────────────────────────────────────────
    if (/^spike \d+$/.test(setting) && value) {
      const neuronId = parseInt(setting.split(" ")[1], 10);
      const neuron = this.NN.neurons[neuronId - 1];
      if (neuron) {
        neuron.V = neuron.maxV + 1; // force spike on next tick
      }
      return broadcasts;
    }
    // /client/spike/{id} variant
    if (setting === "spike" && addressParts[3]) {
      const neuronId = parseInt(addressParts[3], 10);
      const neuron = this.NN.neurons[neuronId - 1];
      if (neuron) {
        neuron.V = neuron.maxV + 1;
      }
      return broadcasts;
    }

    // ── pulse trigger (space form) ──────────────────────────────────────
    if (/^pulse \d+$/.test(setting)) {
      const neuronId = parseInt(setting.split(" ")[1], 10);
      this._startPulse(neuronId, broadcasts);
      return broadcasts;
    }

    // ── syn type per neuron ─────────────────────────────────────────────
    if (/^syn type \d+$/.test(setting)) {
      const neuronId = parseInt(setting.split(" ")[2], 10);
      const neuron = this.NN.neurons[neuronId - 1];
      if (neuron) {
        neuron.syn_type = value >= 0 ? 1 : -1;
        broadcasts.push({
          address: `/server/syntype/${neuronId}`,
          args: [{ type: "f", value: neuron.syn_type }],
        });
      }
      return broadcasts;
    }

    // ── individual weight ───────────────────────────────────────────────
    if (/^weight \d+ \d+$/.test(setting)) {
      const parts = setting.split(" ");
      const fromId = parseInt(parts[1], 10) - 1;
      const toId = parseInt(parts[2], 10) - 1;
      for (const S of this.NN.synapses) {
        if (S.from.id === fromId && S.to.id === toId) {
          S.set_weight(value);
          broadcasts.push({
            address: `/server/weight/${fromId + 1}/${toId + 1}`,
            args: [{ type: "f", value }],
          });
          break;
        }
      }
      return broadcasts;
    }

    // ── individual drop ─────────────────────────────────────────────────
    if (/^drop \d+ \d+$/.test(setting)) {
      const parts = setting.split(" ");
      const fromId = parseInt(parts[1], 10) - 1;
      const toId = parseInt(parts[2], 10) - 1;
      for (const S of this.NN.synapses) {
        if (S.from.id === fromId && S.to.id === toId) {
          S.drop = value >= 0.5;
          broadcasts.push({
            address: `/server/drop/${fromId + 1}/${toId + 1}`,
            args: [{ type: "f", value: S.drop ? 1 : 0 }],
          });
          break;
        }
      }
      return broadcasts;
    }

    // ── weight mean / size (regenerate all weights) ─────────────────────
    if (setting === "weight mean" || setting === "weight size" ||
        setting === "weight_mean" || setting === "weight_size") {
      const key = setting.replace(/_/g, " ");
      this.settings[key] = value;
      this.NN.set_random_weight(
        this.settings["weight mean"],
        this.settings["weight size"],
      );
      // broadcast the setting value so other admin sliders sync
      broadcasts.push({
        address: `/server/${key}`,
        args: [{ type: "f", value }],
      });
      // broadcast every individual weight
      this._broadcastAllWeights(broadcasts);
      return broadcasts;
    }

    // ── delay mean / size (regenerate all delays) ───────────────────────
    if (setting === "delay mean" || setting === "delay size" ||
        setting === "delay_mean" || setting === "delay_size") {
      const key = setting.replace(/_/g, " ");
      this.settings[key] = value;
      this.NN.set_random_delay(
        this.settings["delay mean"],
        this.settings["delay size"],
      );
      // broadcast the setting value so other admin sliders sync
      broadcasts.push({
        address: `/server/${key}`,
        args: [{ type: "f", value }],
      });
      this._broadcastAllDelays(broadcasts);
      return broadcasts;
    }

    // ── syn type proportion ─────────────────────────────────────────────
    if (setting === "syn type" || setting === "syn_type") {
      this.settings["syn type"] = value;
      this.NN.set_type_proportion(value);
      // broadcast the proportion value so other admin sliders sync
      broadcasts.push({
        address: "/server/syn type",
        args: [{ type: "f", value }],
      });
      this._broadcastAllSynTypes(broadcasts);
      return broadcasts;
    }

    // ── dropout value only (do not randomise drops) ─────────────────────
    if (setting === "dropout value" || setting === "dropout_value") {
      this.settings["dropout"] = value;
      broadcasts.push({
        address: "/server/dropout",
        args: [{ type: "f", value }],
      });
      return broadcasts;
    }

    // ── dropout (randomise drops) ───────────────────────────────────────
    if (setting === "dropout") {
      this.settings["dropout"] = value;
      this._applyDropoutFromOrder(value);
      // broadcast the dropout value so other admin sliders sync
      broadcasts.push({
        address: "/server/dropout",
        args: [{ type: "f", value }],
      });
      this._broadcastAllDrops(broadcasts);
      return broadcasts;
    }

    // ── sim steps ───────────────────────────────────────────────────────
    if (setting === "sim steps" || setting === "sim_steps") {
      this.settings["sim steps"] = value;
      for (const n of this.NN.neurons) n.steps = value;
      return broadcasts;
    }

    // ── syn tau ─────────────────────────────────────────────────────────
    if (setting === "syn tau" || setting === "syn_tau") {
      this.settings["syn tau"] = value;
      for (const n of this.NN.neurons) n.set_syn_tau(value);
      return broadcasts;
    }

    // ── types all ───────────────────────────────────────────────────────
    if (setting === "types all" || setting === "types_all") {
      this.settings["types all"] = value;
      for (const n of this.NN.neurons) n.set_type(value);
      return broadcasts;
    }

    // ── rendering / audio params (store and forward as-is) ──────────────
    // These don't affect the simulation model but visual clients need them.
    const forwardSettings = [
      "pulse force", "pulse_force",
      "pulse width", "pulse_width",
      "gravity force", "gravity_force",
      "repel force", "repel_force",
      "attract force", "attract_force",
      "audio volume", "audio_volume",
      "audio mute", "audio_mute",
      "show scopes", "show_scopes",
      "circle size", "circle_size",
      "note duration", "note_duration",
      "note volume", "note_volume",
      "dt", "noise", "net", "scale", "knobs",
    ];
    const canonical = setting.replace(/_/g, " ");
    if (forwardSettings.includes(setting) || forwardSettings.includes(canonical)) {
      this.settings[canonical] = value;
      // If it's a simulation-relevant param, apply it
      if (canonical === "noise") {
        // applied in _tick
      }
      if (canonical === "dt") {
        for (const n of this.NN.neurons) n.dt = value;
      }
      // Broadcast the setting change to all clients as /server/{setting}
      broadcasts.push({
        address: `/server/${setting}`,
        args: [{ type: "f", value }],
      });
      return broadcasts;
    }

    // ── dc all ──────────────────────────────────────────────────────────
    if (setting === "dc all" || setting === "dc_all") {
      this.settings["dc all"] = value;
      for (let i = 0; i < this.NN.neurons.length; i++) {
        this.settings["dc " + (i + 1)] = value;
        broadcasts.push({
          address: "/server/neuron",
          args: [
            { type: "i", value: i + 1 },
            { type: "f", value },
          ],
        });
      }
      return broadcasts;
    }

    // ── fallback: store setting, broadcast as /server/* ─────────────────
    this.settings[canonical] = value;
    broadcasts.push({
      address: `/server/${setting}`,
      args: [{ type: "f", value }],
    });
    return broadcasts;
  }

  // ── state for new clients ────────────────────────────────────────────────

  /**
   * Build the set of OSC messages to send to a freshly connected client
   * so it can sync up.
   * @param {string} clientId
   */
  _buildStateMessages(clientId) {
    const msgs = [];

    // 1. Full init blob (JSON string) so visual clients can build structures
    const initData = {
      numNeurons: this.NN.neurons.length,
      settings: { ...this.settings },
      network: this.NN.serialize(),
    };
    msgs.push({
      address: "/server/init",
      args: [
        { type: "s", value: clientId },
        { type: "s", value: JSON.stringify(initData) },
      ],
    });

    // 2. DC values (for controller / admin UI)
    const dcArgs = [{ type: "s", value: clientId }];
    for (let i = 0; i < this.NN.neurons.length; i++) {
      dcArgs.push({
        type: "f",
        value: this.settings["dc " + (i + 1)] || 0,
      });
    }
    msgs.push({ address: "/server/neurons/dc", args: dcArgs });

    for (let i = 0; i < this.NN.neurons.length; i++) {
      msgs.push({
        address: `/server/syntype/${i + 1}`,
        args: [{ type: "f", value: this.NN.neurons[i].syn_type }],
      });
    }

    // 3. If it's an admin, also send all weights & syn types individually
    if (clientId.startsWith("admin-")) {
      // Send current setting values so admin sliders initialise correctly
      const adminSettings = [
        "weight mean", "weight size", "delay mean", "delay size",
        "syn type", "dropout", "pulse force", "pulse width",
        "gravity force", "repel force", "attract force",
        "audio volume", "audio mute", "show scopes",
      ];
      for (const key of adminSettings) {
        if (this.settings[key] !== undefined) {
          msgs.push({
            address: `/server/${key}`,
            args: [{ type: "f", value: this.settings[key] }],
          });
        }
      }

      // Send drop order so the admin UI uses the same order as the server
      if (!Array.isArray(this.settings["drop order"])) {
        this.settings["drop order"] = this._buildDropOrder();
      }
      msgs.push({
        address: "/server/droporder",
        args: [{ type: "s", value: JSON.stringify(this.settings["drop order"]) }],
      });

      for (const S of this.NN.synapses) {
        msgs.push({
          address: `/server/weight/${S.from.id + 1}/${S.to.id + 1}`,
          args: [{ type: "f", value: S.weight }],
        });
      }
      for (const S of this.NN.synapses) {
        msgs.push({
          address: `/server/drop/${S.from.id + 1}/${S.to.id + 1}`,
          args: [{ type: "f", value: S.drop ? 1 : 0 }],
        });
      }
    }

    return msgs;
  }

  /**
   * Return the full init state (for visual clients connecting).
   */
  getInitState() {
    return {
      numNeurons: this.NN.neurons.length,
      settings: { ...this.settings },
      network: this.NN.serialize(),
    };
  }

  // ── broadcast helpers ────────────────────────────────────────────────────

  _broadcastAllWeights(arr) {
    for (const S of this.NN.synapses) {
      arr.push({
        address: `/server/weight/${S.from.id + 1}/${S.to.id + 1}`,
        args: [{ type: "f", value: S.weight }],
      });
    }
  }

  _broadcastAllDelays(arr) {
    for (const S of this.NN.synapses) {
      arr.push({
        address: `/server/delay/${S.from.id + 1}/${S.to.id + 1}`,
        args: [{ type: "f", value: S.delay }],
      });
    }
  }

  _broadcastAllSynTypes(arr) {
    for (let i = 0; i < this.NN.neurons.length; i++) {
      arr.push({
        address: `/server/syntype/${i + 1}`,
        args: [{ type: "f", value: this.NN.neurons[i].syn_type }],
      });
    }
  }

  _broadcastAllDrops(arr) {
    for (const S of this.NN.synapses) {
      arr.push({
        address: `/server/drop/${S.from.id + 1}/${S.to.id + 1}`,
        args: [{ type: "f", value: S.drop ? 1 : 0 }],
      });
    }
  }

  // ── save / load ──────────────────────────────────────────────────────────

  saveStateFile(filePath) {
    const data = {
      numNeurons: this.numNeurons,
      frameRate: this.frameRate,
      settings: this.settings,
      network: this.NN.serialize(),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`State saved to ${filePath}`);
  }

  loadStateFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    this.numNeurons = data.numNeurons || data.network.neurons.length;
    if (data.frameRate) this.frameRate = data.frameRate;
    if (data.settings) {
      Object.assign(this.settings, data.settings);
    }

    // Rebuild network
    resetNeuronIdCounter();
    resetSynapseIdCounter();
    this.NN = new NeuralNetwork(this.frameRate);
    this.NN.add_neurons(this.numNeurons);
    this.NN.add_all_synapses();
    this.NN.deserialize(data.network);

    // Re-attach spike callbacks
    for (let i = 0; i < this.NN.neurons.length; i++) {
      const neuronId = i + 1;
      this.NN.neurons[i].set_event_callback(() => {
        this.emit("spike", neuronId);
      });
    }

    // Ensure per-neuron dc settings
    for (let i = 0; i < this.numNeurons; i++) {
      if (this.settings["dc " + (i + 1)] === undefined) {
        this.settings["dc " + (i + 1)] = 0;
      }
    }

    console.log(`State loaded from ${filePath} (${this.numNeurons} neurons)`);
  }
}

module.exports = { SimulationRunner, defaultSettings, MAX_DC, MAX_WEIGHT };
