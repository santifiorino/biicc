let oscWebSocket;

let controllerId;
let settings = {};
let neuronsAmount = 0;
let maxDC = 150;
let maxWeight = 80;

// Store incoming state before UI is created
let pendingWeights = {}; // key: "from-to", value: weight
let pendingSynTypes = {}; // key: neuronId, value: synType
let pendingDrops = {}; // key: "from-to", value: drop (0/1)
let pendingDropOrderKeys = null; // array of "from-to" keys

const adminSliders = [];
const adminKnobs = [];
const adminButtons = [];
const adminParamSliders = [];
let adminTypeSlider = null;
let adminPulseForceSlider = null;
let adminPulseWidthSlider = null;
const adminForceSliders = [];
let dropSlider = null;
const adminToggles = [];
let dropOrder = [];
let dropOrderKeys = [];
let volumeSlider = null;
let muteButton = null;
let scopesButton = null;

const layout = {
    marginX: 12,
    marginY: 36,
    panelGap: 18,
    sliderWidth: 18,
    sliderGap: 18,
    labelOffset: 18,
    toggleHeight: 28,
    toggleGap: 14,
    topRowHeight: 120,
    bottomRowHeight: 250,
    buttonHeight: 26,
    buttonGap: 10,
    paramSliderHeight: 16,
    paramSliderGap: 12,
    knobSize: 26,
    knobGap: 10,
    panelPadX: 16,
    panelPadY: 24,
};

function handleDisconnect(message) {
    // Stop drawing and hide canvas
    noLoop();
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.style.display = 'none';
    document.body.style.background = '#000';
    document.body.style.margin = '0';
    document.documentElement.style.background = '#000';
    document.documentElement.style.margin = '0';
    
    // Show disconnect message
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80vw; max-width: 900px; background: #000; border: 2px solid #fff; border-radius: 12px; color: #fff; font-family: sans-serif; font-size: clamp(24px, 6.5vw, 38px); font-weight: 700; line-height: 1.35; text-align: center; white-space: pre-line; padding: 24px; word-break: break-word; z-index: 10000;';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    controllerId = Math.random().toString(36).substring(2, 8);

    fetch("/api/config")
        .then((r) => r.json())
        .then((cfg) => {
            const wsUrl =
                (cfg && typeof cfg.wsUrl === "string" && cfg.wsUrl) ||
                `ws://${location.hostname}:9000`;

            oscWebSocket = new osc.WebSocketPort({
                url: wsUrl,
                metadata: true,
            });

            oscWebSocket.on("ready", function () {
                connectToSimulation();
            });

            oscWebSocket.on("message", function (oscMsg) {
                parseOscMessage(oscMsg);
            });

            oscWebSocket.open();
        })
        .catch((err) => {
            console.error("Error loading config, using fallback WebSocket URL:", err);
            // Fallback to default behavior
            oscWebSocket = new osc.WebSocketPort({
                url: `ws://${location.hostname}:9000`,
                metadata: true,
            });

            oscWebSocket.on("ready", function () {
                connectToSimulation();
            });

            oscWebSocket.on("message", function (oscMsg) {
                parseOscMessage(oscMsg);
            });

            oscWebSocket.open();
        });
}

