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
    constructor(id, x, y, w, h, min, max, neuronSelector=false) {
        super(id, x, y, w, h);
        this.min = min;
        this.max = max;
        this.neuronSelector = neuronSelector;
    }

    draw() {
        stroke(0);
        strokeWeight(2);
        // bar
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        // value
        fill("#933129");
        rect(this.x, this.y, map(settings[this.id], this.min, this.max, 0, this.w), this.h);
        // circle
        fill("#D92919");
        ellipse(this.x + map(settings[this.id], this.min, this.max, 0, this.w), this.y + this.h/2, this.h + 10, this.h + 10);

        if (this.neuronSelector) {
            drawIdSelector(this.x + this.w + 20, this.y, this.id);
        } else {
            textSize(20)
            fill(255)
            text(settings[this.id].toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), this.x + this.w + 26, this.y + 16)
        }
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(settings[this.id], this.min, this.max, 0, this.w), this.y + this.h/2) < (this.h + 10) / 2) {
            this.dragging = true;
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max);
            this.updateValue(newValue);
        }
        if (!this.neuronSelector) return;
        let id = parseInt(this.id.split(' ')[1]);
        
        if (inSquareBounds(this.x + this.w + 20, this.y)){
            if (id > 1)
                id -= 1;
        }
        if (inSquareBounds(this.x + this.w + 84, this.y)) {
            if (id < neuronsAmount)
                id += 1;
        }
        this.id = "dc " + id;
    }

    handleDrag() {
        if (this.dragging) {
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max);
            this.updateValue(newValue);
        }
    }

    updateValue(value) {
        settings[this.id] = value;
        const oscMessage = {
            address: "/update",
            args: [
                {
                    type: "s",
                    value: this.id
                },
                {
                    type: "f",
                    value: settings[this.id]
                }
            ]
        };
        oscWebSocket.send(oscMessage);
    }
}

class Pad extends SliderElement {
    constructor(id, id2, x, y, w, h, min, max) {
        super(id, x, y, w, h);
        this.id2 = id2;
        this.min = min;
        this.max = max;
    }

    draw() {
        strokeWeight(2);
        stroke(0);
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        fill("#D92919");

        stroke("#933129");
        line(this.x + map(settings[this.id], this.min, this.max, 0, this.w), this.y, this.x + map(settings[this.id], this.min, this.max, 0, this.w), this.y + this.h);
        line(this.x, this.y + map(settings[this.id2], this.min, this.max, 0, this.h), this.x + this.w, this.y + map(settings[this.id2], this.min, this.max, 0, this.h));

        stroke(0);
        ellipse(this.x + map(settings[this.id], this.min, this.max, 0, this.w), this.y + map(settings[this.id2], this.min, this.max, 0, this.h), 30, 30);

        fill(255);
        text("x-axis:", this.x + this.w + 20, this.y + 16);
        drawIdSelector(this.x + this.w + 20, this.y + 30, this.id);
        text("y-axis:", this.x + this.w + 20, this.y + 86);
        drawIdSelector(this.x + this.w + 20, this.y + 100, this.id2);
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(settings[this.id], this.min, this.max, 0, this.w), this.y + map(settings[this.id2], this.min, this.max, 0, this.h)) < 15) {
            this.dragging = true;
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max);
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, this.min, this.max), this.min, this.max);
            this.updateValue(newValueX, newValueY);
        }
        let id = parseInt(this.id.split(' ')[1]);
        let id2 = parseInt(this.id2.split(' ')[1]);
        if (inSquareBounds(this.x + this.w + 84, this.y + 30)) {
            if (id != neuronsAmount) {
                if (id + 1 != id2) {
                    id += 1;
                } else if (id < neuronsAmount-1) {
                    id += 2;
                }
            }
        }
        if (inSquareBounds(this.x + this.w + 84, this.y + 100)) {
            if (id2 < neuronsAmount) {
                if (id2 + 1 != id) {
                    id2 += 1;
                } else if (id2 < neuronsAmount-1) {
                    id2 += 2;
                }
            }
        }
        if (inSquareBounds(this.x + this.w + 20, this.y + 30)) {
            if (id > 1) {
                if (id - 1 != id2) {
                    id -= 1;
                } else if (id > 2) {
                    id -= 2;
                }
            }
        }
        if (inSquareBounds(this.x + this.w + 20, this.y + 100)) {
            if (id2 > 0) {
                if (id2 - 1 != id) {
                    id2 -= 1;
                } else if (id2 > 1) {
                    id2 -= 2;
                }
            }
        }
        this.id = "dc " + id;
        this.id2 = "dc " + id2;
    }

    handleDrag() {
        if (this.dragging) {
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max);
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, this.min, this.max), this.min, this.max);
            this.updateValue(newValueX, newValueY);
        }
    }

    updateValue(valueX, valueY) {
        settings[this.id] = valueX;
        settings[this.id2] = valueY;
        const oscMessage = {
            address: "/update",
            args: [
                {
                    type: "s",
                    value: this.id
                },
                {
                    type: "f",
                    value: settings[this.id]
                },
                {
                    type: "s",
                    value: this.id2
                },
                {
                    type: "f",
                    value: settings[this.id2]
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
    id = parseInt(id.split(' ')[1]);
    textSize(20);
    // squares
    fill("#933129");
    square(x, y, 20);
    square(x + 64, y, 20);
    // text
    fill(255);
    text("-", x + 6, y + 16);
    text(id > 9 ? id : "0" + id, x + 30, y + 16);
    text("+", x + 68, y + 16);
}