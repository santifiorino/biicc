// var synth = new Tone.PolySynth().toDestination();

const casio = new Tone.Sampler({
    urls: {
        A1: "A1.mp3",
        A2: "A2.mp3",
    },
    baseUrl: "https://tonejs.github.io/audio/casio/",
}).toDestination();

const drum = new Tone.Sampler({
    urls: {
        A1: "808-Kicks01.wav",
        B1: "808-Snare01.wav",
        C2: "808-Clap01.wav",
        D2: "808-Clave1.wav",
        E2: "808-Conga1.wav",
        F2: "808-Cowbell1.wav",
        G2: "808-HiHats01.wav",
        A2: "808-OpenHiHats02.wav",
        B2: "808-Rim1.wav",
    },
    baseUrl: "sounds/",
}).toDestination();

synth = casio

function Voice(note, duration, synth) {
    this.synth = synth
    this.set_note(note);
    this.set_duration(duration);
}

Voice.prototype.set_midi_note = function (note) {
    this.note = Tone.Frequency(note, "midi");
}

Voice.prototype.set_synth = function (synth) {
    this.synth = synth;
}


Voice.prototype.set_note = function (note) {
    this.note = Tone.Frequency(note);
}

Voice.prototype.set_duration = function (duration) {
    this.duration = Tone.Time(duration).toNotation();
}

Voice.prototype.trigger = function () {
    this.synth.triggerAttackRelease(this.note, this.duration);
}
