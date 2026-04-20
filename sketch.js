let video;
let handPose;
let hands = [];
let particles = [];
let numParticles = 440; 

let mode = "idle";
let prevWristX = 0;
let waveTimer = 0;
let entryTimer = 0; // NEW: Prevents immediate spinning on detection

let dogRotation = 0;
let isSpinning = false;
let lastSpinTime = 0;
let spinCooldown = 500; 

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  let options = { video: { facingMode: "environment" }, audio: false };
  video = createCapture(options);
  video.size(640, 480);
  video.hide();
  handPose.detectStart(video, gotHands);

  for (let i = 0; i < numParticles; i++) {
    particles.push(new Particle(i));
  }
}

function gotHands(results) {
  hands = results;
}

function draw() {
  background(5, 5, 20);  
  updateGestureLogic();

  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].show();
  }
}

function updateGestureLogic() {
  if (hands.length === 0) {
    mode = "idle";
    entryTimer = 0; // Reset timer when hand is gone
    isSpinning = false; // Stop spinning if hand leaves
    return;
  }

  // Increment entry timer to ensure the dog "settles" before reacting
  entryTimer++;

  let hand = hands[0];

  // --- NEW ROTATION FIX ---
  // Transforms the 90-degree CW rotated camera coordinates back to upright.
  // Assuming video height is 480, we map the old Y to X, and old X to Y.
  const fixRot = (pt) => ({
    x: 480 - pt.y,  // Physical Right/Left is determined by Camera Up/Down
    y: pt.x         // Physical Up/Down is determined by Camera Left/Right
  });

  let wrist = fixRot(hand.wrist);
  let indexTip = fixRot(hand.index_finger_tip);
  let indexPip = fixRot(hand.index_finger_pip);
  let middleTip = fixRot(hand.middle_finger_tip);
  let middlePip = fixRot(hand.middle_finger_pip);
  let ringTip = fixRot(hand.ring_finger_tip);
  let ringPip = fixRot(hand.ring_finger_pip);
  let pinkyTip = fixRot(hand.pinky_finger_tip);
  let pinkyPip = fixRot(hand.pinky_finger_pip);
  let thumbTip = fixRot(hand.thumb_tip);
  // ------------------------

  let fingersUp = 0;
  // Now using the 'fixed' coordinates, so standard Y comparisons work perfectly
  if (indexTip.y < indexPip.y) fingersUp++;
  if (middleTip.y < middlePip.y) fingersUp++;
  if (ringTip.y < ringPip.y) fingersUp++;
  if (pinkyTip.y < pinkyPip.y) fingersUp++;

  // Spread and movement use the corrected upright coordinates
  let spread = dist(thumbTip.x, thumbTip.y, middleTip.x, middleTip.y);
  let moveX = abs(wrist.x - prevWristX);
  let currentTime = millis();

  // ONLY allow special actions if the dog has been "awake" for ~1 second (60 frames)
  let canAct = entryTimer > 60;

  if (canAct) {
    // 1. Wave detection
    if (moveX > 30 && !isSpinning) {
      waveTimer = 40; 
    }

    // 2. Rotation Trigger (2 fingers + horizontal move)
    let fingerGestureX = abs(indexTip.x - prevWristX);
    if (fingersUp === 2 && fingerGestureX > 15 && !isSpinning && currentTime - lastSpinTime > spinCooldown) {
      isSpinning = true;
    }
  }

  // 3. Mode Selection
  if (isSpinning) {
    dogRotation += 0.08; 
    if (dogRotation >= TWO_PI) {
      dogRotation = 0;
      isSpinning = false;
      lastSpinTime = millis();
    }
    mode = "rotating";
  } else if (waveTimer > 0) {
    mode = "happy_dance";
    waveTimer--;
  } else if (fingersUp === 1) {
    mode = "sit";
  } else if (fingersUp >= 4 && spread > 230) { 
    mode = "paw";
  } else {
    mode = "dog_idle"; // Default state when first detected
  }

  prevWristX = wrist.x; // Save the corrected wrist X for the next frame
}

