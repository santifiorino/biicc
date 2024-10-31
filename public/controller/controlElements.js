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

    handlePress() {
        throw new Error("Method 'handlePress()' must be implemented.")
    }

    mousePressed() {
        this.handlePress()
    }

    touchStarted() {
        this.handlePress()
    }

    handleRelease() {
        if (this.dragging)
            this.dragging = false
    }

    mouseReleased() {
        this.handleRelease()
    }

    touchEnded() {
        this.handleRelease()
    }

    handleDrag() {
        throw new Error("Method 'handleDrag()' must be implemented.")
    }

    mouseDragged() {
        this.handleDrag()
    }

    touchMoved() {
        this.handleDrag()
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

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(this.value, this.min, this.max, 0, this.w), this.y + this.h/2) < (this.h + 10) / 2) {
            this.dragging = true
            this.value = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            this.onChange(this.value)
        }
    }

    handleDrag() {
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
        strokeWeight(2)
        stroke(0)
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

    handlePress() {
        if (dist(mouseX, mouseY, this.x + map(this.valueX, this.min, this.max, 0, this.w), this.y + map(this.valueY, this.min, this.max, 0, this.h)) < 15) {
            this.dragging = true
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, this.min, this.max), this.min, this.max)
            this.onChange(newValueX, newValueY)
        }
    }

    handleDrag() {
        if (this.dragging) {
            const newValueX = constrain(map(mouseX, this.x, this.x + this.w, this.min, this.max), this.min, this.max)
            const newValueY = constrain(map(mouseY, this.y, this.y + this.h, this.min, this.max), this.min, this.max)
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
        square(this.x, this.y, 20)
        square(this.x + 64, this.y, 20)
        // text
        fill(255)
        text("-", this.x + 6, this.y + 16)
        text(this.value > 9 ? this.value : "0" + this.value, this.x + 30, this.y + 16)
        text("+", this.x + 68, this.y + 16)
    }

    handlePress() {
        if (inSquareBounds(this.x, this.y)){
            if (this.value > this.min)
                this.value -= 1
                this.onChange(this.value)
        }
        if (inSquareBounds(this.x + 64, this.y)) {
            if (this.value < this.max)
                this.value += 1
                this.onChange(this.value)
        }
        
    }

    mousePressed() {
        this.handlePress()
    }

    touchStarted() {
        this.handlePress()
    }

    handleRelease() {}

    mouseReleased() {
        this.handleRelease()
    }

    touchEnded() {
        this.handleRelease()
    }

    handleDrag() {}

    mouseDragged() {
        this.handleDrag()
    }

    touchMoved() {
        this.handleDrag()
    }

}

function inSquareBounds(x, y) {
    if (!(x <= mouseX && mouseX <= x + 20)) return false
    return (y <= mouseY && mouseY <= y + 20)
}