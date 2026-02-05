class MyText {
  constructor(text, x, y, textSize) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.color = color(255);
    this.textSize = textSize || 16;
    this.align = "left"; // "left" | "center" | "right"
  }

  draw() {
    push();
    noStroke();
    fill(this.color);
    textSize(this.textSize);
    if (this.align === "center") {
      textAlign(CENTER, BASELINE);
    } else if (this.align === "right") {
      textAlign(RIGHT, BASELINE);
    } else {
      textAlign(LEFT, BASELINE);
    }
    text(this.text, this.x, this.y);
    pop();
  }
}
// abstract class for sliders and pads
class SliderElement {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.dragging = false;
  }

  draw() {
    throw new Error("Method 'draw()' must be implemented.");
  }

  mousePressed() {
    throw new Error("Method 'handlePress()' must be implemented.");
  }

  mouseReleased() {
    if (this.dragging) this.dragging = false;
  }

  mouseDragged() {
    throw new Error("Method 'handleDrag()' must be implemented.");
  }
}

class Slider extends SliderElement {
  constructor(value, x, y, w, h, min, max, onChange) {
    super(x, y, w, h);
    this.value = value;
    this.min = min;
    this.max = max;
    this.onChange = onChange;
  }

  draw() {
    stroke(0);
    strokeWeight(2);
    // bar
    fill("#1D1418");
    rect(this.x, this.y, this.w, this.h);
    // value
    fill("#933129");
    rect(
      this.x,
      this.y,
      map(this.value, this.min, this.max, 0, this.w),
      this.h,
    );
    // circle
    fill("#D92919");
    ellipse(
      this.x + map(this.value, this.min, this.max, 0, this.w),
      this.y + this.h / 2,
      this.h + 10,
      this.h + 10,
    );
  }

  mousePressed() {
    if (
      dist(
        mouseX,
        mouseY,
        this.x + map(this.value, this.min, this.max, 0, this.w),
        this.y + this.h / 2,
      ) <
      (this.h + 10) / 2
    ) {
      this.dragging = true;
      this.value = constrain(
        map(mouseX, this.x, this.x + this.w, this.min, this.max),
        this.min,
        this.max,
      );
      this.onChange(this.value);
    }
  }

  mouseDragged() {
    if (this.dragging) {
      this.value = constrain(
        map(mouseX, this.x, this.x + this.w, this.min, this.max),
        this.min,
        this.max,
      );
      this.onChange(this.value);
    }
  }
}

// Vertical variant of the slider (bottom = min, top = max)
class VerticalSlider extends SliderElement {
  constructor(value, x, y, w, h, min, max, onChange) {
    super(x, y, w, h);
    this.value = value;
    this.min = min;
    this.max = max;
    this.onChange = onChange;
  }

  draw() {
    push();
    // Outer pill-shaped track (white outline, no fill)
    stroke(255);
    strokeWeight(3);
    noFill();
    const radius = this.w / 2;
    rect(this.x, this.y, this.w, this.h, radius);

    // Inner movement bounds to keep the knob fully inside with margin
    const centerX = this.x + this.w / 2;
    const knobSize = Math.max(14, Math.floor(this.w * 0.6));
    const margin = Math.ceil(knobSize / 2) + 12;
    const innerTop = this.y + margin;
    const innerBottom = this.y + this.h - margin;
    const innerSpan = Math.max(0, innerBottom - innerTop);

    // Value bar (thin white pill from bottom up within the inner bounds)
    const t = map(this.value, this.min, this.max, 0, 1);
    const handleY = innerBottom - t * innerSpan;
    const barW = Math.max(6, Math.floor(this.w * 0.18));
    const barX = centerX - barW / 2;
    noStroke();
    fill(255);
    rect(barX, handleY, barW, innerBottom - handleY, barW / 2);

    // Circular knob (always inside track, with margin)
    ellipse(centerX, handleY, knobSize, knobSize);
    pop();
  }

