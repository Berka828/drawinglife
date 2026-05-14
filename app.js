// app.js

let scene, camera, renderer, drawings = [];
let handPos = new THREE.Vector2(-100, -100);

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
    initMediaPipe();
}

window.spawnInThreeJS = function(canvasSource) {
    const texture = new THREE.CanvasTexture(canvasSource);
    const geometry = new THREE.PlaneGeometry(1.5, 1.5 * (canvasSource.height / canvasSource.width));
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, 0);
    
    mesh.userData = { 
        velX: (Math.random() - 0.5) * 0.02, 
        velY: (Math.random() - 0.5) * 0.02,
        state: 'IDLE',
        timer: 0,
        personality: Math.floor(Math.random() * 3)
    };
    
    scene.add(mesh);
    drawings.push(mesh);
};

function initMediaPipe() {
    const videoElement = document.getElementById('video-feed');
    const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
    hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const point = results.multiHandLandmarks[0][8];
            handPos.x = (point.x - 0.5) * -10; 
            handPos.y = (point.y - 0.5) * -6;
        } else {
            handPos.set(-100, -100);
        }
    });

    const cameraControl = new Camera(videoElement, {
        onFrame: async () => { await hands.send({image: videoElement}); },
        width: 640, height: 480
    });
    cameraControl.start();
}

function animate() {
    requestAnimationFrame(animate);
    
    drawings.forEach(d => {
        const data = d.userData;

        d.position.x += data.velX;
        d.position.y += data.velY;

        if (Math.abs(d.position.x) > 6) data.velX *= -1;
        if (Math.abs(d.position.y) > 4) data.velY *= -1;

        const dist = d.position.distanceTo(new THREE.Vector3(handPos.x, handPos.y, 0));

        if (dist < 1.5 && data.state === 'IDLE') {
            data.state = 'INTERACTING';
            data.timer = 60;
        }

        if (data.state === 'INTERACTING') {
            data.timer--;

            if (data.personality === 0) {
                d.rotation.z = Math.sin(Date.now() * 0.05) * 0.2; 
                d.position.x += (d.position.x - handPos.x) * 0.15; 
                d.position.y += (d.position.y - handPos.y) * 0.15;
            } 
            else if (data.personality === 1) {
                const scaleValue = 1.0 + Math.sin(data.timer * 0.2) * 0.5;
                d.scale.set(scaleValue, scaleValue, 1);
            } 
            else if (data.personality === 2) {
                d.rotation.y += 0.3;
            }

            if (data.timer <= 0) {
                data.state = 'IDLE';
                d.rotation.set(0, 0, 0);
                d.scale.set(1, 1, 1);
            }
        } else {
            d.rotation.z = Math.sin(Date.now() * 0.001 + d.position.x) * 0.1;
        }
    });

    renderer.render(scene, camera);
}

init();
