var syn_colors;
var color_base;
var color_bright;
var net_score_border;
var frame_rate = 60;

maxDC = 150
maxWeight = 80

i = 0;
marginx = 50
gravityConstant = 1;
forceConstantRepulsive = 10000;
forceConstantAttractive = 0.00005;
mass = 1;
knobR = 20
score_sep = (12 - n_neurons) * 5 + 60

settings =
{
  'weight mean': maxWeight / 2,
  'weight size': maxWeight / 4,
  'delay mean': 1,
  'delay size': .001,
  'dt': 0.25,
  'circle size': 50,
  'note duration': 0.125,
  'note volume': -12,
  'syn type': 0.5,
  'dropout': 0.5,
  'net': true,
  'scale': 'Major',
  'dc all': 0.0,
  'noise': 0,
  'knobs': false,
  'syn tau': 1,
  'types all': 'rs',
  'sim steps': 2
}

circles = []
pulses = []
knobs = []
scopes = []
voices = []
scores = []
NN = null

nodes = []
nodeCon = []

clicked = false;
lerpValue = 0.2;

// scale = ["A4",]
escala_mayor = ['D3', 'E3', 'F#3', 'G#3', 'A3', 'B3', 'C#4', 'D4', 'E4', 'F#4', 'G#4', 'A4']
escala_menor = ['D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']
drumnotes = ['A1', 'B1', 'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2']


let oscWebSocket;
let simulationId;
let eventTracker;

function parseOscMessage(oscMsg) {
  const addressParts = oscMsg.address.split("/")
  switch (addressParts[1]) {
    case "update":
      switch (addressParts[2]) {
        case "setting":
          const setting = addressParts[3]
          const value = oscMsg.args[0].value;
          settings[setting] = value
          if (setting == "syn type") NN.set_syn_type(value)
          if (setting == "dropout") {
              NN.set_dropout(value)
              weights_to_nodes(true)
          }
          if (setting == "weight mean") {
              NN.set_mean_weight(value)
              weights_to_nodes(true)
          }
          if (setting == "weight size") {
              NN.set_size_weight(value)
              weights_to_nodes(true)
          }
          if (setting == "delay mean") {
              NN.set_mean_delay(value)
              delay_to_pulses()
          }
          if (setting == "delay size") {
              NN.set_size_delay(value)
              delay_to_pulses()
          }
          if (setting == "syn tau") NN.set_syn_tau(value)
          break
        case "synapse":
          for (const synapse of NN.synapses) {
            if (synapse.from.id == oscMsg.args[0].value && synapse.to.id == oscMsg.args[1].value) {
              switch (addressParts[3]) {
                case "weight":
                  synapse.set_weight(oscMsg.args[2].value)
                  break
                case "delay":
                  synapse.set_delay(oscMsg.args[2].value)
                  break
                case "dropout":
                  synapse.drop = Boolean(oscMsg.args[2].value)
                  break
              }
            }
          }
          break
        case "neuron":
          for (const neuron of NN.neurons) {
            if (neuron.id == oscMsg.args[0].value) {
              console.log(oscMsg.args[1].value)

              neuron.syn_type = oscMsg.args[1].value
              neuron.reset()
            }
          }
          for (let i = 0; i < NN.synapses.length; i++) {
            const synapse = NN.synapses[i]
            if (synapse.from.id == oscMsg.args[0].value) {
              pulses[i].set_syn_type(oscMsg.args[1].value)
            }
          }
      }
      break
    case "getState":
      const controllerId = oscMsg.args[0].value
      for (const setting in settings) {
        oscWebSocket.send({
          address: "/state/setting/" + setting,
          args: [
            {
              type: "s",
              value: controllerId
            },
            {
              type: "f",
              value: settings[setting]
            }]
        });
      }
      for (const synapse of NN.synapses) {
        oscWebSocket.send({
          address: "/state/synapse",
          args: [
            {
              type: "s",
              value: controllerId
            },
            {
              type: "i",
              value: synapse.from.id
            },
            {
              type: "i",
              value: synapse.to.id
            },
            {
              type: "f",
              value: synapse.weight
            },
            {
              type: "f",
              value: synapse.delay
            },
            {
              type: "f",
              value: synapse.drop
            }
          ]
        });
      }
      for (const neuron of NN.neurons) {
        oscWebSocket.send({
          address: "/state/neuron",
          args: [
            {
              type: "s",
              value: controllerId
            },
            {
              type: "i",
              value: neuron.id
            },
            {
              type: "f",
              value: neuron.syn_type
            }
          ]
        });
      }
      break;
    }
}

