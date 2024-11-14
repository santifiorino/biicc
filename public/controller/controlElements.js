// abstract class for sliders and pads
class SliderElement {
    constructor(x, y, w, h) {
        this.x = x
        this.y = y
        this.w = w
        this.h = h
        this.dragging = false
    }

    draw() {
        throw new Error("Method 'draw()' must be implemented.")
    }

    mousePressed() {
        throw new Error("Method 'handlePress()' must be implemented.")
    }

    mouseReleased() {
        if (this.dragging)
            this.dragging = false
    }

    mouseDragged() {
        throw new Error("Method 'handleDrag()' must be implemented.")
    }

}

class Slider extends SliderElement {
    constructor(value, x, y, w, h, min, max, onChange) {
        super(x, y, w, h)
        this.value = value
        this.min = min
        this.max = max
        this.onChange = onChange
    }

    draw() {
        stroke(0)
        strokeWeight(2)
        // bar
        fill("#1D1418")
        rect(this.x, this.y, this.w, this.h)
        // value
        fill("#933129")
        rect(this.x, this.y, map(this.value, this.min, this.max, 0, this.w), this.h)
        // circle
        fill("#D92919")
        ellipse(this.x + map(this.value, this.min, this.max, 0, this.w), this.y + this.h/2, this.h + 10, this.h + 10)
    }

    mousePressed() {
        if (dist(mouseX, mouseY, this.x + map(this.value, this.min, this.max, 0, this.w), this.y + this.h/2) < (this.h + 10) / 2) {
            this.dragging = true
            this.value = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            this.onChange(this.value)
        }
    }

    mouseDragged() {
        if (this.dragging) {
            this.value = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            this.onChange(this.value)
        }
    }
}

class Pad extends SliderElement {
    constructor(valueX, valueY, x, y, w, h, min, max, onChange) {
        super(x, y, w, h)
        this.valueX = valueX
        this.valueY = valueY
        this.min = min
        this.max = max
        this.onChange = onChange
    }

    draw() {
        stroke(0)
        strokeWeight(2)
        fill("#1D1418")
        rect(this.x, this.y, this.w, this.h)
        fill("#D92919")

        stroke("#933129")
        line(this.x + map(this.valueX, this.min, this.max, 0, this.w), this.y, this.x + map(this.valueX, this.min, this.max, 0, this.w), this.y + this.h)
        line(this.x, this.y + map(this.valueY, this.min, this.max, 0, this.h), this.x + this.w, this.y + map(this.valueY, this.min, this.max, 0, this.h))

        stroke(0)
        ellipse(this.x + map(this.valueX, this.min, this.max, 0, this.w), this.y + map(this.valueY, this.min, this.max, 0, this.h), 30, 30)

        fill(255)
        text("x-axis:", this.x + this.w + 20, this.y + 16)
        // drawIdSelector(this.x + this.w + 20, this.y + 30, this.id)
        text("y-axis:", this.x + this.w + 20, this.y + 86)

    }

    mousePressed() {
        if (dist(mouseX, mouseY, this.x + map(this.valueX, this.min, this.max, 0, this.w), this.y + map(this.valueY, this.min, this.max, 0, this.h)) < 15) {
            this.dragging = true
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, this.min, this.max), this.min, this.max)
            this.valueX = newValueX
            this.valueY = newValueY
            this.onChange(newValueX, newValueY)
        }
    }

    mouseDragged() {
        if (this.dragging) {
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, this.min, this.max), this.min, this.max)
            this.valueX = newValueX
            this.valueY = newValueY
            this.onChange(newValueX, newValueY)
        }
    }
}

class IdSelector {
    constructor(value, x, y, min, max, onChange) {
        this.value = value
        this.x = x
        this.y = y
        this.min = min
        this.max = max
        this.onChange = onChange
    }

    draw() {
        textSize(20)
        // squares
        fill("#933129")
        stroke(0)
        strokeWeight(2)
        square(this.x, this.y, 20)
        square(this.x + 64, this.y, 20)
        // text
        fill(255)
        text("-", this.x + 6, this.y + 16)
        text(this.value > 9 ? this.value : "0" + this.value, this.x + 30, this.y + 16)
        text("+", this.x + 68, this.y + 16)
    }

    mousePressed() {
        if (inRectBounds(this.x, this.y, 20, 20)){
            if (this.value > this.min)
                this.value -= 1
                this.onChange(this.value)
        }
        if (inRectBounds(this.x + 64, this.y, 20, 20)) {
            if (this.value < this.max)
                this.value += 1
                this.onChange(this.value)
        }
        
    }

    mouseReleased() {}

    mouseDragged() {}

}

function inSquareBounds(x, y) {
    if (!(x <= mouseX && mouseX <= x + 20)) return false
    return (y <= mouseY && mouseY <= y + 20)
}

function inRectBounds(x, y, w, h) {
    return (x <= mouseX && mouseX <= x + w && y <= mouseY && mouseY <= y + h)
}

class Switch {
    /** Defaults to off, sends the corresponding value to onChange funct. */
    constructor(valueOff, valueOn, x, y, onChange, textOff=valueOff, textOn=valueOn) {
        this.valueOff = valueOff
        this.valueOn = valueOn
        this.x = x
        this.y = y
        this.onChange = onChange
        this.value = valueOff
        this.textOff = textOff
        this.textOn = textOn
    }

    draw() {
        fill(this.value === this.valueOff ? "#933129" : "#1D1418")
        rect(this.x, this.y, 150, 30)
        fill(this.value === this.valueOn ? "#933129" : "#1D1418")
        rect(this.x + 150, this.y, 150, 30)
        fill(255)
        textSize(20)
        stroke(0)
        text(this.textOff, this.x + 10, this.y + 21)
        text(this.textOn, this.x + 160, this.y + 21)
    }

    mousePressed() {
        if (inRectBounds(this.x, this.y, 150, 30) && this.value === this.valueOn) {
            this.value = this.valueOff
            this.onChange(this.value)
        } else if (inRectBounds(this.x + 150, this.y, 150, 30) && this.value === this.valueOff) {
            this.value = this.valueOn
            this.onChange(this.value)
        }
    }

    mouseReleased() {}

    mouseDragged() {}
}