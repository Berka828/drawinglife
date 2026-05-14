// app.js

const MAX_TREES = 300;
const MAX_FLOWERS = 500;
const MAX_RAIN = 1000;

let scene, camera, renderer;
let treeInstancedMesh, flowerInstancedMesh, rainParticles;
let treeCount = 0, flowerCount = 0;
let sunLight, hemiLight;

let weatherState = 'CLEAR'; 
let windStrength = 0.0;
let previousChestX = 0;

const treeData = []; 
const flowerData = [];
const ui = document.getElementById('ui');

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 5, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Lights
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xffddaa, 1.0);
    sunLight.position.set(10, 20, 10);
    scene.add(sunLight);

    // 3. Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 }); 
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // 4. Create Elements
    createProceduralFoliage();
    createRain();

    window.addEventListener('resize', onWindowResize);

    // 5. Start Loops
    animate();
    initMediaPipePose();
}

function createProceduralFoliage() {
    // Simple blocky trees for high performance
    const treeGeo = new THREE.CylinderGeometry(0, 1.5, 4, 4); // A simple pyramid shape
    treeGeo.translate(0, 2, 0); // Move up so base is at 0
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // Forest Green

    // Must clone the material to avoid sharing matrix bugs in some Threejs versions
    treeInstancedMesh = new THREE.InstancedMesh(treeGeo, treeMat.clone(), MAX_TREES);
    
    // Hide initially
    const dummy = new THREE.Object3D();
    dummy.scale.set(0,0,0);
    for(let i=0; i<MAX_TREES; i++) {
        dummy.updateMatrix();
        treeInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    treeInstancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(treeInstancedMesh);

    // Flowers (simple spheres)
    const flowerGeo = new THREE.SphereGeometry(0.3, 8, 8);
    flowerGeo.translate(0, 0.3, 0);
    flowerInstancedMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshLambertMaterial({ color: 0xff69b4 }), MAX_FLOWERS); 
    
    for(let i=0; i<MAX_FLOWERS; i++) {
        dummy.updateMatrix();
        flowerInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    flowerInstancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(flowerInstancedMesh);
}

function createRain() {
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(MAX_RAIN * 3);
    for(let i=0; i<MAX_RAIN; i++) {
        rainPos[i*3] = (Math.random() - 0.5) * 40;
        rainPos[i*3+1] = 50; // Start hidden above view
        rainPos[i*3+2] = (Math.random() - 0.5) * 40;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1, transparent: true, opacity: 0.6 });
    rainParticles = new THREE.Points(rainGeo, rainMat);
    scene.add(rainParticles);
}

function spawnTree() {
    if (treeCount >= MAX_TREES) return;
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 20 - 5; 
    treeData.push({ index: treeCount, x: x, z: z, currentScale: 0, targetScale: 0.8 + Math.random() * 0.8 });
    treeCount++;
}

function spawnFlower() {
    if (flowerCount >= MAX_FLOWERS) return;
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 15 + 2; 
    flowerData.push({ index: flowerCount, x: x, z: z, currentScale: 0, targetScale: 0.5 + Math.random() * 0.5 });
    flowerCount++;
}