class EventTracker {
    constructor() {
        this.events = [];
        this.deltas = [];
        this.numberOfEventsGraph = [];
        this.deltaTimeMeanGraph = [];
        this.deltaTimeStdGraph = [];
    }

    addEvent(neuronId) {
        this.events.push([millis(), neuronId])
        if (this.events.length > 1) {
            this.deltas.push(this.events[this.events.length-1][0] - this.events[this.events.length-2][0]);
        }
    }

    displayInformation() {
        // TODO: make an abstraction for each metric to make it easier to add new ones and remove repeated code
        fill(255);
        
        let numberOfEvents = this.events.length;
        let deltaTimeMean = this.deltas.reduce((acc, val) => acc + val, 0) / this.deltas.length;
        if (!deltaTimeMean) deltaTimeMean = 0;
        let deltaTimeStd = Math.sqrt(
            this.deltas
                .reduce((acc, val) => acc.concat((val - deltaTimeMean) ** 2), [])
                .reduce((acc, val) => acc + val, 0) / this.deltas.length
        );
        if (!deltaTimeStd) deltaTimeStd = 0;

        this.numberOfEventsGraph.push(numberOfEvents);
        this.deltaTimeMeanGraph.push(deltaTimeMean);
        this.deltaTimeStdGraph.push(deltaTimeStd);
        if (this.numberOfEventsGraph.length == 301) {
            this.numberOfEventsGraph.shift();
            this.deltaTimeMeanGraph.shift();
            this.deltaTimeStdGraph.shift();
        }
        
        text("#Events (10s): " + numberOfEvents, windowWidth - 300, 80);
        text("Δt mean (10s): " + int(deltaTimeMean), width - 300, 270);
        text("Δt std (10s): " + int(deltaTimeStd), width - 300, 460);
        
        strokeWeight(2);
        stroke(20);
        for (let i = 0; i < 5; i++) {
            line(windowWidth - 300, 200 - i*20, windowWidth-20, 200 - i*20);
            line(windowWidth - 300, 400 - i*20, windowWidth-20, 400 - i*20);
            line(windowWidth - 300, 600 - i*20, windowWidth-20, 600 - i*20);
        }

        strokeWeight(0);
        for (let i = 0; i < this.numberOfEventsGraph.length; i++) {
            fill("red");
            ellipse(windowWidth-300 + 280/300*i, 200 - map(this.numberOfEventsGraph[i], 0, n_neurons*50, 0, 80), 3, 3)
            fill("green");
            ellipse(windowWidth-300 + 280/300*i, 400 - map(this.deltaTimeMeanGraph[i], 0, 500, 0, 80), 3, 3)
            fill("blue");
            ellipse(windowWidth-300 + 280/300*i, 600 - map(this.deltaTimeStdGraph[i], 0, 500, 0, 80), 3, 3)
        }
        fill("red");
        ellipse(windowWidth-300 + 280/300*(this.numberOfEventsGraph.length-1), 200 - map(this.numberOfEventsGraph[this.numberOfEventsGraph.length - 1], 0, n_neurons*50, 0, 80), 10, 10);
        fill("green");
        ellipse(windowWidth-300 + 280/300*(this.deltaTimeMeanGraph.length-1), 400 - map(this.deltaTimeMeanGraph[this.deltaTimeMeanGraph.length - 1], 0, 500, 0, 80), 10, 10);
        fill("blue");
        ellipse(windowWidth-300 + 280/300*(this.deltaTimeStdGraph.length-1), 600 - map(this.deltaTimeStdGraph[this.deltaTimeStdGraph.length - 1], 0, 500, 0, 80), 10, 10);
    }

    update() {
        const currMillis = millis();
        while (this.events.length > 0 && currMillis - this.events[0][0] > 10*1000) {
            this.events.shift();
            this.deltas.shift();
        }
    }
}

