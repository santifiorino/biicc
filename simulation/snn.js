/**
 * Server-side Spiking Neural Network module.
 * Ported from public/snn/snn.js — no browser/p5.js dependencies.
 */

// ─── Utility functions (replacing p5.js globals) ────────────────────────────

function mapValue(value, start1, stop1, start2, stop2) {
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

// Simple 1D Perlin-like noise (smooth pseudo-random)
// Uses a permutation table approach for deterministic smooth noise.
const _perm = new Uint8Array(512);
(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with a fixed seed for reproducibility
  let seed = 42;
  function rng() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
})();

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function grad1d(hash, x) {
  return (hash & 1) === 0 ? x : -x;
}

/**
 * 1D Perlin noise, matching p5's noise() output range [0, 1].
 */
function noise1d(x) {
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u = fade(xf);
  const a = grad1d(_perm[xi], xf);
  const b = grad1d(_perm[xi + 1], xf - 1);
  // lerp and remap from [-1,1] to [0,1]
  return (a + u * (b - a)) * 0.5 + 0.5;
}

// ─── Neuron ─────────────────────────────────────────────────────────────────

let _neuronIdCounter = 0;

function resetNeuronIdCounter() {
  _neuronIdCounter = 0;
}

function Neuron(frameRate) {
  this.frameRate = frameRate || 60;
  this.id = _neuronIdCounter++;

  this.I = 0;
  this.dc = 0;
  this.Ibuf = 0;
  this.dt = 0.25;
  this.maxIdt = 100;
  this.steps = 2;

  this.sp_bufferSize = 512;
  this.sp_buff_ptr = 0;
  this.sp_buff = new Array(this.sp_bufferSize).fill(0);

  this.synapses = [];

  this.V = 0;
  this.u = 0;

  this.spike_event = false;
  this.Vnorm = 0;
  this.syn_type = 1;
  this.scale_dt = 1;
  this.t = 0;
  this.noise = 0.0;
  this.seed = Math.random() * 1000;

  this.event_callback = null;

  this.reset();
}

Neuron.prototype.reset = function () {
  this.t = 0;
  this.maxV = 30;
  this.minV = -80;

  this.a = 0.02;
  this.b = 0.2;
  this.c = -65;
  this.d = 8;
  this.V = -65;
  this.u = this.b * this.V;

  // Synaptic variables
  this.sp = 0;
  this.s0 = 0;
  this.tau = 1;
};

Neuron.prototype.set_event_callback = function (cb) {
  this.event_callback = cb;
};

Neuron.prototype.event = function () {
  if (this.event_callback && typeof this.event_callback === "function") {
    this.event_callback();
  }
};

Neuron.prototype.update = function () {
  this.t += this.dt;
  let I =
    this.dc +
    this.Ibuf +
    this.noise * (noise1d(this.t * 100 + this.seed) - 0.5);

  if (I * this.dt > this.maxIdt) {
    I = this.maxIdt / this.dt;
  }

  for (let i = 0; i < this.steps; i++) {
    this.V =
      this.V +
      (0.04 * this.V * this.V + 5 * this.V + 140 - this.u + I) * this.dt;
    this.u = this.u + this.a * (this.b * this.V - this.u) * this.dt;
  }
  this.Vnorm = mapValue(this.V, -70, this.maxV, 0, 1);

  this.spike_event = false;

  if (this.V > this.maxV) {
    this.spike_event = true;
    this.V = this.c;
    this.u = this.u + this.d;
    this.s0 = this.syn_type;
    this.event();
  }

  this.sp = this.sp - (this.sp * this.dt) / this.tau;
  this.sp = this.sp + this.s0;

  this.sp_buff_ptr = (this.sp_buff_ptr + 1) % this.sp_bufferSize;
  this.sp_buff[this.sp_buff_ptr] = this.sp;

  this.s0 = 0;
  this.Ibuf = 0;

  return { V: this.V, Vnorm: this.Vnorm, u: this.u, spike: this.spike_event };
};

