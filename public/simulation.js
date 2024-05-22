let oscWebSocket;
let simulationId;
let backgroundColor;

class Ball {
    constructor(radius, color) {
        this.x = width/2;
        this.y = height/2;
        this.radius = radius;
        this.color = color;
    }

    draw() {
        fill(this.color);
        ellipse(this.x, this.y, this.radius * 2);
    }

    moveTo(x, y) {
        this.x = x;
        this.y = y;
    }
}

let balls = [];

function setup() {
    createCanvas(400, 400);
    backgroundColor = color(127, 127, 127);
    background(backgroundColor);

    balls.push(new Ball(20, color(255, 0, 0)));
    balls.push(new Ball(20, color(0, 255, 0)));

    simulationId = Math.random().toString(36).substring(2, 8);
    document.getElementById("title").innerText = "Simulation ID: " + simulationId;

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
        console.log(oscMsg);
        parseOscMessage(oscMsg);
    });
    oscWebSocket.open();
}

function draw() {
    background(backgroundColor);
    for (let ball of balls) {
        ball.draw();
    }
}

function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    if (addressParts[1] === "sliders") {
        const sliderId = addressParts[2];
        const sliderValue = oscMsg.args[0].value;
        switch (sliderId) {
            case "0":
                backgroundColor.setRed(255 * sliderValue);
                break;
            case "1":
                backgroundColor.setGreen(255 * sliderValue);
                break;
            case "2":
                backgroundColor.setBlue(255 * sliderValue);
                break;
        }
    } else if (addressParts[1] === "pads") {
        const padId = addressParts[2];
        const x = oscMsg.args[0].value * width;
        const y = oscMsg.args[1].value * height;
        balls[padId].moveTo(x, y);
    }
}