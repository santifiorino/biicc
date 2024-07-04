// abstract class for sliders and pads
class SliderElement {
    constructor(id, x, y, w, h) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.dragging = false;
    }

    draw() {
        throw new Error("Method 'draw()' must be implemented.");
    }

    handlePress() {
        throw new Error("Method 'handlePress()' must be implemented.");
    }

    mousePressed() {
        this.handlePress();
    }

    touchStarted() {
        this.handlePress();
    }

    handleRelease() {
        if (this.dragging)
            this.dragging = false;
    }

    mouseReleased() {
        this.handleRelease()
    }

    touchEnded() {
        this.handleRelease()
    }

    handleDrag() {
        throw new Error("Method 'handleDrag()' must be implemented.");
    }

    mouseDragged() {
        this.handleDrag();
    }

    touchMoved() {
        this.handleDrag();
    }
}

class Slider extends SliderElement {
    constructor(id, x, y, w, h, min, max) {
        super(id, x, y, w, h);
    }

    draw() {
        stroke(0);
        strokeWeight(2);
        // bar
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        // value
        fill("#933129");
        rect(this.x, this.y, map(neuronValues[this.id], 0, 1, 0, this.w), this.h);
        // circle
        fill("#D92919");
        ellipse(this.x + map(neuronValues[this.id], 0, 1, 0, this.w), this.y + this.h/2, this.h + 10, this.h + 10);

        drawIdSelector(this.x + this.w + 20, this.y, this.id);
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(neuronValues[this.id], 0, 1, 0, this.w), this.y + this.h/2) < (this.h + 10) / 2) {
            this.dragging = true;
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            this.updateValue(newValue);
        }
        if (inSquareBounds(this.x + this.w + 20, this.y)){
            if (this.id > 0)
                this.id -= 1;
        }
        if (inSquareBounds(this.x + this.w + 84, this.y)) {
            if (this.id < neuronValues.length-1)
                this.id += 1;
        }
    }

    handleDrag() {
        if (this.dragging) {
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            this.updateValue(newValue);
        }
    }

    updateValue(value) {
        neuronValues[this.id] = value;
        const oscMessage = {
            address: "/sliders/" + (this.id+1),
            args: [
                {
                    type: "f",
                    value: neuronValues[this.id]
                }
            ]
        };
        oscWebSocket.send(oscMessage);
    }
}

class Pad extends SliderElement {
    constructor(id, id2, x, y, w, h) {
        super(id, x, y, w, h);
        this.id2 = id2;
    }

    draw() {
        strokeWeight(2);
        stroke(0);
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        fill("#D92919");

        stroke("#933129");
        line(this.x + map(neuronValues[this.id], 0, 1, 0, this.w), this.y, this.x + map(neuronValues[this.id], 0, 1, 0, this.w), this.y + this.h);
        line(this.x, this.y + map(neuronValues[this.id2], 0, 1, 0, this.h), this.x + this.w, this.y + map(neuronValues[this.id2], 0, 1, 0, this.h));

        stroke(0);
        ellipse(this.x + map(neuronValues[this.id], 0, 1, 0, this.w), this.y + map(neuronValues[this.id2], 0, 1, 0, this.h), 30, 30);

        fill(255);
        text("x-axis:", this.x + this.w + 20, this.y + 16);
        drawIdSelector(this.x + this.w + 20, this.y + 30, this.id);
        text("y-axis:", this.x + this.w + 20, this.y + 86);
        drawIdSelector(this.x + this.w + 20, this.y + 100, this.id2);
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(neuronValues[this.id], 0, 1, 0, this.w), this.y + map(neuronValues[this.id2], 0, 1, 0, this.h)) < 15) {
            this.dragging = true;
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, 0, 1), 0, 1);
            this.updateValue(newValueX, newValueY);
        }

        if (inSquareBounds(this.x + this.w + 84, this.y + 30)) {
            if (this.id != neuronValues.length-1) {
                if (this.id + 1 != this.id2) {
                    this.id += 1;
                } else if (this.id < neuronValues.length-2) {
                    this.id += 2;
                }
            }
        }
        if (inSquareBounds(this.x + this.w + 84, this.y + 100)) {
            if (this.id2 < neuronValues.length-1) {
                if (this.id2 + 1 != this.id) {
                    this.id2 += 1;
                } else if (this.id2 < neuronValues.length-2) {
                    this.id2 += 2;
                }
            }
        }
        if (inSquareBounds(this.x + this.w + 20, this.y + 30)) {
            if (this.id > 0) {
                if (this.id - 1 != this.id2) {
                    this.id -= 1;
                } else if (this.id > 1) {
                    this.id -= 2;
                }
            }
        }
        if (inSquareBounds(this.x + this.w + 20, this.y + 100)) {
            if (this.id2 > 0) {
                if (this.id2 - 1 != this.id) {
                    this.id2 -= 1;
                } else if (this.id2 > 1) {
                    this.id2 -= 2;
                }
            }
        }
    }

    handleDrag() {
        if (this.dragging) {
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, 0, 1), 0, 1);
            this.updateValue(newValueX, newValueY);
        }
    }

    updateValue(valueX, valueY) {
        neuronValues[this.id] = valueX;
        neuronValues[this.id2] = valueY;
        const oscMessage = {
            address: "/pads/" + (this.id+1) + "/" + (this.id2+1),
            args: [
                {
                    type: "f",
                    value: neuronValues[this.id]
                },
                {
                    type: "f",
                    value: neuronValues[this.id2]
                }
            ]
        };
        oscWebSocket.send(oscMessage);
    }
}

function inSquareBounds(x, y) {
    if (!(x <= mouseX && mouseX <= x + 20)) return false;
    return (y <= mouseY && mouseY <= y + 20);
}

function drawIdSelector(x, y, id) {
    textSize(20);
    // squares
    fill("#933129");
    square(x, y, 20);
    square(x + 64, y, 20);
    // text
    fill(255);
    text("-", x + 6, y + 16);
    text((id+1 > 9) ? (id+1) : "0" + (id+1), x + 30, y + 16);
    text("+", x + 68, y + 16);
}