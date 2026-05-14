// app.js

// --- CONFIGURATION ---
const MAX_TREES = 300;
const MAX_FLOWERS = 500;
const MAX_RAIN = 1000;

// --- GLOBALS ---
let scene, camera, renderer;
let treeInstancedMesh, flowerInstancedMesh, rainParticles;
let treeCount = 0, flowerCount = 0;
let sunLight, hemiLight;

// State tracking
let weatherState = 'CLEAR'; // 'CLEAR', 'SUN', 'RAIN'
let windStrength = 0.0;
let previousChestX = 0;

// To handle smooth growing animations
const treeData = []; 
const flowerData = [];

const ui = document.getElementById('ui');

// --- INITIALIZATION ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky Blue
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 5, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    setupLighting();
    setupEnvironment();
    createProceduralFoliage();
    createRain();

    window.addEventListener('resize', onWindowResize);

    animate();
    initMediaPipePose();
}

function setupLighting() {
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xffddaa, 1.0);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    scene.add(sunLight);
}

function setupEnvironment() {
    // The Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 }); // Sea Green
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

// --- PROCEDURAL GENERATION ---
function createProceduralFoliage() {
    // 1. Procedural Tree Geometry (Cone on a Cylinder)
    const treeGeo = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 2, 5);
    trunkGeo.translate(0, 1, 0); // Move origin to bottom
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    
    const leavesGeo = new THREE.ConeGeometry(1.5, 3, 5);
    leavesGeo.translate(0, 3.5, 0);
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    
    // Merge into a single BufferGeometry for Instancing
    const mergedTreeGeo = new THREE.Geometry();
    trunk.updateMatrix(); mergedTreeGeo.merge(trunk.geometry, trunk.matrix);
    leaves.updateMatrix(); mergedTreeGeo.merge(leaves.geometry, leaves.matrix);
    const finalTreeGeo = new THREE.BufferGeometry().fromGeometry(mergedTreeGeo);

    treeInstancedMesh = new THREE.InstancedMesh(finalTreeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), MAX_TREES);
    treeInstancedMesh.castShadow = true;
    treeInstancedMesh.receiveShadow = true;
    
    // Hide them all initially by scaling to 0
    const dummy = new THREE.Object3D();
    dummy.scale.set(0,0,0);
    for(let i=0; i<MAX_TREES; i++) {
        dummy.updateMatrix();
        treeInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(treeInstancedMesh);

    // 2. Procedural Flower Geometry
    const flowerGeo = new THREE.DodecahedronGeometry(0.3, 0);
    flowerGeo.translate(0, 0.3, 0);
    flowerInstancedMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshLambertMaterial({ color: 0xff69b4 }), MAX_FLOWERS); // Hot Pink
    
    for(let i=0; i<MAX_FLOWERS; i++) {
        dummy.updateMatrix();
        flowerInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(flowerInstancedMesh);
}

function createRain() {
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(MAX_RAIN * 3);
    for(let i=0; i<MAX_RAIN; i++) {
        rainPos[i*3] = (Math.random() - 0.5) * 40;
        rainPos[i*3+1] = Math.random() * 20 + 20; // Start high up
        rainPos[i*3+2] = (Math.random() - 0.5) * 40;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1, transparent: true, opacity: 0.6 });
    rainParticles = new THREE.Points(rainGeo, rainMat);
    scene.add(rainParticles);
}

// --- GAME LOGIC ---
function spawnTree() {
    if (treeCount >= MAX_TREES) return;
    
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 20 - 5; // Keep slightly behind camera
    
    treeData.push({ index: treeCount, x: x, z: z, currentScale: 0, targetScale: 0.8 + Math.random() * 0.6 });
    treeCount++;
}

function spawnFlower() {
    if (flowerCount >= MAX_FLOWERS) return;
    
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 15 + 2; // Closer to camera
    
    flowerData.push({ index: flowerCount, x: x, z: z, currentScale: 0, targetScale: 0.5 + Math.random() * 0.5 });
    flowerCount++;
}

