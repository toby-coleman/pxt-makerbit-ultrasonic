const enum DistanceUnit {
    //% block="cm"
    CM = 58,
    //% block="inch"
    INCH = 148
}

enum UltrasonicWindow {
    //% block="3 pings"
    Three = 3,
    //% block="5 pings"
    Five = 5
}

enum UltrasonicCounter {
    //% block="pings sent"
    Pings,
    //% block="valid echoes"
    Echoes,
    //% block="late background cycles"
    Late
}

//% color=#0fbc11 icon="\u272a" block="MakerBit"
//% category="MakerBit"
namespace makerbit {
    const EVENT_SOURCE = 798;
    const PERIOD_MS = 145;
    const LATE_ALLOWANCE_MS = 10;
    const FRESH_MS = 750;
    const MIN_US = 2 * DistanceUnit.CM;
    const MAX_US = 300 * DistanceUnit.CM;
    const TIMEOUT_US = 20000;

    interface Attempt { at: number; us: number; }
    interface Observer { enter: number; reset: number; armed: boolean; id: number; }

    let connected = false;
    let windowSize = 5;
    const attempts: Attempt[] = [];
    const observers: Observer[] = [];
    let pings = 0;
    let echoes = 0;
    let late = 0;

    // Cache until a new attempt, a window change, or the oldest contributing echo expires.
    let dirty = true;
    let cachedUs = 0;
    let oldestEcho = 0;

    function age(now: number, then: number): number {
        return (now - then) >>> 0;
    }

    // Zero is internal "unknown". Only real, fresh echo widths enter the median.
    function filteredUs(now: number): number {
        if (!dirty && (cachedUs == 0 || age(now, oldestEcho) <= FRESH_MS)) return cachedUs;
        const valid: number[] = [];
        for (let i = 0; i < attempts.length; ++i) {
            const a = attempts[i];
            if (a.us > 0 && age(now, a.at) <= FRESH_MS) {
                if (valid.length == 0) oldestEcho = a.at;
                valid.push(a.us);
            }
        }
        cachedUs = 0;
        if (valid.length >= 3) {
            valid.sort((a, b) => a - b);
            const mid = valid.length >> 1;
            cachedUs = valid.length % 2 == 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
        }
        dirty = false;
        return cachedUs;
    }

    function trim() {
        while (attempts.length > windowSize) attempts.shift();
        dirty = true;
    }

    function notifyObservers(us: number) {
        if (us == 0) return; // Missing evidence cannot activate or re-arm an event.
        for (let i = 0; i < observers.length; ++i) {
            const o = observers[i];
            if (o.armed && us <= o.enter) {
                o.armed = false;
                control.raiseEvent(EVENT_SOURCE, o.id);
            } else if (!o.armed && us > o.reset) {
                o.armed = true;
            }
        }
    }

    function measure(trig: DigitalPin, echo: DigitalPin) {
        pins.setPull(trig, PinPullMode.PullNone);
        pins.setPull(echo, PinPullMode.PullNone);
        let previous = input.runningTime();
        let first = true;
        while (true) {
            const start = input.runningTime();
            if (!first && age(start, previous) > PERIOD_MS + LATE_ALLOWANCE_MS) late++;
            first = false;
            previous = start;
            pins.digitalWritePin(trig, 0);
            control.waitMicros(2);
            pins.digitalWritePin(trig, 1);
            control.waitMicros(10);
            pins.digitalWritePin(trig, 0);
            pings++;
            const pulse = pins.pulseIn(echo, PulseValue.High, TIMEOUT_US);
            // 300 cm is reserved for the legacy API; timeouts/invalid widths occupy
            // an attempt slot but never vote as a distance. Timestamp the actual ping.
            const us = pulse >= MIN_US && pulse < MAX_US ? pulse : 0;
            if (us > 0) echoes++;
            attempts.push({ at: start, us: us });
            trim();
            notifyObservers(filteredUs(input.runningTime()));
            // Schedule from this actual trigger, never from a missed deadline.
            basic.pause(Math.max(1, PERIOD_MS - age(input.runningTime(), start)));
        }
    }