function parseOscMessage(oscMsg) {
    const addressParts = oscMsg.address.split("/");
    switch (addressParts[1]) {
        case "disconnect": {
            const message = oscMsg.args?.[0]?.value || "Disconnected by server";
            handleDisconnect(message);
            break;
        }
        case "server": {
            // Handle /server/neuron (single neuron DC update)
            if (addressParts[2] === "neuron") {
                const id = oscMsg.args?.[0]?.value;
                const value = oscMsg.args?.[1]?.value;
                if (typeof id === "number" && typeof value === "number") {
                    const slider = adminSliders.find((s) => s.neuronId === id);
                    if (slider) {
                        slider.value = value;
                    }
                    settings["dc " + id] = value;
                }
                break;
            }
            
            // Handle /server/neurons/dc (initial state)
            if (addressParts[2] === "neurons" && addressParts[3] === "dc") {
                // args[0] is controllerId string, rest are DC values
                for (let i = 1; i < oscMsg.args.length; i++) {
                    settings["dc " + i] = oscMsg.args[i].value;
                }
                neuronsAmount = oscMsg.args.length - 1;
                createAdminControls();
                // Update existing sliders if they were already created
                for (let i = 1; i < oscMsg.args.length; i++) {
                    const slider = adminSliders.find((s) => s.neuronId === i);
                    if (slider) {
                        slider.value = oscMsg.args[i].value;
                    }
                }
                break;
            }
            
            // Handle /server/syntype/{id}
            if (addressParts[2] === "syntype") {
                const neuronId = parseInt(addressParts[3], 10);
                const value = oscMsg.args[0].value;
                pendingSynTypes[neuronId] = value >= 0 ? 1 : -1;
                const toggle = adminToggles.find((t) => t.neuronId === neuronId);
                if (toggle) {
                    toggle.value = value >= 0 ? 1 : -1;
                }
                break;
            }
            
            // Handle /server/weight/{from}/{to}
            if (addressParts[2] === "weight") {
                const fromId = parseInt(addressParts[3], 10);
                const toId = parseInt(addressParts[4], 10);
                const weightValue = oscMsg.args[0].value;
                pendingWeights[`${fromId}-${toId}`] = weightValue;
                // Immediately update knob if it exists
                const knob = adminKnobs.find((k) => k.fromId === fromId && k.toId === toId);
                if (knob) {
                    knob.value = constrain(weightValue / maxWeight, 0, 1);
                }
                break;
            }

            // Handle /server/drop/{from}/{to}
            if (addressParts[2] === "drop") {
                const fromId = parseInt(addressParts[3], 10);
                const toId = parseInt(addressParts[4], 10);
                const dropValue = oscMsg.args[0].value;
                pendingDrops[`${fromId}-${toId}`] = dropValue;
                // Immediately update knob if it exists
                const knob = adminKnobs.find((k) => k.fromId === fromId && k.toId === toId);
                if (knob) {
                    knob.drop = dropValue >= 0.5;
                }
                break;
            }

            // Handle /server/droporder (JSON array of "from-to" keys)
            if (addressParts[2] === "droporder") {
                const payload = oscMsg.args?.[0]?.value;
                try {
                    const parsed = JSON.parse(payload);
                    if (Array.isArray(parsed)) {
                        dropOrderKeys = parsed.slice();
                        pendingDropOrderKeys = parsed.slice();
                        buildDropOrder();
                    }
                } catch (_) {}
                break;
            }
            
            const neuronName = addressParts[2];
            // Normalise underscores→spaces so both "weight_mean" and
            // "weight mean" style addresses match the admin's setting keys.
            const normName = neuronName ? neuronName.replace(/_/g, " ") : neuronName;
            if (/^dc \d+$/.test(normName)) {
                const neuronId = parseInt(normName.split(" ")[1], 10);
                const slider = adminSliders.find((s) => s.neuronId === neuronId);
                if (slider) {
                    slider.value = oscMsg.args[0].value;
                }
            }
            // Legacy format support for old messages
            if (/^dc \d+$/.test(normName)) {
                const neuronId = parseInt(normName.split(" ")[1], 10);
                const slider = adminSliders.find((s) => s.neuronId === neuronId);
                if (slider) {
                    slider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "weight mean" || normName === "weight size" || normName === "delay mean" || normName === "delay size") {
                settings[normName] = oscMsg.args[0].value;
                const slider = adminParamSliders.find((s) => s.labelMap === normName);
                if (slider) {
                    slider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "syn type") {
                settings[normName] = oscMsg.args[0].value;
                if (adminTypeSlider) {
                    adminTypeSlider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "pulse force") {
                settings[normName] = oscMsg.args[0].value;
                if (adminPulseForceSlider) {
                    adminPulseForceSlider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "pulse width") {
                settings[normName] = oscMsg.args[0].value;
                if (adminPulseWidthSlider) {
                    adminPulseWidthSlider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "gravity force" || normName === "repel force" || normName === "attract force") {
                settings[normName] = oscMsg.args[0].value;
                const slider = adminForceSliders.find((s) => s.labelMap === normName);
                if (slider) {
                    slider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "audio volume") {
                settings[normName] = oscMsg.args[0].value;
                if (volumeSlider) {
                    volumeSlider.value = oscMsg.args[0].value;
                }
            }
            if (normName === "audio mute") {
                settings[normName] = oscMsg.args[0].value;
            }
            if (normName === "show scopes") {
                settings[normName] = oscMsg.args[0].value;
            }
            if (normName === "dropout") {
                settings[normName] = oscMsg.args[0].value;
                if (dropSlider) {
                    dropSlider.value = oscMsg.args[0].value;
                }
            }
            break;
        }
        case "state": {
            if (addressParts[2] === "dump") {
                const payload = oscMsg.args?.[0]?.value;
                if (payload) {
                    downloadJson("snn-settings", payload);
                }
                break;
            }
            for (let i = 0; i < oscMsg.args.length; i++) {
                settings["dc " + (i + 1)] = oscMsg.args[i].value;
            }
            neuronsAmount = oscMsg.args.length;
            createAdminControls();
            break;
        }
    }
}

function createAdminControls() {
    adminSliders.length = 0;
    adminKnobs.length = 0;
    adminButtons.length = 0;
    adminParamSliders.length = 0;
    adminTypeSlider = null;
    adminPulseForceSlider = null;
    adminPulseWidthSlider = null;
    adminForceSliders.length = 0;
    dropSlider = null;
    adminToggles.length = 0;
    volumeSlider = null;
    muteButton = null;
    scopesButton = null;

    if (!neuronsAmount) return;

    const ids = Array.from({ length: neuronsAmount }, (_, i) => i + 1);
    const panels = getAdminPanels();

    createA1Controls(ids, panels.A1.x, panels.A1.y, panels.A1.w, panels.A1.h);
    createKnobControls(panels.A2.x, panels.A2.y, panels.A2.w, panels.A2.h);
    createB1Controls(panels.B1.x, panels.B1.y, panels.B1.w, panels.B1.h);
    createKnobGrid(panels.B2.x, panels.B2.y, panels.B2.w, panels.B2.h);
    buildDropOrder();
    
    // Apply pending state that arrived before UI was created
    applyPendingState();
}

function applyPendingState() {
    // Apply pending syn types
    for (const [neuronId, synType] of Object.entries(pendingSynTypes)) {
        const toggle = adminToggles.find((t) => t.neuronId === parseInt(neuronId));
        if (toggle) {
            toggle.value = synType;
        }
    }
    
    // Apply pending weights
    for (const [key, weightValue] of Object.entries(pendingWeights)) {
        const [fromId, toId] = key.split('-').map(id => parseInt(id));
        const knob = adminKnobs.find((k) => k.fromId === fromId && k.toId === toId);
        if (knob) {
            knob.value = constrain(weightValue / maxWeight, 0, 1);
        }
    }

    // Apply pending drop states
    for (const [key, dropValue] of Object.entries(pendingDrops)) {
        const [fromId, toId] = key.split('-').map(id => parseInt(id));
        const knob = adminKnobs.find((k) => k.fromId === fromId && k.toId === toId);
        if (knob) {
            knob.drop = dropValue >= 0.5;
        }
    }

    if (dropSlider && settings["dropout"] !== undefined) {
        dropSlider.value = settings["dropout"];
    }

    if (pendingDropOrderKeys && pendingDropOrderKeys.length) {
        dropOrderKeys = pendingDropOrderKeys.slice();
        buildDropOrder();
        pendingDropOrderKeys = null;
    }
    
    // Also ensure DC sliders match what's in settings (in case of any mismatch)
    for (const slider of adminSliders) {
        const settingValue = settings["dc " + slider.neuronId];
        if (settingValue !== undefined) {
            slider.value = settingValue;
        }
    }
}

function getAdminPanels() {
    const totalW = windowWidth - layout.marginX * 2;
    const totalH = windowHeight - layout.marginY * 2;
    const colW = (totalW - layout.panelGap) / 2;
    const row1H = Math.min(layout.topRowHeight, totalH * 0.35);
    const row3H = Math.min(layout.bottomRowHeight, totalH * 0.35);
    const row2H = Math.max(120, totalH - row1H - row3H - layout.panelGap * 2);

    const leftX = layout.marginX;
    const rightX = leftX + colW + layout.panelGap;
    const row1Y = layout.marginY;
    const row2Y = row1Y + row1H + layout.panelGap;
    const row3Y = row2Y + row2H + layout.panelGap;

    return {
        A1: { x: leftX, y: row1Y, w: colW, h: row1H + layout.panelGap + row2H },
        A2: { x: rightX, y: row1Y, w: colW, h: row1H },
        B1: { x: leftX, y: row3Y, w: colW, h: row3H },
        B2: { x: rightX, y: row2Y, w: colW, h: row2H + layout.panelGap + row3H }
    };
}

function createA1Controls(ids, x, y, w, h) {
    if (ids.length === 0) return;
    const innerX = x + layout.panelPadX;
    const innerY = y + layout.panelPadY;
    const innerW = w - layout.panelPadX * 2;
    const innerH = h - layout.panelPadY * 2;

    const colGap = Math.min(layout.sliderGap, innerW / Math.max(1, ids.length * 2));
    const totalGap = Math.max(0, ids.length - 1) * colGap;
    const colWidth = Math.max(6, (innerW - totalGap) / ids.length);
    const sliderWidth = Math.min(layout.sliderWidth, colWidth * 0.6);
    const toggleWidth = Math.min(colWidth * 0.7, Math.max(18, sliderWidth * 1.6));

    const sliderTop = innerY + layout.labelOffset;
    const toggleY = innerY + innerH - layout.toggleHeight;
    const sliderHeight = Math.max(60, toggleY - sliderTop - layout.toggleGap);

    ids.forEach((neuronId, index) => {
        const colX = innerX + index * (colWidth + colGap);
        const centerX = colX + colWidth / 2;
        const sliderX = centerX - sliderWidth / 2;
        const slider = new AdminSlider(
            neuronId,
            settings["dc " + neuronId] ?? 0,
            sliderX,
            sliderTop,
            sliderWidth,
            sliderHeight,
            (val) => updateSetting("dc " + neuronId, val)
        );
        adminSliders.push(slider);

        const toggleX = centerX - toggleWidth / 2;
        const toggle = new AdminToggle(
            neuronId,
            toggleX,
            toggleY,
            toggleWidth,
            layout.toggleHeight,
            (val) => updateSetting(`syn type ${neuronId}`, val)
        );
        adminToggles.push(toggle);
    });
}

function createB1Controls(x, y, w, h) {
    const innerX = x + layout.panelPadX;
    const innerY = y + layout.panelPadY;
    const innerW = w - layout.panelPadX * 2;
    const innerH = h - layout.panelPadY * 2;
    const sliderWidth = innerW;
    const sliderHeight = layout.paramSliderHeight;
    
    // Calculate dynamic spacing to fit all controls
    const numForceSliders = 5;
    const numAudioRows = 1; // Volume slider + mute + scopes button on same row
    const totalElements = numForceSliders + numAudioRows;
    
    // Add space for labels above sliders
    const labelSpace = 18;
    const totalSliderSpace = (sliderHeight + labelSpace) * numForceSliders + (layout.buttonHeight + labelSpace) * numAudioRows;
    const availableGapSpace = innerH - totalSliderSpace;
    const rowGap = Math.max(6, Math.min(15, availableGapSpace / (totalElements + 1)));
    
    let currentY = innerY;

    // Force sliders
    adminPulseForceSlider = new AdminParamSlider(
        innerX,
        currentY + labelSpace,
        sliderWidth,
        sliderHeight,
        "Pulse Force",
        getParamValue("pulse force", 1.0),
        0,
        15,
        (val) => updateSetting("pulse force", val),
        "pulse force"
    );
    currentY += sliderHeight + labelSpace + rowGap;

    adminForceSliders.push(new AdminParamSlider(
        innerX,
        currentY + labelSpace,
        sliderWidth,
        sliderHeight,
        "Gravity",
        getParamValue("gravity force", 1.0),
        0,
        1.6667,
        (val) => updateSetting("gravity force", val),
        "gravity force"
    ));
    currentY += sliderHeight + labelSpace + rowGap;

    adminForceSliders.push(new AdminParamSlider(
        innerX,
        currentY + labelSpace,
        sliderWidth,
        sliderHeight,
        "Repel",
        getParamValue("repel force", 10000),
        0,
        10000,
        (val) => updateSetting("repel force", val),
        "repel force"
    ));
    currentY += sliderHeight + labelSpace + rowGap;

    adminForceSliders.push(new AdminParamSlider(
        innerX,
        currentY + labelSpace,
        sliderWidth,
        sliderHeight,
        "Attract",
        getParamValue("attract force", 0.00005),
        0,
        0.0008,
        (val) => updateSetting("attract force", val),
        "attract force"
    ));
    currentY += sliderHeight + labelSpace + rowGap;

    adminPulseWidthSlider = new AdminParamSlider(
        innerX,
        currentY + labelSpace,
        sliderWidth,
        sliderHeight,
        "Pulse Width",
        getParamValue("pulse width", 0.3),
        0.05,
        2.0,
        (val) => updateSetting("pulse width", val),
        "pulse width"
    );
    currentY += sliderHeight + labelSpace + rowGap;

    // Audio controls (volume slider + mute button + scopes button on same row)
    const volumeWidth = sliderWidth * 0.42;
    const muteWidth = sliderWidth * 0.28;
    const scopesWidth = sliderWidth * 0.27;
    const buttonGap = sliderWidth * 0.015;
    
    volumeSlider = new AdminParamSlider(
        innerX,
        currentY + labelSpace,
        volumeWidth,
        sliderHeight,
        "Volume",
        getParamValue("audio volume", -12),
        -60,
        0,
        (val) => updateSetting("audio volume", val),
        "audio volume"
    );

    muteButton = new AdminButton(
        innerX + volumeWidth + buttonGap,
        currentY + labelSpace,
        muteWidth,
        layout.buttonHeight,
        "Mute",
        () => {
            const currentMute = getParamValue("audio mute", 0);
            const newMute = currentMute > 0.5 ? 0 : 1;
            updateSetting("audio mute", newMute);
        }
    );
    
    scopesButton = new AdminButton(
        innerX + volumeWidth + buttonGap + muteWidth + buttonGap,
        currentY + labelSpace,
        scopesWidth,
        layout.buttonHeight,
        "Scopes",
        () => {
            const currentScopes = getParamValue("show scopes", 0);
            const newScopes = currentScopes > 0.5 ? 0 : 1;
            updateSetting("show scopes", newScopes);
        }
    );
    currentY += Math.max(sliderHeight, layout.buttonHeight) + labelSpace + rowGap;
}

function createKnobGrid(x, y, w, h) {
    if (!neuronsAmount) return;
    const gap = layout.knobGap;
    const cols = neuronsAmount;
    const rows = neuronsAmount;
    const availableWidth = w - layout.panelPadX * 2;
    const availableHeight = h - layout.panelPadY * 2;
    const sizeX = (availableWidth - gap * (cols - 1)) / cols;
    const sizeY = (availableHeight - gap * (rows - 1)) / rows;
    const size = Math.max(8, Math.min(sizeX, sizeY));
    const totalWidth = cols * size + (cols - 1) * gap;
    const totalHeight = rows * size + (rows - 1) * gap;
    const startX = x + (w - totalWidth) / 2;
    const startY = y + (h - totalHeight) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (r === c) continue;
            const fromId = r + 1;
            const toId = c + 1;
            const knobX = startX + c * (size + gap);
            const knobY = startY + r * (size + gap);
            adminKnobs.push(new AdminKnob(knobX, knobY, size, fromId, toId));
        }
    }
}

function createKnobControls(x, y, w, h) {
    const innerX = x + layout.panelPadX;
    const innerY = y + layout.panelPadY;
    const innerW = w - layout.panelPadX * 2;
    const colGap = layout.paramSliderGap;
    const colW = (innerW - colGap * 3) / 4;

    const row1Y = innerY;
    const row2Y = innerY + layout.buttonHeight + 28;

    adminButtons.push(new AdminButton(innerX + (colW + colGap) * 0, row1Y, colW, layout.buttonHeight, "Zero", () => {
        setAllKnobsValue(0);
    }));

    adminButtons.push(new AdminButton(innerX + (colW + colGap) * 1, row1Y, colW, layout.buttonHeight, "Random", () => {
        setAllKnobsRandom();
    }));

    dropSlider = new AdminDropSlider(
        innerX + (colW + colGap) * 2,
        row1Y + (layout.buttonHeight - layout.paramSliderHeight) / 2,
        colW,
        layout.paramSliderHeight,
        "Drop",
        (val) => {
            applyDropSlider(val);
        }
    );
    dropSlider.value = getParamValue("dropout", 0.5);

    const typeSliderY = row1Y + (layout.buttonHeight - layout.paramSliderHeight) / 2;
    adminTypeSlider = new AdminParamSlider(
        innerX + (colW + colGap) * 3,
        typeSliderY,
        colW,
        layout.paramSliderHeight,
        "Syn Type",
        getParamValue("syn type", 0.5),
        0,
        1,
        (val) => updateSetting("syn type", val),
        "syn type"
    );

    const sliderRowY = row2Y;
    const sliderRowH = layout.paramSliderHeight;
    const sliderWidth = colW;

    adminParamSliders.push(new AdminParamSlider(
        innerX + (colW + colGap) * 0,
        sliderRowY,
        sliderWidth,
        sliderRowH,
        "W Mean",
        getParamValue("weight mean", maxWeight / 2),
        0,
        maxWeight,
        (val) => updateSetting("weight mean", val),
        "weight mean"
    ));
    adminParamSliders.push(new AdminParamSlider(
        innerX + (colW + colGap) * 1,
        sliderRowY,
        sliderWidth,
        sliderRowH,
        "W Size",
        getParamValue("weight size", maxWeight / 4),
        0,
        maxWeight,
        (val) => updateSetting("weight size", val),
        "weight size"
    ));
    adminParamSliders.push(new AdminParamSlider(
        innerX + (colW + colGap) * 2,
        sliderRowY,
        sliderWidth,
        sliderRowH,
        "D Mean",
        getParamValue("delay mean", 1),
        0,
        2,
        (val) => updateSetting("delay mean", val),
        "delay mean"
    ));
    adminParamSliders.push(new AdminParamSlider(
        innerX + (colW + colGap) * 3,
        sliderRowY,
        sliderWidth,
        sliderRowH,
        "D Size",
        getParamValue("delay size", 0.001),
        0,
        0.01,
        (val) => updateSetting("delay size", val),
        "delay size"
    ));
}

function downloadJson(baseName, payload) {
    let dataStr = payload;
    try {
        dataStr = JSON.stringify(JSON.parse(payload), null, 2);
    } catch (err) {
        dataStr = payload;
    }
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
    const fileName = `${baseName}-${stamp}.json`;
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function setAllKnobsValue(val) {
    // Clear pending weights to avoid conflict with user action
    pendingWeights = {};
    for (const knob of adminKnobs) {
        knob.value = val;
        updateSetting(`weight ${knob.fromId} ${knob.toId}`, knob.value * maxWeight);
    }
}

function setAllKnobsRandom() {
    // Clear pending weights to avoid conflict with user action
    pendingWeights = {};
    for (const knob of adminKnobs) {
        knob.value = random();
        updateSetting(`weight ${knob.fromId} ${knob.toId}`, knob.value * maxWeight);
    }
}

function applyDropSlider(val) {
    // Persist slider value without randomising server-side drops
    updateSetting("dropout value", val);

    const pool = dropOrder.length ? dropOrder : adminKnobs;
    const total = pool.length;
    const dropCount = Math.round((1 - val) * total);
    for (let i = 0; i < total; i++) {
        const knob = pool[i];
        const drop = i < dropCount;
        knob.drop = drop;
        updateSetting(`drop ${knob.fromId} ${knob.toId}`, drop ? 1 : 0);
    }
}

function buildDropOrder() {
    if (!adminKnobs.length) {
        dropOrder = [];
        dropOrderKeys = [];
        return;
    }
    if (dropOrderKeys.length !== adminKnobs.length) {
        dropOrderKeys = adminKnobs.map((k) => `${k.fromId}-${k.toId}`);
        shuffleArray(dropOrderKeys);
    }
    dropOrder = dropOrderKeys
        .map((key) => adminKnobs.find((k) => `${k.fromId}-${k.toId}` === key))
        .filter(Boolean);
    if (dropOrder.length !== adminKnobs.length) {
        dropOrder = adminKnobs.slice();
    }
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function getParamValue(name, fallback) {
    if (settings[name] === undefined || settings[name] === null) {
        settings[name] = fallback;
    }
    return settings[name];
}

function draw() {
    background(0);
    drawPanels();

    for (const slider of adminSliders) {
        slider.draw();
    }
    for (const slider of adminParamSliders) {
        slider.draw();
    }
    if (adminTypeSlider) {
        adminTypeSlider.draw();
    }
    if (adminPulseForceSlider) {
        adminPulseForceSlider.draw();
    }
    if (adminPulseWidthSlider) {
        adminPulseWidthSlider.draw();
    }
    for (const slider of adminForceSliders) {
        slider.draw();
    }
    if (volumeSlider) {
        volumeSlider.draw();
    }
    if (muteButton) {
        muteButton.draw();
    }
    if (scopesButton) {
        scopesButton.draw();
    }
    for (const button of adminButtons) {
        button.draw();
    }
    if (dropSlider) {
        dropSlider.draw();
    }
    for (const knob of adminKnobs) {
        if (knob.drop) continue;
        knob.draw();
    }
    for (const toggle of adminToggles) {
        toggle.draw();
    }
}

function drawPanels() {
    const panels = getAdminPanels();

    stroke(255);
    strokeWeight(1);
    noFill();
    rect(panels.A1.x, panels.A1.y, panels.A1.w, panels.A1.h, 6);
    rect(panels.A2.x, panels.A2.y, panels.A2.w, panels.A2.h, 6);
    rect(panels.B1.x, panels.B1.y, panels.B1.w, panels.B1.h, 6);
    rect(panels.B2.x, panels.B2.y, panels.B2.w, panels.B2.h, 6);
}

function connectToSimulation() {
    settings = {};
    neuronsAmount = 0;
    pendingWeights = {};
    pendingSynTypes = {};
    pendingDrops = {};
    pendingDropOrderKeys = null;
    const oscMessage = {
        address: "/connectAdmin",
        args: [
            {
                type: "s",
                value: controllerId,
            },
        ],
    };
    oscWebSocket.send(oscMessage);
    
    // Request current state from simulation
    const getStateMessage = {
        address: "/getState",
        args: [
            {
                type: "s",
                value: `admin-${controllerId}`,
            },
        ],
    };
    oscWebSocket.send(getStateMessage);
}

function updateSetting(setting, value) {
    settings[setting] = value;
    let oscMessage;
    
    // Handle dc updates: /client/neuron with [id, value]
    if (/^dc \d+$/.test(setting)) {
        const id = parseInt(setting.split(" ")[1], 10);
        oscMessage = {
            address: "/client/neuron",
            args: [
                { type: "i", value: id },
                { type: "f", value: value },
            ],
        };
    } 
    // Handle syn type per neuron: /client/syntype/{id}
    else if (/^syn type \d+$/.test(setting)) {
        const id = parseInt(setting.split(" ")[2], 10);
        oscMessage = {
            address: `/client/syntype/${id}`,
            args: [{ type: "f", value: value }],
        };
    }
    // Handle weights: /client/weight/{from}/{to}
    else if (/^weight \d+ \d+$/.test(setting)) {
        const parts = setting.split(" ");
        const from = parseInt(parts[1], 10);
        const to = parseInt(parts[2], 10);
        oscMessage = {
            address: `/client/weight/${from}/${to}`,
            args: [{ type: "f", value: value }],
        };
    }
    // Handle drops: /client/drop/{from}/{to}
    else if (/^drop \d+ \d+$/.test(setting)) {
        const parts = setting.split(" ");
        const from = parseInt(parts[1], 10);
        const to = parseInt(parts[2], 10);
        oscMessage = {
            address: `/client/drop/${from}/${to}`,
            args: [{ type: "f", value: value }],
        };
    }
    // Handle spikes: /client/spike with space in address
    else if (/^spike \d+$/.test(setting)) {
        oscMessage = {
            address: `/client/${setting}`,
            args: [{ type: "f", value: value }],
        };
    }
    // All other settings: /client/{setting}
    else {
        oscMessage = {
            address: "/client/" + setting.replace(/\s+/g, " "),
            args: [{ type: "f", value: value }],
        };
    }
    
    oscWebSocket.send(oscMessage);
}

function mousePressed() {
    for (const slider of adminSliders) {
        slider.mousePressed();
    }
    for (const slider of adminParamSliders) {
        slider.mousePressed();
    }
    if (adminTypeSlider) {
        adminTypeSlider.mousePressed();
    }
    if (adminPulseForceSlider) {
        adminPulseForceSlider.mousePressed();
    }
    if (adminPulseWidthSlider) {
        adminPulseWidthSlider.mousePressed();
    }
    for (const slider of adminForceSliders) {
        slider.mousePressed();
    }
    if (volumeSlider) {
        volumeSlider.mousePressed();
    }
    if (muteButton) {
        muteButton.mousePressed();
    }
    if (scopesButton) {
        scopesButton.mousePressed();
    }
    for (const button of adminButtons) {
        button.mousePressed();
    }
    if (dropSlider) {
        dropSlider.mousePressed();
    }
    for (const knob of adminKnobs) {
        knob.mousePressed();
    }
    for (const toggle of adminToggles) {
        toggle.mousePressed();
    }
}

function mouseDragged() {
    for (const slider of adminSliders) {
        slider.mouseDragged();
    }
    for (const slider of adminParamSliders) {
        slider.mouseDragged();
    }
    if (adminTypeSlider) {
        adminTypeSlider.mouseDragged();
    }
    if (adminPulseForceSlider) {
        adminPulseForceSlider.mouseDragged();
    }
    if (adminPulseWidthSlider) {
        adminPulseWidthSlider.mouseDragged();
    }
    for (const slider of adminForceSliders) {
        slider.mouseDragged();
    }
    if (volumeSlider) {
        volumeSlider.mouseDragged();
    }
    if (dropSlider) {
        dropSlider.mouseDragged();
    }
    for (const knob of adminKnobs) {
        knob.mouseDragged();
    }
}

function mouseReleased() {
    for (const slider of adminSliders) {
        slider.mouseReleased();
    }
    for (const slider of adminParamSliders) {
        slider.mouseReleased();
    }
    if (adminTypeSlider) {
        adminTypeSlider.mouseReleased();
    }
    if (adminPulseForceSlider) {
        adminPulseForceSlider.mouseReleased();
    }
    if (adminPulseWidthSlider) {
        adminPulseWidthSlider.mouseReleased();
    }
    for (const slider of adminForceSliders) {
        slider.mouseReleased();
    }
    if (volumeSlider) {
        volumeSlider.mouseReleased();
    }
    if (dropSlider) {
        dropSlider.mouseReleased();
    }
    for (const knob of adminKnobs) {
        knob.mouseReleased();
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    createAdminControls();
}

function neuronIdToLetter(neuronId) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const index = (Math.max(1, neuronId) - 1) % alphabet.length;
    return alphabet[index];
}

class AdminSlider {
    constructor(neuronId, value, x, y, w, h, onChange) {
        this.neuronId = neuronId;
        this.value = value;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.min = 0;
        this.max = maxDC;
        this.onChange = onChange;
        this.dragging = false;
    }

    draw() {
        const radius = this.w / 2;
        const minY = this.y + radius;
        const maxY = this.y + this.h - radius;
        const knobY = constrain(map(this.value, this.min, this.max, maxY, minY), minY, maxY);

        stroke(255);
        strokeWeight(2);
        noFill();
        rect(this.x, this.y, this.w, this.h, radius);

        stroke(255);
        strokeWeight(this.w - 2);
        strokeCap(ROUND);
        line(this.x + this.w / 2, knobY, this.x + this.w / 2, maxY);

        noStroke();
        fill(255);
        ellipse(this.x + this.w / 2, knobY, this.w - 2, this.w - 2);

        fill(255);
        textAlign(CENTER, CENTER);
        textSize(18);
        text(neuronIdToLetter(this.neuronId), this.x + this.w / 2, this.y - layout.labelOffset);
    }

    mousePressed() {
        if (mouseX >= this.x && mouseX <= this.x + this.w && mouseY >= this.y && mouseY <= this.y + this.h) {
            this.dragging = true;
            this.updateValue(mouseY);
        }
    }

    mouseDragged() {
        if (this.dragging) {
            this.updateValue(mouseY);
        }
    }

    mouseReleased() {
        this.dragging = false;
    }

    updateValue(pointerY) {
        const radius = this.w / 2;
        const minY = this.y + radius;
        const maxY = this.y + this.h - radius;
        const clampedY = constrain(pointerY, minY, maxY);
        this.value = constrain(map(clampedY, maxY, minY, this.min, this.max), this.min, this.max);
        if (this.onChange) {
            this.onChange(this.value);
        }
    }
}

class AdminToggle {
    constructor(neuronId, x, y, w, h, onChange) {
        this.neuronId = neuronId;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.value = 1;
        this.onChange = onChange;
    }

    draw() {
        stroke(255);
        strokeWeight(1);
        noFill();
        rect(this.x, this.y, this.w, this.h, 6);

        noStroke();
        fill(this.value >= 0 ? 255 : 30);
        rect(this.x, this.y, this.w, this.h / 2, 6, 6, 0, 0);
        fill(this.value < 0 ? 255 : 30);
        rect(this.x, this.y + this.h / 2, this.w, this.h / 2, 0, 0, 6, 6);

        fill(this.value >= 0 ? 0 : 255);
        textAlign(CENTER, CENTER);
        textSize(12);
        text("E", this.x + this.w / 2, this.y + this.h / 4);
        fill(this.value < 0 ? 0 : 255);
        text("I", this.x + this.w / 2, this.y + (this.h * 3) / 4);
    }

    mousePressed() {
        if (mouseX >= this.x && mouseX <= this.x + this.w && mouseY >= this.y && mouseY <= this.y + this.h) {
            this.value = this.value >= 0 ? -1 : 1;
            if (this.onChange) {
                this.onChange(this.value);
            }
        }
    }

    mouseDragged() {}
    mouseReleased() {}
}

class AdminKnob {
    constructor(x, y, size, fromId, toId) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.fromId = fromId;
        this.toId = toId;
        this.value = 0.5;
        this.dragging = false;
        this.drop = false;
        this.lastY = 0;
    }

    draw() {
        const centerX = this.x + this.size / 2;
        const centerY = this.y + this.size / 2;
        const radius = this.size / 2;

        stroke(255);
        strokeWeight(2);
        fill(this.drop ? 10 : 0);
        ellipse(centerX, centerY, this.size, this.size);

        const endOffset = PI * 0.2;
        const downLeft = PI / 2 + endOffset;
        const up = (PI * 3) / 2;
        const downRight = (PI * 5) / 2 - endOffset;
        const angle = this.value <= 0.5
            ? map(this.value, 0, 0.5, downLeft, up)
            : map(this.value, 0.5, 1, up, downRight);
        const pointerX = centerX + cos(angle) * (radius - 6);
        const pointerY = centerY + sin(angle) * (radius - 6);
        stroke(255);
        strokeWeight(2);
        line(centerX, centerY, pointerX, pointerY);
    }

    mousePressed() {
        const centerX = this.x + this.size / 2;
        const centerY = this.y + this.size / 2;
        if (dist(mouseX, mouseY, centerX, centerY) <= this.size / 2) {
            this.dragging = true;
            this.lastY = mouseY;
        }
    }

    mouseDragged() {
        if (this.dragging) {
            const delta = (this.lastY - mouseY) / 120;
            this.value = constrain(this.value + delta, 0, 1);
            this.lastY = mouseY;
            updateSetting(`weight ${this.fromId} ${this.toId}`, this.value * maxWeight);
        }
    }

    mouseReleased() {
        this.dragging = false;
    }
}

class AdminButton {
    constructor(x, y, w, h, label, onClick) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.label = label;
        this.onClick = onClick;
    }

    draw() {
        stroke(255);
        strokeWeight(1);
        fill(0);
        rect(this.x, this.y, this.w, this.h, 6);
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(12);
        text(this.label, this.x + this.w / 2, this.y + this.h / 2 + 1);
    }

    mousePressed() {
        if (mouseX >= this.x && mouseX <= this.x + this.w && mouseY >= this.y && mouseY <= this.y + this.h) {
            if (this.onClick) {
                this.onClick();
            }
        }
    }
}

class AdminDropSlider {
    constructor(x, y, w, h, label, onChange) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.value = 0.5;
        this.dragging = false;
        this.onChange = onChange;
        this.label = label;
    }

    draw() {
        stroke(255);
        strokeWeight(1);
        noFill();
        rect(this.x, this.y, this.w, this.h, 6);
        fill(255);
        textAlign(LEFT, BOTTOM);
        textSize(12);
        text(this.label, this.x, this.y - 4);
        const knobX = this.x + this.value * this.w;
        stroke(255);
        strokeWeight(1);
        line(knobX, this.y + 2, knobX, this.y + this.h - 2);
    }

    mousePressed() {
        if (mouseX >= this.x && mouseX <= this.x + this.w && mouseY >= this.y && mouseY <= this.y + this.h) {
            this.dragging = true;
            this.updateValue(mouseX);
        }
    }

    mouseDragged() {
        if (this.dragging) {
            this.updateValue(mouseX);
        }
    }

    mouseReleased() {
        this.dragging = false;
    }

    updateValue(pointerX) {
        const clampedX = constrain(pointerX, this.x, this.x + this.w);
        this.value = constrain((clampedX - this.x) / this.w, 0, 1);
        if (this.onChange) {
            this.onChange(this.value);
        }
    }
}

class AdminParamSlider {
    constructor(x, y, w, h, label, value, min, max, onChange, labelMap) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.label = label;
        this.value = value;
        this.min = min;
        this.max = max;
        this.dragging = false;
        this.onChange = onChange;
        this.labelMap = labelMap || label;
    }

    draw() {
        stroke(255);
        strokeWeight(1);
        noFill();
        rect(this.x, this.y, this.w, this.h, 6);
        fill(255);
        textAlign(LEFT, BOTTOM);
        textSize(12);
        text(this.label, this.x, this.y - 4);

        const knobX = this.x + map(this.value, this.min, this.max, 0, this.w);
        stroke(255);
        strokeWeight(1);
        line(knobX, this.y + 2, knobX, this.y + this.h - 2);
    }

    mousePressed() {
        if (mouseX >= this.x && mouseX <= this.x + this.w && mouseY >= this.y && mouseY <= this.y + this.h) {
            this.dragging = true;
            this.updateValue(mouseX);
        }
    }

    mouseDragged() {
        if (this.dragging) {
            this.updateValue(mouseX);
        }
    }

    mouseReleased() {
        this.dragging = false;
    }

    updateValue(pointerX) {
        const clampedX = constrain(pointerX, this.x, this.x + this.w);
        this.value = constrain(map(clampedX, this.x, this.x + this.w, this.min, this.max), this.min, this.max);
        if (this.onChange) {
            this.onChange(this.value);
        }
    }
}