function initMediaPipePose() {
    const videoElement = document.getElementById('video-feed');
    
    // Explicit CDN path to avoid resolution errors
    const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`});
    
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
    pose.onResults((results) => {
        if (results.poseLandmarks) {
            const marks = results.poseLandmarks;
            
            // Y is 0 at top, 1 at bottom
            const leftWristY = marks[15].y;
            const rightWristY = marks[16].y;
            const noseY = marks[0].y;
            
            // Use knees/ankles to detect squatting
            const leftKneeY = marks[25].y;
            const chestX = (marks[11].x + marks[12].x) / 2; 

            // Wind
            const velocityX = chestX - previousChestX;
            windStrength = velocityX * 10; 
            previousChestX = chestX;

            // SUN: Hands above head
            if (leftWristY < noseY && rightWristY < noseY) {
                weatherState = 'SUN';
                ui.innerText = "WEATHER: SUNNY ☀️";
                if(Math.random() > 0.8) spawnTree(); 
            } 
            // RAIN: Hands near knees (squatting)
            else if (leftWristY > leftKneeY && rightWristY > leftKneeY && noseY > 0.4) {
                weatherState = 'RAIN';
                ui.innerText = "WEATHER: RAINING 🌧️";
                if(Math.random() > 0.6) spawnFlower();
            } 
            // DEFAULT
            else {
                weatherState = 'CLEAR';
                ui.innerText = "WEATHER: CLEAR 🌤️";
            }
        } else {
            ui.innerText = "Step into the camera view!";
        }
    });

    ui.innerText = "Requesting Camera...";
    
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
            videoElement.srcObject = stream;
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                const cameraControl = new Camera(videoElement, {
                    onFrame: async () => { await pose.send({image: videoElement}); },
                    width: 640, height: 480
                });
                cameraControl.start().then(() => {
                    ui.innerText = "Camera Active. Play!";
                });
            };
        }).catch((err) => {
            console.error("Camera Error:", err);
            ui.innerText = "CAMERA BLOCKED! Allow camera to play.";
        });
}

function animate() {
    requestAnimationFrame(animate);

    const dummy = new THREE.Object3D();
    const time = Date.now() * 0.002;

    // Animate Trees
    let needsTreeUpdate = false;
    treeData.forEach(tree => {
        if(tree.currentScale < tree.targetScale) {
            tree.currentScale += 0.02;
            needsTreeUpdate = true;
        }
        
        const bend = Math.sin(time + tree.x) * 0.05 + windStrength; // Sway
        
        dummy.position.set(tree.x, 0, tree.z);
        dummy.rotation.set(0, 0, bend); 
        dummy.scale.set(tree.currentScale, tree.currentScale, tree.currentScale);
        dummy.updateMatrix();
        treeInstancedMesh.setMatrixAt(tree.index, dummy.matrix);
        needsTreeUpdate = true;
    });
    if(needsTreeUpdate) treeInstancedMesh.instanceMatrix.needsUpdate = true;

    // Animate Flowers
    let needsFlowerUpdate = false;
    flowerData.forEach(flower => {
        if(flower.currentScale < flower.targetScale) {
            flower.currentScale += 0.05;
            needsFlowerUpdate = true;
        }
        
        dummy.position.set(flower.x, 0, flower.z);
        dummy.rotation.set(0, time, 0); 
        dummy.scale.set(flower.currentScale, flower.currentScale, flower.currentScale);
        dummy.updateMatrix();
        flowerInstancedMesh.setMatrixAt(flower.index, dummy.matrix);
    });
    if(needsFlowerUpdate) flowerInstancedMesh.instanceMatrix.needsUpdate = true;

    // Weather Effects
    if (weatherState === 'RAIN') {
        const positions = rainParticles.geometry.attributes.position.array;
        for(let i=1; i<MAX_RAIN*3; i+=3) {
            positions[i] -= 0.8; // Rain speed
            if(positions[i] < 0) positions[i] = 20; 
        }
        rainParticles.geometry.attributes.position.needsUpdate = true;
        
        scene.fog.color.lerp(new THREE.Color(0x555555), 0.05);
        scene.background.lerp(new THREE.Color(0x555555), 0.05);
        sunLight.intensity = Math.max(0.2, sunLight.intensity - 0.05);
    } else if (weatherState === 'SUN') {
        const positions = rainParticles.geometry.attributes.position.array;
        for(let i=1; i<MAX_RAIN*3; i+=3) positions[i] = 50; // Hide rain
        rainParticles.geometry.attributes.position.needsUpdate = true;

        scene.fog.color.lerp(new THREE.Color(0xffddaa), 0.05);
        scene.background.lerp(new THREE.Color(0x87CEEB), 0.05);
        sunLight.intensity = Math.min(1.5, sunLight.intensity + 0.05);
    } else {
        scene.fog.color.lerp(new THREE.Color(0x87CEEB), 0.05);
        scene.background.lerp(new THREE.Color(0x87CEEB), 0.05);
        sunLight.intensity = Math.min(1.0, sunLight.intensity + 0.05);