  mousePressed() {
    const centerX = this.x + this.w / 2;
    const knobSize = Math.max(14, Math.floor(this.w * 0.6));
    const margin = Math.ceil(knobSize / 2) + 4;
    const innerTop = this.y + margin;
    const innerBottom = this.y + this.h - margin;
    const innerSpan = Math.max(0, innerBottom - innerTop);
    const t = map(this.value, this.min, this.max, 0, 1);
    const handleY = innerBottom - t * innerSpan;
    if (dist(mouseX, mouseY, centerX, handleY) < knobSize / 2) {
      this.dragging = true;
      const clampedY = constrain(mouseY, innerTop, innerBottom);
      this.value = map(clampedY, innerBottom, innerTop, this.min, this.max);
      this.onChange(this.value);
    }
  }

  mouseDragged() {
    if (this.dragging) {
      const knobSize = Math.max(14, Math.floor(this.w * 0.6));
      const margin = Math.ceil(knobSize / 2) + 4;
      const innerTop = this.y + margin;
      const innerBottom = this.y + this.h - margin;
      const clampedY = constrain(mouseY, innerTop, innerBottom);
      this.value = map(clampedY, innerBottom, innerTop, this.min, this.max);
      this.onChange(this.value);
    }
  }
}

class Pad extends SliderElement {
  constructor(valueX, valueY, x, y, w, h, min, max, onChange) {
    super(x, y, w, h);
    this.valueX = valueX;
    this.valueY = valueY;
    this.min = min;
    this.max = max;
    this.onChange = onChange;
  }

  draw() {
    stroke(0);
    strokeWeight(2);
    fill("#1D1418");
    rect(this.x, this.y, this.w, this.h);
    fill("#D92919");

    stroke("#933129");
    line(
      this.x + map(this.valueX, this.min, this.max, 0, this.w),
      this.y,
      this.x + map(this.valueX, this.min, this.max, 0, this.w),
      this.y + this.h,
    );
    line(
      this.x,
      this.y + map(this.valueY, this.min, this.max, 0, this.h),
      this.x + this.w,
      this.y + map(this.valueY, this.min, this.max, 0, this.h),
    );

    stroke(0);
    ellipse(
      this.x + map(this.valueX, this.min, this.max, 0, this.w),
      this.y + map(this.valueY, this.min, this.max, 0, this.h),
      30,
      30,
    );

    fill(255);
    text("x-axis:", this.x + this.w + 20, this.y + 16);
    // drawIdSelector(this.x + this.w + 20, this.y + 30, this.id)
    text("y-axis:", this.x + this.w + 20, this.y + 86);
  }

  mousePressed() {
    if (
      dist(
        mouseX,
        mouseY,
        this.x + map(this.valueX, this.min, this.max, 0, this.w),
        this.y + map(this.valueY, this.min, this.max, 0, this.h),
      ) < 15
    ) {
      this.dragging = true;
      const newValueX = constrain(
        map(mouseX, this.x, this.x + this.w, this.min, this.max),
        this.min,
        this.max,
      );
      const newValueY = constrain(
        map(mouseY, this.y, this.y + this.h, this.min, this.max),
        this.min,
        this.max,
      );
      this.valueX = newValueX;
      this.valueY = newValueY;
      this.onChange(newValueX, newValueY);
    }
  }

  mouseDragged() {
    if (this.dragging) {
      const newValueX = constrain(
        map(mouseX, this.x, this.x + this.w, this.min, this.max),
        this.min,
        this.max,
      );
      const newValueY = constrain(
        map(mouseY, this.y, this.y + this.h, this.min, this.max),
        this.min,
        this.max,
      );
      this.valueX = newValueX;
      this.valueY = newValueY;
      this.onChange(newValueX, newValueY);
    }
  }
}

class IdSelector {
  constructor(value, x, y, min, max, onChange) {
    this.value = value;
    this.x = x;
    this.y = y;
    this.min = min;
    this.max = max;
    this.onChange = onChange;
  }

