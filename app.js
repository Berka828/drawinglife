// app.js
import * as THREE from 'three';

// --- Configuration ---
const MAX_PARTICLES = 15000;
const HAND_COLORS = [
    new THREE.Color(0x00ffff), // Cyan
    new THREE.Color(0xff00ff), // Magenta
    new THREE.Color(0xffff00), // Yellow
    new THREE.Color(0x00ff88)  // Mint Green
];

// --- Globals ---
let scene, camera, renderer;
let particleSystem, positions, colors, velocities, lifetimes;
let particleIndex = 0;
let pointers = [];

const statusUI = document.getElementById('status-ui');

// --- Initialization ---
function init() {
    // 1. Setup Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pure black for projection
    
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(-aspect * 5, aspect * 5, 5, -5, 0.1, 100);
    camera.position.z = 10;

    // 2. Setup Standard Renderer (No Post-Processing)
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 3. Create Particle Engine
    createParticles();

    // 4. Handle Resizing
    window.addEventListener('resize', onWindowResize);

    // 5. Start Loop & Tracking
    animate();
    initMediaPipe();
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);
    velocities = new Float32Array(MAX_PARTICLES * 3);
    lifetimes = new Float32Array(MAX_PARTICLES);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Create a softer, larger circle texture
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    // Force a strong white core so AdditiveBlending makes it glow
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);

    // Additive blending handles the "Glow" natively!
    const material = new THREE.PointsMaterial({
        size: 0.8, // Increased size significantly
        map: texture,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 1.0 // Increased opacity
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

// --- Interaction Logic ---
function emitParticle(x, y, baseColor) {
    const i3 = particleIndex * 3;

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = 0;

    // Use full brightness for the colors to ensure they pop
    colors[i3] = baseColor.r;
    colors[i3 + 1] = baseColor.g;
    colors[i3 + 2] = baseColor.b;

    // Explosion velocity
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 0.2; // slightly faster explosion
    velocities[i3] = Math.cos(angle) * speed;
    velocities[i3 + 1] = Math.sin(angle) * speed;
    velocities[i3 + 2] = 0;

    lifetimes[particleIndex] = 60 + Math.random() * 60;

    particleIndex = (particleIndex + 1) % MAX_PARTICLES;
}

// --- AI Tracking ---
function initMediaPipe() {
    const videoElement = document.getElementById('video-feed');
    const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    
    hands.setOptions({ 
        maxNumHands: 4, 
        modelComplexity: 1, 
        minDetectionConfidence: 0.6, 
        minTrackingConfidence: 0.6 
    });
    
    hands.onResults((results) => {
        pointers = []; 
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            statusUI.innerText = `System Active | Tracking ${results.multiHandLandmarks.length} Hands`;
            
            results.multiHandLandmarks.forEach((landmarks, index) => {
                // Track BOTH the index finger and the palm to emit more magic!
                const indexTip = landmarks[8]; 
                const palm = landmarks[0];
                
                const aspect = window.innerWidth / window.innerHeight;
                const viewWidth = aspect * 10;
                const viewHeight = 10;
                
                const color = HAND_COLORS[index % HAND_COLORS.length];
                
                // Add index finger
                pointers.push({ 
                    x: -((indexTip.x - 0.5) * viewWidth), 
                    y: -((indexTip.y - 0.5) * viewHeight), 
                    color: color 
                });

                // Add palm center
                pointers.push({ 
                    x: -((palm.x - 0.5) * viewWidth), 
                    y: -((palm.y - 0.5) * viewHeight), 
                    color: color 
                });
            });
        } else {
            statusUI.innerText = "System Active | No Hands Detected";
        }
    });

    const cameraControl = new Camera(videoElement, {
        onFrame: async () => { await hands.send({image: videoElement}); },
        width: 640, height: 480
    });
    
    cameraControl.start().then(() => {
        statusUI.innerText = "Camera Started. Analyzing...";
    });
}

// --- Physics & Render Loop ---
function animate() {
    requestAnimationFrame(animate);

    // 1. Emit new particles where hands are
    pointers.forEach(p => {
        for(let i=0; i<3; i++) { // 3 per point, but we have 2 points per hand now!
            emitParticle(p.x, p.y, p.color);
        }
    });

    // 2. Update existing particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (lifetimes[i] > 0) {
            const i3 = i * 3;
            
            positions[i3] += velocities[i3];
            positions[i3 + 1] += velocities[i3 + 1];

            velocities[i3 + 1] -= 0.002; // gravity
            velocities[i3] *= 0.98; // drag

            lifetimes[i]--;

            if (lifetimes[i] < 20) {
                // Fade out rapidly at the end
                colors[i3] *= 0.7;
                colors[i3 + 1] *= 0.7;
                colors[i3 + 2] *= 0.7;
            }
        } else {
            positions[i * 3 + 1] = -100;
        }
    }

    particleSystem.geometry.attributes.position.needsUpdate = true;
    particleSystem.geometry.attributes.color.needsUpdate = true;

    // Render scene directly
    renderer.render(scene, camera);
}

function onWindowResize() {