function setup() {

  simulationId = Math.random().toString(36).substring(2, 8);

  oscWebSocket = new osc.WebSocketPort({
    url: "ws://<IP_ADDR>:9000",
    metadata: true
  });

  oscWebSocket.on("ready", function () {
    console.log("WebSocket ready");
  });

  oscWebSocket.on("open", function (err) {
    oscWebSocket.send({
      address: "/registerSimulation",
        args: [
          {
            type: "s",
            value: simulationId
          }
        ]
    });
  });
  
  oscWebSocket.on("message", function (oscMsg) {
    //console.log(oscMsg);
    parseOscMessage(oscMsg);
  });

  oscWebSocket.open();

  eventTracker = new EventTracker();

  net_score_border = (net_scale - 0.6) * windowWidth
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 100);
  syn_colors = { '-1': color(0, 80, 100), '1': color(20, 80, 100) };
  color_base = color(0, 0, 70)
  color_bright = color(0, 0, 100)

  NN = new NeuralNetwork();
  NN.add_neurons(n_neurons);
  NN.add_all_synapses();


  NN.set_random_weight(settings['weight mean'], settings['weight size']);
  NN.set_random_delay(settings['delay mean'], settings['delay size']);
  NN.set_dropout(settings['dropout']);
  NN.set_type_proportion(settings['syn type']);



  for (let i = 0; i < n_neurons; i++) {
    let x = random(-width * 0.25, width * 0.25)
    let y = random(-height * 0.25, height * 0.25)
    node = new Node(createVector(x, y), mass)
    nodes.push(node);
  }
  closeNode = nodes[0]

  for (let i = 0; i < NN.neurons.length; i++) {
    if (i < escala_mayor.length)
      nota = escala_mayor[i]
    else
      nota = escala_mayor[0]
    let voice = new Voice(nota, 1 / 16, casio);
    NN.neurons[i].set_event_callback(function () {
        voice.trigger();
        eventTracker.addEvent(i)
    });
    voices.push(voice);
    let circle = new Circle(nodes[i].pos, settings['circle size']);
    circles.push(circle);
    settings['dc ' + (i + 1)] = 0
  }


  for (let k = 0; k < NN.synapses.length; k++) {
    let S = NN.synapses[k];
    i = S.from.id;
    j = S.to.id;
    syn_type = NN.neurons[i].syn_type
    let pulse = new Pulse(circles[i].position, circles[j].position, S.delay, syn_type);
    S.set_event_callback(pulse.add_event.bind(pulse));
    pulses.push(pulse);
    nodeCon.push([i, j, S.weight])

    // let y = NN.neurons.length - j + 1
    // let x = -i + (NN.neurons.length - 1) * 0.5
    let x = i
    let y = j
    let knob = new Knob(knobR * x * 2.2 - 200, knobR * y * 2.2 - width / 5, knobR, 0)
    knob.set_callback(function (v) {
      if (v < 0.01)
        v = 0;
      S.set_weight(v * maxWeight);
      weights_to_nodes(false);
    })
    knobs.push(knob)
  }

  for (let i = 0; i < NN.neurons.length; i++) {
    let y = -i * score_sep + (NN.neurons.length - 1) * score_sep / 2
    scope = new Scope(-width / 2 + net_score_border, y, width - net_score_border - marginx - 300, 40);
    scopes.push(scope);
    score = new Score(-width / 2 + net_score_border, y, width - net_score_border - marginx - 300, 40);
    scores.push(score);
  }

  var gui = new dat.GUI();
  const netFolder = gui.addFolder('Network');
  netFolder.open()
  netFolder.add(settings, 'syn type', 0, 1, 0.01).onChange(
    function () {
      NN.set_type_proportion(this.getValue());
      for (let k = 0; k < NN.synapses.length; k++) {
        let S = NN.synapses[k];
        i = S.from.id;
        j = S.to.id;
        syn_type = NN.neurons[i].syn_type
        pulses[k].set_syn_type(syn_type)
      }
    }
  );
  netFolder.add(settings, 'dropout', 0, 1.0, 0.01).onChange(
    function () {
      NN.set_dropout(this.getValue());
      weights_to_nodes(true);
    }
  );
  netFolder.add(settings, 'weight mean', 0, maxWeight, 1.0).onChange(
    function () {
      NN.set_mean_weight(this.getValue());
      weights_to_nodes(true);
    }
  );
  netFolder.add(settings, 'weight size', 0, maxWeight / 2, 1).onChange(
    function () {
      NN.set_size_weight(this.getValue());
      weights_to_nodes(true);
    }
  );
  netFolder.add(settings, 'delay mean', 0.01, 2.0, 0.001).onChange(
    function () {
      NN.set_mean_delay(this.getValue());
      delay_to_pulses();
    }
  );
  netFolder.add(settings, 'delay size', 0.001, 0.5, 0.001).onChange(
    function () {
      NN.set_size_delay(this.getValue());
      delay_to_pulses();
    }
  );
  netFolder.add(settings, 'syn tau', 0.5, 2, 0.01).onChange(
    (val) => {
      for (let i = 0; i < NN.neurons.length; i++) {
        NN.neurons[i].set_syn_tau(val)
      }
    }
  );
  netFolder.add(settings, 'sim steps', 1, 4, 1).onChange(
    (val) => {
      for (let i = 0; i < NN.neurons.length; i++) {
        NN.neurons[i].steps = val
      }
    }
  );

  // netFolder.add(settings, 'delay all', 0.02, 10.0, 0.01).onChange(
  //   (val) => {
  //     NN.set_all_delay(val);
  //     for (let k = 0; k < NN.synapses.length; k++) {
  //       let S = NN.synapses[k];
  //       delay = S.delay
  //       pulses[k].set_delay(delay)
  //     }
  //     weights_to_nodes(true);
  //   }
  // );

  netFolder.add(settings, 'knobs').onChange(
    (val) => {
      NN.print()
      for (let k = 0; k < NN.synapses.length; k++) {
        knobs[k].on = val;
      }
    }
  );
  const typesFolder = gui.addFolder('Types');
  typesFolder.add(settings, 'types all', { 'CH': 'ch', 'RS': 'rs' }).onChange(
    (val) => {
      for (let i = 0; i < NN.neurons.length; i++) {
        NN.neurons[i].set_type(val)
        // console.log(gui.__folders['Currents'].__controllers[i + 1])
        // gui.__folders['Currents'].__controllers[i + 2].setValue(val)
      }
    }
  )
  const currentFolder = gui.addFolder('Currents');

  currentFolder.add(settings, 'noise', 0, maxDC, 1)

  currentFolder.add(settings, 'dc all', 0, maxDC, 0.1).onChange(
    (val) => {
      for (let i = 0; i < NN.neurons.length; i++) {
        settings['dc ' + (i + 1)] = val;
        // console.log(gui.__folders['Currents'].__controllers[i + 1])
        gui.__folders['Currents'].__controllers[i + 2].setValue(val)
      }
    }
  );
  for (let i = 0; i < NN.neurons.length; i++) {
    currentFolder.add(settings, 'dc ' + (i + 1), 0, maxDC, 0.1);
  }

  const visFolder = gui.addFolder('Vis');
  visFolder.open()
  const visnetFolder = visFolder.addFolder('Net');
  visnetFolder.open()
  visnetFolder.add(settings, 'net').onChange(
    (val) => {
      for (let i = 0; i < NN.neurons.length; i++) {
        circles[i].on = val;
      }
      for (let k = 0; k < NN.synapses.length; k++) {
        pulses[k].on = val;
      }
    }
  );
  visnetFolder.add(settings, 'circle size', 0, 50, 1).onChange(
    function () {
      for (let i = 0; i < NN.neurons.length; i++) {
        circles[i].diameter = this.getValue();
      }
    }
  );
  const sndFolder = gui.addFolder('Sound');
  sndFolder.open()
  sndFolder.add(settings, 'note duration', .01, 1, 0.01).onChange(
    function () {
      for (let i = 0; i < voices.length; i++) {
        voices[i].set_duration(this.getValue());
      }
    }
  );
  sndFolder.add(settings, 'note volume', -24, 0, 1).onChange(
    (val) => { synth.volume.value = val }
  )
  sndFolder.add(settings, 'scale', { Drum: 'drum', Major: 'major', Minor: 'minor', Harmonics: 'harmonics', Mix: 'mix' }).onChange(
    (val) => {
      var notes;
      if (val == 'drum') {
        synths = Array(NN.neurons.length).fill(drum)
        notes = drumnotes
      }
      else if (val == 'major') {
        synths = Array(NN.neurons.length).fill(casio)
        notes = escala_mayor
      }
      else if (val == 'minor') {
        synths = Array(NN.neurons.length).fill(casio)
        notes = escala_menor
      }
      else if (val == 'harmonics') {
        synths = Array(NN.neurons.length).fill(casio)
        notes = Array(NN.neurons.length).fill().map((v, i) => 25 * (i + 1) + "Hz");
      }

      else if (val == 'mix') {
        synths = Array(NN.neurons.length).fill(casio)
        notes = escala_mayor

        for (let i = 0; i < 3; i++) {
          synths[i] = drum
          notes[i] = drumnotes[i]

        }
      }

      for (let i = 0; i < voices.length; i++) {
        if (i < notes.length) {
          voices[i].set_note(notes[i]);
          voices[i].set_synth(synths[i]);
        }
      }
    }
  )
  // gui.add({ 'kick': function () { kick() } }, 'kick');
  windowResized()

  frameRate(frame_rate)
}