Neuron.prototype.currentBuffer = function (w, d, neuron) {
  const now = neuron.sp_buff_ptr;
  let past = now - Math.floor(d * this.frameRate);

  if (past > now - neuron.sp_bufferSize) {
    if (past < 0) {
      past += neuron.sp_bufferSize;
    }
    this.Ibuf += w * neuron.sp_buff[past];
  }
};

Neuron.prototype.set_type = function (type_) {
  if (type_ === "ch") {
    this.a = 0.02;
    this.b = 0.2;
    this.c = -50;
    this.d = 2;
  } else if (type_ === "rs") {
    this.a = 0.02;
    this.b = 0.2;
    this.c = -65;
    this.d = 8;
  }
};

Neuron.prototype.set_syn_tau = function (tau) {
  this.tau = tau;
};

// ─── Synapse ────────────────────────────────────────────────────────────────

let _synapseIdCounter = 0;

function resetSynapseIdCounter() {
  _synapseIdCounter = 0;
}

function Synapse(from, to) {
  this.from = from;
  this.to = to;
  this.weight = 0;
  this.delay = 0;
  this.drop = false;
  this.id = _synapseIdCounter++;
  this.event_callback = null;
}

Synapse.prototype.update = function () {
  this.to.currentBuffer(this.weight * !this.drop, this.delay, this.from);
  if (this.from.spike_event) {
    this.event();
  }
};

Synapse.prototype.set_event_callback = function (cb) {
  this.event_callback = cb;
};

Synapse.prototype.event = function () {
  if (this.event_callback && typeof this.event_callback === "function") {
    this.event_callback();
  }
};

Synapse.prototype.set_random_weight = function (_min, _max) {
  this.weight = Math.random() * (_max - _min) + _min;
};

Synapse.prototype.set_random_delay = function (_min, _max) {
  this.delay = Math.random() * (_max - _min) + _min;
};

Synapse.prototype.set_weight_delay = function (w, d) {
  this.weight = w;
  this.delay = d;
};

Synapse.prototype.set_delay = function (d) {
  this.delay = d;
};

Synapse.prototype.set_weight = function (w) {
  this.weight = w;
};

// ─── NeuralNetwork ──────────────────────────────────────────────────────────

function NeuralNetwork(frameRate) {
  this.frameRate = frameRate || 60;
  this.neurons = [];
  this.synapses = [];
}

NeuralNetwork.prototype.add_neuron = function () {
  const N = new Neuron(this.frameRate);
  this.neurons.push(N);
};

NeuralNetwork.prototype.add_neurons = function (n) {
  for (let i = 0; i < n; i++) {
    this.add_neuron();
  }
};

NeuralNetwork.prototype.add_synapse = function (from, to) {
  const S = new Synapse(from, to);
  this.synapses.push(S);
};

NeuralNetwork.prototype.add_all_synapses = function () {
  for (let i = 0; i < this.neurons.length; i++) {
    for (let j = 0; j < this.neurons.length; j++) {
      if (i !== j) {
        let existed = false;
        for (let k = 0; k < this.synapses.length; k++) {
          if (
            this.synapses[k].from.id === i &&
            this.synapses[k].to.id === j
          ) {
            existed = true;
          }
        }
        if (!existed) {
          this.add_synapse(this.neurons[i], this.neurons[j]);
        }
      }
    }
  }
};

NeuralNetwork.prototype.update = function () {
  for (let i = 0; i < this.neurons.length; i++) {
    this.neurons[i].update();
  }
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].update();
  }
};

NeuralNetwork.prototype.set_type_proportion = function (type_prop) {
  let c = 0;
  for (let i = 0; i < this.neurons.length; i++) {
    this.neurons[i].syn_type = (c < type_prop * this.neurons.length) * 2 - 1;
    c++;
  }
};

