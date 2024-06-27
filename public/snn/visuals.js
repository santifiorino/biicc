
var net_offset_x = 0;
var net_offset_y = 0;
var net_scale = 1.0;


class Circle {
  constructor(position, diameter) {
    this.position = position;
    this.diameter = diameter;
    this.color = color_base;
    this.color_bright = color_bright;
    this.on = true;
  }
  set_color(color) {
    this.color = color;
  }
  draw(size) {

    // if (dist(this.position.x, this.position.y, mouseX, mouseY) < this.diameter / 2 && mouseIsPressed) {
    //   this.position.x = mouseX;
    //   this.position.y = mouseY;
    // }
    if (this.on) {
      push();
      translate(net_offset_x, net_offset_y)
      scale(net_scale)
      fill(this.color);
      stroke(this.color);
      circle(this.position.x, this.position.y, this.diameter)
      fill(this.color_bright);
      stroke(this.color_bright);
      circle(this.position.x, this.position.y, map(size, -0.1, 1, 0, this.diameter, true))
      pop();

    }
  }
}

aoff = 0.5

class Knob {
  constructor(x, y, r, angle) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.angle = angle;
    this.on = false;
    this.oldMouseY = this.y
  }

  get_value() {
    return map(this.angle, -PI + aoff, PI - aoff, 0.0, 1.0);
  }
  set_value(v) {
    this.angle = map(v, 0, 1, -PI + aoff, PI - aoff);
  }
  draw(mouseX, mouseY) {
    if (this.on) {
      if (this.dragging) {
        // var dx = mouseX - this.x;
        var dy = mouseY - this.oldMouseY;
        // var mouseAngle = atan2(dy, dx);
        let new_angle = this.angle - dy * 0.01;

        if ((new_angle > -PI + aoff) && (new_angle < PI - aoff)) {
          this.angle = new_angle;

          if (this.event_callback && typeof this.event_callback === "function") {
            this.event_callback(this.get_value());
          }
        }
        this.oldMouseY = mouseY
      }
      else
        this.oldMouseY = mouseY

      // Is it being dragged?
      // Fill according to state
      if (this.dragging) {
        fill(50, 50, 50);
      }
      else {
        fill(20, 20, 20);
      }
      // Draw ellipse for knob
      push();
      translate(this.x, this.y);
      rotate(this.angle - PI / 2);
      ellipse(0, 0, this.r * 2, this.r * 2);
      line(0, 0, this.r, 0);
      pop();
      fill(0);
    }
  }
  set_callback(cb) {
    this.event_callback = cb;
  }

  mousePressed(mouseX, mouseY) {

    if (this.on) {
      if (dist(mouseX, mouseY, this.x, this.y) < this.r) {
        this.dragging = true;
        // If so, keep track of relative location of click to corner of rectangle
        // var dx = mouseX - this.x;
        // var dy = mouseY - this.y;
        // this.offsetAngle = atan2(dy, dx) - this.angle;
      }
    }
  }
  mouseReleased() {
    if (this.on) {
      this.dragging = false;
    }
  }
}
class Pulse {
  constructor(p1, p2, delay, syn_type) {
    this.p1 = p1;
    this.p2 = p2;
    this.delay = delay;
    this.pulses = [];
    this.size = 5;
    this.line = true;
    this.color = color_base;
    this.on = true;
    this.syn_type = syn_type;
    this.syn_color = syn_colors[syn_type.toString()]
  }
  add_event() {
    this.pulses.push(0);
  }
  set_color(color) {
    this.color = color;
  }
  set_delay(delay) {
    this.delay = delay;
  }
  set_syn_type(syn_type) {
    this.syn_type = syn_type;
    this.syn_color = syn_colors[syn_type.toString()]
  }
  draw(size) {
    if (this.on) {
      push();
      translate(net_offset_x, net_offset_y)
      scale(net_scale)
      fill(this.syn_color);
      stroke(this.syn_color);
      let fr = frameRate();
      for (let i = 0; i < this.pulses.length; i++) {
        let t = this.pulses[i];
        // let x = p1.x*t+p2.x*(1-t);
        let p3 = p5.Vector.lerp(this.p1m, this.p2m, t)
        circle(p3.x, p3.y, size)
        this.pulses[i] += 1 / fr / (this.delay + 0.001);
      }
      this.pulses = this.pulses.filter(x => x < 1);
      pop()
    }
  }
  draw_line(size) {
    if (this.on) {
      push();
      translate(net_offset_x, net_offset_y)
      scale(net_scale)
      if (this.line) {
        noFill();
        stroke(this.color);
        strokeWeight(size);

        let paux = this.p2.copy().sub(this.p1);
        paux.rotate(PI / 2)
        paux.normalize().mult(5)
        // this.p3 = p5.Vector.add(this.p1, this.p2.copy().sub(this.p1))
        this.p2m = p5.Vector.add(this.p2, paux)
        // paux.rotate(PI)
        this.p1m = p5.Vector.add(this.p1, paux)
        // this.p3 = p5Vector.add(this.p1, p3)
        bezier(this.p1m.x, this.p1m.y, this.p2m.x, this.p2m.y,
          this.p1m.x, this.p1m.y, this.p2m.x, this.p2m.y);
        // bezier(this.p1.x, this.p1.y, this.p2.x, this.p2.y,
        // this.p1.x, this.p1.y, this.p2.x, this.p2.y);
      }
      pop()
    }

  }
}

class Score {
  constructor(left, bottom, width, height) {
    this.buffer_size = 256
    this.buffer = new Array(this.buffer_size).fill(0);
    this.left = left;
    this.bottom = bottom;
    this.width = width;
    this.height = height;
    this.color = color_bright;
    this.pt = 0;

  }

  set_color(color) {
    this.color = color;
  }

  draw(event) {
    if (event)
      event = 1;
    else
      event = 0;

    this.buffer[Math.floor(this.pt)] += event;
    this.pt = this.pt + 0.5;

    if (this.pt > this.buffer_size) {
      this.pt -= this.buffer_size;
      for (let i = 1; i < this.buffer_size; i++) {
        this.buffer[i] = 0;
      }
    }

    fill(this.color);
    stroke(this.color);

    for (let i = 1; i < this.buffer_size; i++) {
      if (this.buffer[i] > 0) {
        let x = this.left + i / this.buffer_size * this.width;
        strokeWeight(0.5);
        rect(x - 1, this.bottom, 2, this.height);
        // line(x, this.bottom, x, this.height);
      }
    }
  }
}

class Scope {
  constructor(left, bottom, width, height, buffer_size = 512) {
    this.buffer_size = buffer_size
    this.buffer = new Array(this.buffer_size).fill(0);
    this.left = left;
    this.bottom = bottom;
    this.width = width;
    this.height = height;
    this.pt = 0;
    this.color = color_bright;
  }

  set_color(color) {
    this.color = color;
  }

  draw(y) {
    this.buffer[this.pt] = y;
    this.pt = (this.pt + 1) % this.buffer_size;

    noFill();
    stroke(this.color);

    this.x_prev = this.left;
    this.y_prev = this.bottom - this.buffer[0] * this.height;

    for (let i = 1; i < this.buffer_size; i++) {
      let xx = this.left + i / this.buffer_size * this.width;
      let yy = this.buffer[i]
      yy = this.bottom - yy * this.height;
      strokeWeight(0.5);
      line(this.x_prev, this.y_prev, xx, yy);
      this.x_prev = xx;
      this.y_prev = yy;
    }
  }
}