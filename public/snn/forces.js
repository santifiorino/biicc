function applyForces(nodes) {

    // apply force towards centre
    nodes.forEach(node => {
        gravity = node.pos.copy().mult(-1).mult(gravityConstant)
        node.force = gravity
    })

    // apply repulsive force between nodes
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            pos = nodes[i].pos
            dir = nodes[j].pos.copy().sub(pos)
            force = dir.div(dir.mag() * dir.mag())
            force.mult(forceConstantRepulsive)
            nodes[i].force.add(force.copy().mult(-1))
            nodes[j].force.add(force)
        }
    }

    // apply forces applied by connections
    nodeCon.forEach(con => {
        let node1 = nodes[con[0]]
        let node2 = nodes[con[1]]
        let dis = node1.pos.copy().sub(node2.pos)
        dis.mult(con[2] * forceConstantAttractive);
        node1.force.sub(dis)
        node2.force.add(dis)
    })
}

function Node(pos, size) {
    this.pos = pos
    this.force = createVector(0, 0)
    this.mass = (2 * PI * size) / 1.5
    this.fs = []
}

Node.prototype.update = function () {
    force = this.force.copy()
    vel = force.copy().div(this.mass)
    // print("VEL", vel, "FORCE", force)
    this.pos.add(vel)
}