NeuralNetwork.prototype.set_dropout = function (prob) {
  for (let k = 0; k < this.synapses.length; k++) {
    const coin = prob > Math.random();
    this.synapses[k].drop = coin;
  }
};

NeuralNetwork.prototype.set_random_weight = function (mean, size) {
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].set_random_weight(mean - size / 2, mean + size / 2);
  }
};

NeuralNetwork.prototype.set_random_delay = function (mean, size) {
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].set_random_delay(mean - size / 2, mean + size / 2);
  }
};

NeuralNetwork.prototype.set_all_w_d = function (weight, delay) {
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].set_weight_delay(weight, delay);
  }
};

NeuralNetwork.prototype.set_all_delay = function (delay) {
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].set_delay(delay);
  }
};

NeuralNetwork.prototype.set_mean_delay = function (mean) {
  let m = 0;
  for (let k = 0; k < this.synapses.length; k++) {
    m += this.synapses[k].delay;
  }
  m = m / this.synapses.length;
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].delay = this.synapses[k].delay - m + mean;
    if (this.synapses[k].delay < 0) this.synapses[k].delay = 0;
  }
};

NeuralNetwork.prototype.set_mean_weight = function (mean) {
  let m = 0;
  for (let k = 0; k < this.synapses.length; k++) {
    m += this.synapses[k].weight;
  }
  m = m / this.synapses.length;
  for (let k = 0; k < this.synapses.length; k++) {
    this.synapses[k].weight = this.synapses[k].weight - m + mean;
    if (this.synapses[k].weight < 0) this.synapses[k].weight = 0;
  }
};

NeuralNetwork.prototype.reset = function () {
  for (let i = 0; i < this.neurons.length; i++) {
    this.neurons[i].reset();
  }
};

// ─── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize the full network state to a plain object (JSON-safe).
 */
NeuralNetwork.prototype.serialize = function () {
  const neurons = this.neurons.map((n) => ({
    id: n.id,
    syn_type: n.syn_type,
    V: n.V,
    u: n.u,
    sp: n.sp,
    dc: n.dc,
    noise: n.noise,
    tau: n.tau,
    a: n.a,
    b: n.b,
    c: n.c,
    d: n.d,
    steps: n.steps,
    dt: n.dt,
  }));
  const synapses = this.synapses.map((s) => ({
    from: s.from.id,
    to: s.to.id,
    weight: s.weight,
    delay: s.delay,
    drop: s.drop,
  }));
  return { neurons, synapses };
};

/**
 * Restore network state from a serialized object.
 * Assumes add_neurons + add_all_synapses have already been called with the
 * correct count.
 */
NeuralNetwork.prototype.deserialize = function (data) {
  for (let i = 0; i < data.neurons.length; i++) {
    const src = data.neurons[i];
    const n = this.neurons[i];
    n.syn_type = src.syn_type;
    if (src.V !== undefined) n.V = src.V;
    if (src.u !== undefined) n.u = src.u;
    if (src.sp !== undefined) n.sp = src.sp;
    if (src.dc !== undefined) n.dc = src.dc;
    if (src.noise !== undefined) n.noise = src.noise;
    if (src.tau !== undefined) n.tau = src.tau;
    if (src.a !== undefined) n.a = src.a;
    if (src.b !== undefined) n.b = src.b;
    if (src.c !== undefined) n.c = src.c;
    if (src.d !== undefined) n.d = src.d;
    if (src.steps !== undefined) n.steps = src.steps;
    if (src.dt !== undefined) n.dt = src.dt;
  }
  for (let i = 0; i < data.synapses.length; i++) {
    const src = data.synapses[i];
    const s = this.synapses[i];
    s.set_weight(src.weight);
    s.set_delay(src.delay);
    s.drop = !!src.drop;
  }
};

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  NeuralNetwork,
  Neuron,
  Synapse,
  mapValue,
  noise1d,
  resetNeuronIdCounter,
  resetSynapseIdCounter,
};