// --- AI TRACKING (MediaPipe Pose) ---
function initMediaPipePose() {
    const videoElement = document.getElementById('video-feed');
    const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
    
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
    pose.onResults((results) => {
        if (results.poseLandmarks) {
            const marks = results.poseLandmarks;
            
            // Key Points (Y goes from 0 at top to 1 at bottom)
            const leftWristY = marks[15].y;
            const rightWristY = marks[16].y;
            const noseY = marks[0].y;
            const leftHipY = marks[23].y; // Note: Hips are actually 23/24, using these roughly
            
            const chestX = (marks[11].x + marks[12].x) / 2; // Avg of shoulders

            // 1. Check for WIND (Running)
            const velocityX = chestX - previousChestX;
            windStrength = velocityX * 10; // Amplify for shader effect
            previousChestX = chestX;

            // 2. Check for SUN (Hands high above head)
            if (leftWristY < noseY && rightWristY < noseY) {
                weatherState = 'SUN';
                ui.innerText = "WEATHER: SUNNY ☀️ (Growing Trees!)";
                if(Math.random() > 0.8) spawnTree(); // Spawn slowly
            } 
            // 3. Check for RAIN (Squatting - wrists near hips/knees)
            else if (leftWristY > leftHipY && rightWristY > leftHipY && noseY > 0.6) {
                weatherState = 'RAIN';
                ui.innerText = "WEATHER: RAINING 🌧️ (Growing Flowers!)";
                if(Math.random() > 0.6) spawnFlower();
            } 
            // 4. Default
            else {
                weatherState = 'CLEAR';
                ui.innerText = "WEATHER: CLEAR 🌤️";
            }
        } else {
            ui.innerText = "Step into the camera view!";
        }
    });

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
            videoElement.srcObject = stream;
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                const cameraControl = new Camera(videoElement, {
                    onFrame: async () => { await pose.send({image: videoElement}); },
                    width: 640, height: 480
                });
                cameraControl.start();
            };
        });
}

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const dummy = new THREE.Object3D();
    const time = Date.now() * 0.002;

    // 1. Animate Trees (Growth & Wind)
    treeData.forEach(tree => {
        // Growth easing
        if(tree.currentScale < tree.targetScale) tree.currentScale += 0.02;
        
        // Apply wind (bend the tree)
        const bend = Math.sin(time + tree.x) * 0.1 + windStrength;
        
        dummy.position.set(tree.x, 0, tree.z);
        dummy.rotation.set(0, 0, bend); 
        dummy.scale.set(tree.currentScale, tree.currentScale, tree.currentScale);
        dummy.updateMatrix();
        treeInstancedMesh.setMatrixAt(tree.index, dummy.matrix);
    });
    if(treeCount > 0) treeInstancedMesh.instanceMatrix.needsUpdate = true;

    // 2. Animate Flowers
    flowerData.forEach(flower => {
        if(flower.currentScale < flower.targetScale) flower.currentScale += 0.05;
        
        dummy.position.set(flower.x, 0, flower.z);
        dummy.rotation.set(0, time, 0); // Spin slightly
        dummy.scale.set(flower.currentScale, flower.currentScale, flower.currentScale);
        dummy.updateMatrix();
        flowerInstancedMesh.setMatrixAt(flower.index, dummy.matrix);
    });
    if(flowerCount > 0) flowerInstancedMesh.instanceMatrix.needsUpdate = true;

    // 3. Handle Weather Environment
    if (weatherState === 'RAIN') {
        // Drop rain particles
        const positions = rainParticles.geometry.attributes.position.array;
        for(let i=1; i<MAX_RAIN*3; i+=3) {
            positions[i] -= 0.5; // Fall speed
            if(positions[i] < 0) positions[i] = 20; // Reset to sky
        }
        rainParticles.geometry.attributes.position.needsUpdate = true;
        scene.fog.color.setHex(0x555555);
        scene.background.setHex(0x555555);
        sunLight.intensity = 0.2; // Dim light
    } else if (weatherState === 'SUN') {
        // Brighten
        scene.fog.color.setHex(0xffddaa);
        scene.background.setHex(0x87CEEB);
        sunLight.intensity = 1.5;
        // Move rain out of sight
        const positions = rainParticles.geometry.attributes.position.array;
        for(let i=1; i<MAX_RAIN*3; i+=3) positions[i] = 50; 
        rainParticles.geometry.attributes.position.needsUpdate = true;
    } else {
        // Clear
        scene.fog.color.setHex(0x87CEEB);
        scene.background.setHex(0x87CEEB);
        sunLight.intensity = 1.0;
    }

    // Decay wind
    windStrength *= 0.9;

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.onload = init;
