# MakerBit Ultrasonic for the classroom

Use an HC-SR04 with BBC micro:bit MakeCode. The extension takes one measurement per ping in the background. A missed echo never counts as a distance.

## Try it in Blocks

1. In MakeCode, open **Extensions** and paste the URL of this fork. Use just one ultrasonic extension on these pins.
2. In **on start**, add **connect ultrasonic distance sensor** and select your TRIG and ECHO pins. Use your existing 5 V sensor supply, common ground and ECHO voltage divider for a standard 5 V HC-SR04.
3. Add **on object detected once within 20 cm** and put **show icon** inside. Move a flat target in front of the sensor. Bring it within 20 cm to fire the event; move it beyond 25 cm to re-arm it.
4. For a numerical project, check **ultrasonic distance reading available?** before using **ultrasonic distance in cm**. Your own 200 ms loop reads the most recent estimate; it does not trigger another ping.

```blocks
makerbit.connectUltrasonicDistanceSensor(DigitalPin.P1, DigitalPin.P2)
makerbit.onUltrasonicObjectDetected(20, DistanceUnit.CM, function () {
    basic.showIcon(IconNames.Heart)
})
```

## What happens when an echo is missing?

With the default five-ping window, the extension needs at least three valid echoes no older than 750 ms. For example, **50, 51, miss, 50, miss** gives **50 cm**; **50, 51, miss, miss, miss** gives **reading unavailable**. The window starts empty. Timestamps are checked on reads as well as when new pings arrive. An unknown result neither fires nor re-arms an event.

For compatibility, the original numeric block returns 300 cm (117 whole inches) when connected but unavailable, or -1 before setup. These fallback values never enter the filter. A false proximity test can mean unknown; for a robot, handle unavailable readings explicitly rather than assuming the path is clear.

## Teacher controls and diagnosis

**Ultrasonic advanced** has blocks to choose a window of **three or five actual pings**, to set separate event entry/reset distances, and to read **pings sent**, **valid echoes**, or **late background cycles**. Both window sizes require three fresh echoes. Use three to compare with the upstream window length; use five to tolerate up to two misses. Only a valid filtered reading above the reset threshold re-arms the event. If removing the target leaves nothing in range, there is no confirmed far reading; use a background target beyond the reset distance for repeatable demonstrations.

The target spacing between actual triggers is 145 ms. One worker triggers and immediately times one ECHO pulse using a bounded 20 ms pulse wait. This call can briefly occupy the processor. It accepts pulse widths from 116 µs up to (but excluding) 17,400 µs, about 2–300 cm. Scheduling delays produce no invented pings. An interval over 155 ms increments the late counter once, regardless of how many intervals elapsed. A delayed loop and a real timeout can occur together; the counters report different observations.

**Compare simple and busy programs:** keep a flat target at 50 cm, then run each program for the same time. Compare *valid echoes / pings sent* and *late cycles*. If valid echoes remain common while late cycles rise, extra work is delaying sampling. If the valid fraction drops, check for pin sharing, pulse-timing disruption and sensor power. Also try removing the target to verify unavailable readings, then deliberately moving it beyond the reset distance and back to test repeated events.

## Development

The existing public block IDs and function signatures are preserved. Hardware API compile checks are in `test.ts`. For deterministic tests of timeouts, a busy foreground, stale data and events, run `node tests/ultrasonic.cjs` (Node 22.13 or later). Run the examples on a physical board to check your particular sensor and wiring.

Based on [1010Technologies/MakerBit Ultrasonic](https://github.com/1010Technologies/pxt-makerbit-ultrasonic), under the [MIT License](LICENSE).

* for PXT/microbit
* for PXT/calliope
