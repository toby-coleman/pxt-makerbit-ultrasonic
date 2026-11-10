// Node 22.13+; run "node tests/ultrasonic.cjs". Exercise the actual extension with a virtual clock and ECHO pin.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../ultrasonic.ts"), "utf8");
const js = stripTypeScriptTypes(source, { mode: "transform" });
const cm = 58;
function board() {
    let t = 0, run, samples = [], extra = [], sent = 0, workers = 0;
    const handlers = new Map(), readings = [];
    const done = {};
    const ctx = {
        Math: Object.assign(Object.create(Math), { idiv: (a,b) => Math.trunc(a/b) }),
        input: { runningTime: () => t },
        PinPullMode: { PullNone: 0 }, PulseValue: { High: 1 },
        pins: {
            setPull() {},
            digitalWritePin: (_, v) => {if (v === 1) sent++},
            pulseIn: () => { const w = samples.shift(); t += w ? Math.ceil(w / 1000) : 20; return w || 0; }
        },
        control: {
            waitMicros() {},
            inBackground: f => { workers++; run = f; },
            onEvent: (s,id,f) => handlers.set(s + ":" + id,f),
            raiseEvent: (s,id) => handlers.get(s + ":" + id)()
        },
        basic: { pause(ms) {
            if (ms === 0) return;
            readings.push(distance());
            if (samples.length === 0) throw done;
            t += ms + (extra.shift() || 0);
        }}
    };
    vm.createContext(ctx);
    vm.runInContext(js, ctx);
    const m = ctx.makerbit;
    function distance() {return m.getUltrasonicDistance(cm);}
    return {m, readings, distance, get sent(){return sent;}, get workers(){return workers;},
        advance: ms => t += ms,
        start() {m.connectUltrasonicDistanceSensor(1,2);},
        measure(widths, delays = []) {
            samples = widths.slice(); extra = delays.slice();
            try { run(); } catch(e) { if(e !== done) throw e; }
        }
    };
}
test("defaults: warm-up, real missed echoes, median, and unknown fallback", () => {
    const b = board(); assert.equal(b.distance(), -1); assert.equal(b.m.ultrasonicDistanceAvailable(),false);
    b.start(); b.start(); assert.equal(b.workers,1);
    b.measure([50,51,0,50,0,0].map(d => d*cm));
    assert.deepEqual(b.readings,[300,300,300,50,50,300]);
    assert.equal(b.m.ultrasonicDistanceAvailable(),false);
    assert.equal(b.m.isUltrasonicDistanceLessThan(350,cm),false);
    assert.equal(b.m.ultrasonicCount(0),6);
    assert.equal(b.m.ultrasonicCount(1),3);
});
test("loaded loop: late cycles do not add pings, misses, or 300 cm votes", () => {
    const b=board(); b.start();
    b.measure([50,51,49,50,50,50].map(d => d*cm),[70,70,70,70,70]);
    assert.equal(b.sent,6); assert.equal(b.m.ultrasonicCount(0),6);
    assert.equal(b.m.ultrasonicCount(1),6); assert.equal(b.m.ultrasonicCount(2),5);
    assert.deepEqual(b.readings,[300,300,50,50,50,50]);
    b.advance(751);
    assert.equal(b.m.ultrasonicDistanceAvailable(),false); assert.equal(b.distance(),300);
});
test("stalled sampler: old votes expire individually even before the newest echo expires", () => {
    const b=board(); b.start(); b.measure([10,10,30].map(d => d*cm));
    assert.equal(b.distance(),10);
    b.advance(480); assert.equal(b.m.ultrasonicDistanceAvailable(),false);
});
test("window size is configurable; invalid or stale attempts cannot support a new reading", () => {
    const b=board(); b.m.setUltrasonicWindow(3); b.start();
    b.measure([20,20,20,0,20,20,20].map(d=>d*cm));
    assert.deepEqual(b.readings,[300,300,20,300,300,300,20]);
    const a=board(); a.start(); a.measure([10,10,0,0,300,1,40].map(d=>d*cm),[0,0,0,900,0,0]);
    assert.equal(a.distance(),300); assert.equal(a.m.ultrasonicCount(1),3);
});
test("events survive gaps and threshold jitter; reset must be strictly exceeded", () => {
    const b=board(); const actions=[];
    b.m.onUltrasonicObjectDetected(20,cm,()=>actions.push("default"));
    b.m.onUltrasonicApproach(20,25,()=>actions.push("custom"));
    b.start();
    const d=[19,19,19,21,20,21,0,0,0,19,19,19,25,25,25,19,19,19,26,26,26,19,19,19];
    b.measure(d.map(v=>v*cm));
    assert.deepEqual(actions,["default","custom","default","custom"]);
});