function draw() {
  background(20);

  translate(width / 2, height / 2)

  applyForces(nodes)

  nodes.forEach(node => {
    node.update()
  })

  if (clicked == true && closeNode) {
    let mousePos = createVector(mouseX - width / 2 - net_offset_x, mouseY - height / 2 - net_offset_y)
    closeNode.pos.lerp(mousePos, lerpValue)
    if (lerpValue < 0.95) {
      lerpValue += 0.02;
    }
  }

  for (let i = 0; i < NN.neurons.length; i++) {
    NN.neurons[i].dc = settings['dc ' + (i + 1)];
    NN.neurons[i].noise = settings['noise'];
  }

  NN.update();

  for (let k = 0; k < NN.synapses.length; k++) {
    let wnorm = map(NN.synapses[k].weight, 0, maxWeight, 0, 10);
    // console.log(NN.synapses[k].weight, wnorm)
    wnorm = wnorm * !NN.synapses[k].drop;
    pulses[k].draw_line(Math.sqrt(wnorm) * 2)
  }
  for (let i = 0; i < NN.neurons.length; i++) {
    circles[i].draw(NN.neurons[i].Vnorm)
    if (NN.neurons[i].spike_event)
      scopes[i].draw(1)
    else
      scopes[i].draw(NN.neurons[i].Vnorm)
    scores[i].draw(NN.neurons[i].spike_event)
  }
  for (let k = 0; k < NN.synapses.length; k++) {
    let wnorm = map(NN.synapses[k].weight, 0, maxWeight, 0, 10);
    wnorm = wnorm * !NN.synapses[k].drop;
    pulses[k].draw(wnorm)
  }
  for (let k = 0; k < NN.synapses.length; k++) {
    knobs[k].draw(mouseX - windowWidth / 2, mouseY - height / 2)
  }

  translate(-windowWidth / 2, -height / 2);

  fill(0);
  rect(windowWidth - 320, 0, 320, windowHeight);

  fill(255);
  textSize(32);
  text("Sim ID: " + simulationId, windowWidth - 300, 30);

  eventTracker.update();
  eventTracker.displayInformation();
  
}

