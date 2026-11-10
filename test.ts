// Compile the classroom and advanced Blocks APIs with the micro:bit target.
makerbit.setUltrasonicWindow(UltrasonicWindow.Five);
makerbit.connectUltrasonicDistanceSensor(DigitalPin.P1, DigitalPin.P2);
makerbit.onUltrasonicObjectDetected(20, DistanceUnit.CM, () => {});
makerbit.onUltrasonicApproach(20, 25, () => {});
const available = makerbit.ultrasonicDistanceAvailable();
const distance = makerbit.getUltrasonicDistance(DistanceUnit.CM);
const isNear = makerbit.isUltrasonicDistanceLessThan(20, DistanceUnit.CM);
const lateCycles = makerbit.ultrasonicCount(UltrasonicCounter.Late);
