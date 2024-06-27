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
        this.value = 0;
    }

    draw() {
        stroke(0);
        strokeWeight(2);
        // bar
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        // value
        fill("#933129");
        rect(this.x, this.y, map(this.value, 0, 1, 0, this.w), this.h);
        // circle
        fill("#D92919");
        ellipse(this.x + map(this.value, 0, 1, 0, this.w), this.y + this.h/2, this.h + 10, this.h + 10);

        textSize(this.h);
        // squares
        fill("#933129");
        square(this.x + this.w + 20, this.y, this.h);
        square(this.x + this.w + 84, this.y, this.h);
        // text
        fill(255);
        text("-", this.x + this.w + 26, this.y + 16);
        text((this.id > 9) ? this.id : "0" + this.id, this.x + this.w + 50, this.y + this.h - 2);
        text("+", this.x + this.w + 88, this.y + 16);
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(this.value, 0, 1, 0, this.w), this.y + this.h/2) < (this.h + 10) / 2) {
            this.dragging = true;
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            this.updateValue(newValue);
        }
        if (this.x + this.w + 20 <= mouseX && mouseX <= this.x + this.w + 20 + this.h) {
            if (this.y <= mouseY && mouseY <= this.y + this.h) {
                if (this.id > 1) this.id -= 1;
                this.value = 0;
            }
        }
        if (this.x + this.w + 84 <= mouseX && mouseX <= this.x + this.w + 84 + this.h) {
            if (this.y <= mouseY && mouseY <= this.y + this.h) {
                if (this.id < 12) this.id += 1;
                this.value = 0;
            }
        }
    }

    handleDrag() {
        if (this.dragging) {
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            this.updateValue(newValue);
        }
    }

    updateValue(value) {
        this.value = value;
        const oscMessage = {
            address: "/sliders/" + this.id,
            args: [
                {
                    type: "f",
                    value: this.value
                }
            ]
        };
        oscWebSocket.send(oscMessage);
    }
}

class Pad extends SliderElement {
    constructor(id, x, y, w, h) {
        super(id, x, y, w, h);
        this.valueX = 0.5;
        this.valueY = 0.5;
    }

    draw() {
        strokeWeight(2);
        stroke(0);
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        fill("#D92919");

        stroke("#933129");
        line(this.x + map(this.valueX, 0, 1, 0, this.w), this.y, this.x + map(this.valueX, 0, 1, 0, this.w), this.y + this.h);
        line(this.x, this.y + map(this.valueY, 0, 1, 0, this.h), this.x + this.w, this.y + map(this.valueY, 0, 1, 0, this.h));

        stroke(0);
        ellipse(this.x + map(this.valueX, 0, 1, 0, this.w), this.y + map(this.valueY, 0, 1, 0, this.h), 30, 30);
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(this.valueX, 0, 1, 0, this.w), this.y + map(this.valueY, 0, 1, 0, this.h)) < 15) {
            this.dragging = true;
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, 0, 1), 0, 1);
            this.updateValue(newValueX, newValueY);
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
        this.valueX = valueX;
        this.valueY = valueY;
        const oscMessage = {
            address: "/pads/" + this.id,
            args: [
                {
                    type: "f",
                    value: this.valueX
                },
                {
                    type: "f",
                    value: this.valueY
                }
            ]
        };
        oscWebSocket.send(oscMessage);
    }
}