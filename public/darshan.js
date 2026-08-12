/* Virtual Darshan Altar & Canvas Flower Shower Physics Engine */

const canvas = document.getElementById('flowerCanvas');
const ctx = canvas.getContext('2d');

let petals = [];
let isShowering = false;
let showerTimer = null;

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 300);

class Petal {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = -20;
    this.size = Math.random() * 12 + 8;
    this.speedY = Math.random() * 2 + 1.5;
    this.speedX = Math.random() * 1.5 - 0.75;
    this.rotation = Math.random() * 360;
    this.spin = Math.random() * 4 - 2;
    this.color = Math.random() > 0.4 ? '#ff9f1c' : '#ffd166'; // Marigold yellow/orange & Pink lotus
    if (Math.random() > 0.7) this.color = '#ff4d6d';
  }

  update() {
    this.y += this.speedY;
    this.x += Math.sin(this.y / 30) + this.speedX;
    this.rotation += this.spin;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.size, this.size / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function animatePetals() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isShowering && Math.random() < 0.4) {
    petals.push(new Petal());
  }

  for (let i = 0; i < petals.length; i++) {
    petals[i].update();
    petals[i].draw();

    if (petals[i].y > canvas.height + 20) {
      petals.splice(i, 1);
      i--;
    }
  }

  requestAnimationFrame(animatePetals);
}

animatePetals();

function triggerFlowerShower() {
  isShowering = true;
  if (showerTimer) clearTimeout(showerTimer);

  // Shower for 5 seconds
  showerTimer = setTimeout(() => {
    isShowering = false;
  }, 5000);
}

// Diya toggle
function toggleDiya(id) {
  const diyaEl = document.getElementById(id);
  if (diyaEl.classList.contains('glowing')) {
    diyaEl.classList.remove('glowing');
    diyaEl.style.opacity = '0.4';
  } else {
    diyaEl.classList.add('glowing');
    diyaEl.style.opacity = '1';
  }
}

// Web Audio API Sound Generator for Temple Bell & Ambient Sound
let audioCtx = null;
let isAudioPlaying = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playTempleBell() {
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 Bell note
  osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 1.5);

  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 2.0);
}

let droneOsc = null;
function toggleAudioSoundscape() {
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const btn = document.getElementById('audioToggleBtn');

  if (!isAudioPlaying) {
    isAudioPlaying = true;
    btn.innerHTML = "⏸️ Pause Soundscape";
    btn.style.borderColor = "var(--accent-teal)";

    droneOsc = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();

    droneOsc.type = 'triangle';
    droneOsc.frequency.setValueAtTime(216, audioCtx.currentTime); // Soothing Om Drone pitch

    droneGain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 2);

    droneOsc.connect(droneGain);
    droneGain.connect(audioCtx.destination);

    droneOsc.start();
    triggerFlowerShower();
  } else {
    isAudioPlaying = false;
    btn.innerHTML = "🔊 Start Darshan Audio";
    btn.style.borderColor = "var(--accent-gold)";

    if (droneOsc) {
      droneOsc.stop();
      droneOsc = null;
    }
  }
}
