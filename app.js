// app.js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- Configuration ---
const MAX_PARTICLES = 15000;
const HAND_COLORS = [
    new THREE.Color(0x00ffff), // Cyan
    new THREE.Color(0xff00ff), // Magenta
    new THREE.Color(0xffff00), // Yellow
    new THREE.Color(0x00ff88)  // Mint Green
];

// --- Globals ---
let scene, camera, renderer, composer;
let particleSystem, positions, colors, velocities, lifetimes;
let particleIndex = 0;
let pointers = [];

const statusUI = document.getElementById('status-ui');

// --- Initialization ---
function init() {
    // 1. Setup Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pure black for projection
    // Use an Orthographic camera for flat wall projection mapping
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(-aspect * 5, aspect * 5, 5, -5, 0.1, 100);
    camera.position.z = 10;

    // 2. Setup Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance

    // 3. Setup Post-Processing (OPTIMAL GRAPHICS: BLOOM)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.0, 0.5, 0.1);
    
    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // 4. Create Particle Engine
    createParticles();

    // 5. Handle Resizing
    window.addEventListener('resize', onWindowResize);

    // 6. Start Loop & Tracking
    animate();
    initMediaPipe();
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);
    velocities = new Float32Array(MAX_PARTICLES * 3);
    lifetimes = new Float32Array(MAX_PARTICLES); // Tracks how long until a particle dies

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Create a soft circle texture dynamically for the particles
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);

    // Additive blending makes overlapping particles glow brighter!
    const material = new THREE.PointsMaterial({
        size: 0.3,
        map: texture,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.8
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

// --- Interaction Logic ---
function emitParticle(x, y, baseColor) {
    // Overwrite the oldest particle
    const i3 = particleIndex * 3;

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = 0; // Flat on the wall

    // Add slight random variation to the color
    colors[i3] = baseColor.r * (0.8 + Math.random() * 0.4);
    colors[i3 + 1] = baseColor.g * (0.8 + Math.random() * 0.4);
    colors[i3 + 2] = baseColor.b * (0.8 + Math.random() * 0.4);

    // Explosion velocity (swirling out from the hand)
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 0.15;
    velocities[i3] = Math.cos(angle) * speed;
    velocities[i3 + 1] = Math.sin(angle) * speed;
    velocities[i3 + 2] = 0;

    // Particle lives for 60 to 120 frames
    lifetimes[particleIndex] = 60 + Math.random() * 60;

    particleIndex = (particleIndex + 1) % MAX_PARTICLES;
}

// --- AI Tracking ---
function initMediaPipe() {
    const videoElement = document.getElementById('video-feed');
    const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    
    // Support up to 4 hands at once (2 kids)
    hands.setOptions({ 
        maxNumHands: 4, 
        modelComplexity: 1, 
        minDetectionConfidence: 0.6, 
        minTrackingConfidence: 0.6 
    });
    
    hands.onResults((results) => {
        pointers = []; // Clear old positions
        if (results.multiHandLandmarks) {
            statusUI.innerText = `System Active | Tracking ${results.multiHandLandmarks.length} Hands`;
            
            // Loop through all hands detected
            results.multiHandLandmarks.forEach((landmarks, index) => {
                // Focus on the index finger tip
                const point = landmarks[8]; 
                
                // Map MediaPipe (0 to 1) to Three.js Orthographic space
                const aspect = window.innerWidth / window.innerHeight;
                const viewWidth = aspect * 10;
                const viewHeight = 10;
                
                // IMPORTANT: Webcam is mirrored, so we invert X
                const worldX = -((point.x - 0.5) * viewWidth); 
                const worldY = -((point.y - 0.5) * viewHeight);

                // Assign a color based on which hand it is
                const color = HAND_COLORS[index % HAND_COLORS.length];
                
                pointers.push({ x: worldX, y: worldY, color: color });
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
        // Emit 5 particles per frame per hand for a thick, glowing trail
        for(let i=0; i<5; i++) {
            emitParticle(p.x, p.y, p.color);
        }
    });

    // 2. Update existing particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (lifetimes[i] > 0) {
            const i3 = i * 3;
            
            // Apply velocity
            positions[i3] += velocities[i3];
            positions[i3 + 1] += velocities[i3 + 1];

            // Apply gravity (particles slowly fall down)
            velocities[i3 + 1] -= 0.002; 
            
            // Apply air drag (slow down horizontal movement)
            velocities[i3] *= 0.98;

            // Reduce lifetime
            lifetimes[i]--;

            // Fade out as they die
            if (lifetimes[i] < 20) {
                colors[i3] *= 0.8;
                colors[i3 + 1] *= 0.8;
                colors[i3 + 2] *= 0.8;
            }
        } else {
            // Move dead particles offscreen
            positions[i * 3 + 1] = -100;
        }
    }

    // 3. Tell Three.js to update the GPU data
    particleSystem.geometry.attributes.position.needsUpdate = true;
    particleSystem.geometry.attributes.color.needsUpdate = true;

    // 4. Render with Post-Processing Bloom
    composer.render();
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -aspect * 5;
    camera.right = aspect * 5;
    camera.top = 5;
    camera.bottom = -5;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// Ignite
init();