function getDogTarget(id, currentMode) {
  let tx, ty;
  let time = millis() * 0.003;
  let centerX = width / 2;
  let centerY = height / 2 + 150;

  if (currentMode === "happy_dance") {
    centerX += sin(time * 10) * 40; 
    centerY += cos(time * 12) * 20; 
  }

  let spinVal = cos(dogRotation); 
  let facingFront = spinVal > 0;

  // 1. BODY
  if (id < 150) {
    let a = map(id, 0, 150, 0, TWO_PI);
    let rX = 90, rY = 70;
    if (currentMode === "sit") { rY = 40; centerY += 50; } 
    tx = centerX + cos(a) * rX * spinVal;
    ty = centerY + sin(a) * rY;
  }
  
  // 2. HEAD
  else if (id < 300) {
    let a = map(id, 150, 300, 0, TWO_PI);
    let headY = centerY - (currentMode === "sit" ? 60 : 105);
    let r = 65;
    tx = centerX + cos(a) * r * spinVal;
    ty = headY + sin(a) * r;
  }
  
  // 3. TAIL
  else if (id < 340) {
    let i = id - 300;
    let tailBaseX = centerX - (80 * spinVal);
    let tailBaseY = centerY + 20;
    let curve = sin(i * 0.15) * 15;
    tx = tailBaseX - (i * 2.5 * spinVal); 
    ty = tailBaseY - i * 1.5 + curve;
    
    let wagSpeed = (currentMode === "happy_dance") ? 30 : 5;
    let wagAmp = (currentMode === "happy_dance") ? 100 : 30;
    ty += sin(time * wagSpeed) * wagAmp * (i / 40);
  }

  // 4. EARS
  else if (id < 380) {
    let isLeft = id < 360;
    let localID = map(id % 20, 0, 20, 0, 1);
    let sideMult = isLeft ? -1 : 1;
    let earX = centerX + (sideMult * 65 * spinVal);
    let earY = centerY - (currentMode === "sit" ? 100 : 145);
    tx = earX + (sideMult * sin(localID * PI) * 20 * spinVal);
    ty = earY + (localID * 55);
    
    if (currentMode === "happy_dance") {
      tx += sin(time * 15) * 20;
    }
  }

  // 5. FEATURES
  else if (id < 410) {
    if (!facingFront) {
      tx = centerX; ty = centerY - 100;
    } else {
      let featID = id - 380;
      let headY = centerY - (currentMode === "sit" ? 60 : 105);
      if (featID < 10) { // Nose
        tx = centerX + (cos(map(featID, 0, 10, 0, TWO_PI)) * 8 * spinVal);
        ty = headY + 20 + sin(map(featID, 0, 10, 0, TWO_PI)) * 5;
      } else { // Eyes
        let isLeft = featID < 20;
        let eyeX = centerX + (isLeft ? -25 : 25) * spinVal;
        let blink = (floor(time * 0.5) % 4 === 0) ? 0.1 : 1;
        tx = eyeX + cos(map(featID % 10, 0, 10, 0, TWO_PI)) * 5 * spinVal;
        ty = (headY - 15) + sin(map(featID % 10, 0, 10, 0, TWO_PI)) * 5 * blink;
      }
    }
  }

  // 6. FRONT PAWS
  else if (id < 440) {
    let isLeft = id < 425;
    let side = isLeft ? -1 : 1;
    let pawX = centerX + (side * 45 * spinVal);
    let pawY = centerY + 65; 
    let a = map(id % 15, 0, 15, 0, TWO_PI);
    tx = pawX + (cos(a) * 12 * spinVal);
    ty = pawY + sin(a) * 8;

    if (!isLeft && currentMode === "paw") {
      ty -= 80; 
      tx += 20 * spinVal;
    }
  }

  return createVector(tx, ty);
}

class Particle {
  constructor(id) {
    this.id = id;
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D();
    this.ease = random(0.06, 0.15);
  }

  update() {
    if (mode === "idle") {
      this.pos.add(this.vel);
      this.vel.add(p5.Vector.random2D().mult(0.1));
      this.vel.limit(2);
    } else {
      let target = getDogTarget(this.id, mode);
      this.pos.lerp(target, this.ease);
    }
  }

  show() {
    noStroke();
    let spinVal = cos(dogRotation);
    let alpha = map(spinVal, -1, 1, 100, 255);
    fill(100, 220, 255, alpha);
    circle(this.pos.x, this.pos.y, 4);
    if (this.id % 15 === 0) {
      fill(100, 220, 255, alpha * 0.3);
      circle(this.pos.x, this.pos.y, 12);
    }
  }
}