    /** Start one background sampler for this HC-SR04. Call once in on start. */
    //% subcategory="Ultrasonic" weight=80
    //% blockId=makerbit_ultrasonic_connect
    //% block="connect ultrasonic distance sensor | with Trig at %trig | and Echo at %echo"
    //% trig.fieldEditor="gridpicker" trig.fieldOptions.columns=4
    //% echo.fieldEditor="gridpicker" echo.fieldOptions.columns=4
    export function connectUltrasonicDistanceSensor(trig: DigitalPin, echo: DigitalPin): void {
        if (connected || trig == echo) return;
        connected = true;
        control.inBackground(() => measure(trig, echo));
    }

    /** True when three recent valid echoes support a distance. */
    //% subcategory="Ultrasonic" weight=70
    //% blockId=makerbit_ultrasonic_available block="ultrasonic distance reading available?"
    export function ultrasonicDistanceAvailable(): boolean {
        basic.pause(0);
        return filteredUs(input.runningTime()) > 0;
    }

    /** Return whole cm/inches. No setup: -1. No usable reading: 300 cm / 117 inches. */
    //% subcategory="Ultrasonic" weight=60
    //% blockId=makerbit_ultrasonic_distance block="ultrasonic distance in %unit"
    export function getUltrasonicDistance(unit: DistanceUnit): number {
        if (!connected) return -1;
        basic.pause(0);
        const us = filteredUs(input.runningTime());
        return Math.idiv(us > 0 ? us : MAX_US, unit);
    }

    /** Unknown distances never satisfy this test. */
    //% subcategory="Ultrasonic" weight=50
    //% blockId=makerbit_ultrasonic_less_than block="ultrasonic distance is less than | %distance | %unit"
    export function isUltrasonicDistanceLessThan(distance: number, unit: DistanceUnit): boolean {
        basic.pause(0);
        const us = filteredUs(input.runningTime());
        return us > 0 && us < distance * unit;
    }

    function observe(enter: number, reset: number, handler: () => void) {
        if (enter <= 0 || reset <= enter) return;
        const id = observers.length + 1;
        observers.push({ enter: enter, reset: reset, armed: true, id: id });
        control.onEvent(EVENT_SOURCE, id, handler);
    }

    /** Fires on arrival; requires a confirmed distance over the threshold plus 5 cm to re-arm. */
    //% subcategory="Ultrasonic" weight=69
    //% blockId=makerbit_ultrasonic_on_object_detected
    //% block="on object detected once within | %distance | %unit"
    export function onUltrasonicObjectDetected(distance: number, unit: DistanceUnit, handler: () => void): void {
        observe(distance * unit, distance * unit + 5 * DistanceUnit.CM, handler);
    }

    /** Fires at or below enter; re-arms only above reset. Reset must exceed enter. */
    //% subcategory="Ultrasonic advanced" weight=65
    //% blockId=makerbit_ultrasonic_enter_reset
    //% block="on object within %enter cm reset beyond %reset cm"
    //% enter.defl=20 reset.defl=25
    export function onUltrasonicApproach(enter: number, reset: number, handler: () => void): void {
        observe(enter * DistanceUnit.CM, reset * DistanceUnit.CM, handler);
    }

    /** Choose how many actual ping attempts to keep. Both settings require three fresh echoes. */
    //% subcategory="Ultrasonic advanced" weight=55
    //% blockId=makerbit_ultrasonic_window block="use last %size for ultrasonic distance"
    //% size.defl=UltrasonicWindow.Five
    export function setUltrasonicWindow(size: UltrasonicWindow): void {
        windowSize = size == UltrasonicWindow.Three ? 3 : 5;
        trim();
    }

    /** Count actual triggers, accepted echoes or trigger intervals over 155 ms, since startup. */
    //% subcategory="Ultrasonic advanced" weight=45
    //% blockId=makerbit_ultrasonic_counter block="ultrasonic count of %counter"
    export function ultrasonicCount(counter: UltrasonicCounter): number {
        if (counter == UltrasonicCounter.Pings) return pings;
        if (counter == UltrasonicCounter.Echoes) return echoes;
        return late;
    }
}
