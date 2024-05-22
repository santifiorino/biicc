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

    mouseReleased() {
        this.dragging = false;
    }

    touchEnded() {
        this.dragging = false;
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
    constructor(id, x, y, w, h) {
        super(id, x, y, w, h);
        this.value = 0.5;
    }

    draw() {
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        fill("#933129");
        rect(this.x, this.y, map(this.value, 0, 1, 0, this.w), this.h);
        
        let handleW = 6;
        let handleH = this.h + 6;
        let handleX = this.x + map(this.value, 0, 1, 0, this.w) - handleW / 2;
        let handleY = this.y - 3;
        
        fill("#D92919");
        rect(handleX, handleY, handleW, handleH);
    }

    handlePress() {
        if (mouseX > this.x && mouseX < this.x + this.w && mouseY > this.y && mouseY < this.y + this.h) {
            this.dragging = true;
            const newValue = constrain(map(mouseX, this.x, this.x + this.w, 0, 1), 0, 1);
            this.updateValue(newValue);
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
        strokeWeight(0);
        fill("#1D1418");
        rect(this.x, this.y, this.w, this.h);
        fill("#D92919");

        stroke("#933129");
        strokeWeight(2);
        line(this.x + map(this.valueX, 0, 1, 0, this.w), this.y, this.x + map(this.valueX, 0, 1, 0, this.w), this.y + this.h);
        line(this.x, this.y + map(this.valueY, 0, 1, 0, this.h), this.x + this.w, this.y + map(this.valueY, 0, 1, 0, this.h));
        strokeWeight(0);

        ellipse(this.x + map(this.valueX, 0, 1, 0, this.w), this.y + map(this.valueY, 0, 1, 0, this.h), 20, 20);
    }

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(this.valueX, 0, 1, 0, this.w), this.y + map(this.valueY, 0, 1, 0, this.h)) < 10) {
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