  draw() {
    textSize(20);
    // squares
    fill("#933129");
    stroke(0);
    strokeWeight(2);
    square(this.x, this.y, 20);
    square(this.x + 64, this.y, 20);
    // text
    fill(255);
    text("-", this.x + 6, this.y + 16);
    text(
      this.value > 9 ? this.value : "0" + this.value,
      this.x + 30,
      this.y + 16,
    );
    text("+", this.x + 68, this.y + 16);
  }

  mousePressed() {
    if (inRectBounds(this.x, this.y, 20, 20)) {
      if (this.value > this.min) this.value -= 1;
      this.onChange(this.value);
    }
    if (inRectBounds(this.x + 64, this.y, 20, 20)) {
      if (this.value < this.max) this.value += 1;
      this.onChange(this.value);
    }
  }

  mouseReleased() {}

  mouseDragged() {}
}

function inSquareBounds(x, y) {
  if (!(x <= mouseX && mouseX <= x + 20)) return false;
  return y <= mouseY && mouseY <= y + 20;
}

function inRectBounds(x, y, w, h) {
  return x <= mouseX && mouseX <= x + w && y <= mouseY && mouseY <= y + h;
}

class Switch {
  /** Defaults to off, sends the corresponding value to onChange funct. */
  constructor(
    valueOff,
    valueOn,
    x,
    y,
    onChange,
    textOff = valueOff,
    textOn = valueOn,
  ) {
    this.valueOff = valueOff;
    this.valueOn = valueOn;
    this.x = x;
    this.y = y;
    this.onChange = onChange;
    this.value = valueOff;
    this.textOff = textOff;
    this.textOn = textOn;
  }

  draw() {
    fill(this.value === this.valueOff ? "#933129" : "#1D1418");
    rect(this.x, this.y, 150, 30);
    fill(this.value === this.valueOn ? "#933129" : "#1D1418");
    rect(this.x + 150, this.y, 150, 30);
    fill(255);
    textSize(20);
    stroke(0);
    text(this.textOff, this.x + 10, this.y + 21);
    text(this.textOn, this.x + 160, this.y + 21);
  }

  mousePressed() {
    if (inRectBounds(this.x, this.y, 150, 30) && this.value === this.valueOn) {
      this.value = this.valueOff;
      this.onChange(this.value);
    } else if (
      inRectBounds(this.x + 150, this.y, 150, 30) &&
      this.value === this.valueOff
    ) {
      this.value = this.valueOn;
      this.onChange(this.value);
    }
  }

  mouseReleased() {}

  mouseDragged() {}
}

// Simple centered circular button
class CircleButton {
  constructor(x, y, radius, onClick) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.onClick = onClick;
    this.pressed = false;
    this.activeUntilMs = 0; // visual feedback timeout
    this.feedbackMs = 200;
  }

  draw() {
    push();
    const now =
      typeof millis === "function"
        ? millis()
        : Date.now(); /* fallback, unit mismatch is fine for visuals */
    const isActive = now < this.activeUntilMs;
    if (isActive) {
      stroke(255);
      strokeWeight(3);
      fill(0);
    } else {
      noStroke();
      fill(255);
    }
    const remaining = Math.max(0, this.activeUntilMs - now);
    const scale =
      isActive && this.feedbackMs > 0
        ? 1 + 0.12 * (remaining / this.feedbackMs)
        : 1;
    ellipse(this.x, this.y, this.radius * 2 * scale, this.radius * 2 * scale);
    pop();
  }

  mousePressed() {
    if (dist(mouseX, mouseY, this.x, this.y) <= this.radius) {
      this.pressed = true;
      const now =
        typeof millis === "function" ? millis() : Date.now();
      this.activeUntilMs = now + this.feedbackMs; // short feedback
      if (typeof this.onClick === "function") {
        this.onClick();
      }
    }
  }

  mouseReleased() {
    this.pressed = false;
  }

  mouseDragged() {}
}
