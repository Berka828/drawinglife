// app.js

// --- Configuration ---
const MAX_PARTICLES = 15000;
const HAND_COLORS = [
    new THREE.Color(0x00ffff), // Cyan
    new THREE.Color(0xff00ff), // Magenta
    new THREE.Color(0xffff00), // Yellow
    new THREE.Color(0x00ff88)  // Mint
];

let scene, camera, renderer, composer;
let particleSystem, positions, colors, velocities, lifetimes;
let particleIndex = 0;
let pointers = [];

const statusUI = document.getElementById('status-ui');

function init() {
    try {
        // 1. Scene & Camera setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); 

        const aspect = window.innerWidth / window.innerHeight;
        camera = new THREE.OrthographicCamera(-aspect * 5, aspect * 5, 5, -5, 0.1, 100);
        camera.position.z = 10;

        // 2. Renderer setup
        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // 3. CINEMATIC BLOOM SETUP (Using Global THREE objects)
        const renderScene = new THREE.RenderPass(scene, camera);
        const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 1.0, 0.1);
        
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);

        // 4. Create the Particles
        createParticles();

        window.addEventListener('resize', onWindowResize);

        // 5. Start engine
        animate();
        initMediaPipe();
    } catch (e) {
        statusUI.innerText = "Engine Error: " + e.message;
        console.error(e);
    }
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);
    velocities = new Float32Array(MAX_PARTICLES * 3);
    lifetimes = new Float32Array(MAX_PARTICLES);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
        size: 1.2, 
        map: texture,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

function emitParticle(x, y, baseColor) {
    const i3 = particleIndex * 3;

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = 0;

    colors[i3] = baseColor.r * 1.5;
    colors[i3 + 1] = baseColor.g * 1.5;
    colors[i3 + 2] = baseColor.b * 1.5;

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 0.2;
    velocities[i3] = Math.cos(angle) * speed;
    velocities[i3 + 1] = Math.sin(angle) * speed;
    velocities[i3 + 2] = 0;

    lifetimes[particleIndex] = 60 + Math.random() * 40;

    particleIndex = (particleIndex + 1) % MAX_PARTICLES;
}

function initMediaPipe() {
    const videoElement = document.getElementById('video-feed');
    const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    
    hands.setOptions({ maxNumHands: 4, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    
    hands.onResults((results) => {
        pointers = []; 
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            statusUI.innerText = `Magic Active | Tracking ${results.multiHandLandmarks.length} Hands`;
            
            results.multiHandLandmarks.forEach((landmarks, index) => {
                const indexTip = landmarks[8]; 
                const palm = landmarks[0];
                
                const aspect = window.innerWidth / window.innerHeight;
                const viewWidth = aspect * 10;
                const viewHeight = 10;
                
                const color = HAND_COLORS[index % HAND_COLORS.length];
                
                pointers.push({ x: -((indexTip.x - 0.5) * viewWidth), y: -((indexTip.y - 0.5) * viewHeight), color: color });
                pointers.push({ x: -((palm.x - 0.5) * viewWidth), y: -((palm.y - 0.5) * viewHeight), color: color });
            });
        } else {
            statusUI.innerText = "Step in front of the camera to play!";
        }
    });

    statusUI.innerText = "Requesting Camera Permission...";
    
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
            videoElement.srcObject = stream;
            
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                
                const cameraControl = new Camera(videoElement, {
                    onFrame: async () => { await hands.send({image: videoElement}); },
                    width: 640, height: 480
                });
                
                cameraControl.start().then(() => {
                    statusUI.innerText = "Camera Started. Warming up projectors...";
                });
            };
        })
        .catch((err) => {
            console.error("Camera Error:", err);
            statusUI.innerText = "CAMERA BLOCKED! Check browser permissions.";
            statusUI.style.color = "red";
        });
}

function animate() {
    requestAnimationFrame(animate);

    pointers.forEach(p => {
        for(let i=0; i<4; i++) emitParticle(p.x, p.y, p.color);
    });

    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (lifetimes[i] > 0) {
            const i3 = i * 3;
            positions[i3] += velocities[i3];
            positions[i3 + 1] += velocities[i3 + 1];
            velocities[i3 + 1] -= 0.002; 
            velocities[i3] *= 0.98; 
            lifetimes[i]--;

            if (lifetimes[i] < 20) {
                colors[i3] *= 0.8; colors[i3 + 1] *= 0.8; colors[i3 + 2] *= 0.8;
            }
        } else {
            positions[i * 3 + 1] = -100;
        }
    }

    particleSystem.geometry.attributes.position.needsUpdate = true;
    particleSystem.geometry.attributes.color.needsUpdate = true;

    try {
        composer.render();
    } catch(e) {
        console.error("Render Loop Error:", e);
        statusUI.innerText = "Error during render. Check console.";
    }
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

// Start the app!
window.onload = init;