function weights_to_nodes(propagate) {
  for (let k = 0; k < NN.synapses.length; k++) {
    let S = NN.synapses[k];
    nodeCon[k][2] = S.weight;
    if (propagate)
      knobs[k].set_value(map(S.weight, 0, maxWeight, 0, 1))
  }
}

function delay_to_pulses() {
  for (let k = 0; k < NN.synapses.length; k++) {
    let S = NN.synapses[k];
    delay = S.delay
    pulses[k].set_delay(delay)
  }
}

function mouseReleased() {
  clicked = false
  for (let k = 0; k < NN.synapses.length; k++) {
    knobs[k].mouseReleased()
  }
}

function touchStarted() {
  if (clicked == true) {
    clicked = false
    lerpValue = 0.2
  } else {
    clicked = true
    // let mousePos = createVector(mouseX - width / 2, mouseY - height / 2)
    let mousePos = createVector(mouseX - width / 2 - net_offset_x, mouseY - height / 2 - net_offset_y)

    let i = 0;
    closeNode = null;
    nodes.forEach((node) => {
      if (dist(node.pos.x, node.pos.y, mousePos.x, mousePos.y) < circles[i].diameter / 2) {
        closeNode = node;
      }
      i++;

    })
  }
  for (let k = 0; k < NN.synapses.length; k++) {
    let mousePos = createVector(mouseX - width / 2, mouseY - height / 2)
    knobs[k].mousePressed(mouseX - width / 2, mouseY - height / 2)
  }
}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  net_score_border = (net_scale - 0.5) * width
  net_offset_x = -windowWidth / 2 + net_score_border / 2;
  for (let i = 0; i < NN.neurons.length; i++) {
    // scopes[i].width = windowWidth;
    // scopes[i].height = windowHeight / NN.neurons.length;
  }

}

document.documentElement.addEventListener(
  "mousedown", function () {
    if (Tone.context.state !== 'running') {
      Tone.context.resume();
    }
  }
)