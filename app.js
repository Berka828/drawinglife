// app.js
const canvas = document.getElementById('webgl-canvas');
const videoElement = document.getElementById('video-feed');
let scene, camera, renderer, drawings = [];
let handPointer = new THREE.Vector2(-2, -2); // Default offscreen

// --- Step 1: Three.js Setup ---
function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Add some light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    animate();
}

// --- Step 2: Spawn Scanned Drawing ---
window.spawnDrawing = function(textureCanvas) {
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.minFilter = THREE.LinearFilter;
    
    // Create a 2D plane for the drawing
    const geometry = new THREE.PlaneGeometry(2, 2 * (textureCanvas.height / textureCanvas.width));
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    
    const plane = new THREE.Mesh(geometry, material);
    
    // Random spawn position
    plane.position.x = (Math.random() - 0.5) * 8;
    plane.position.y = (Math.random() - 0.5) * 4;
    
    // Add custom properties for animation
    plane.userData = {
        velocityX: (Math.random() - 0.5) * 0.05,
        velocityY: (Math.random() - 0.5) * 0.05
    };

    scene.add(plane);
    drawings.push(plane);
    console.log("Drawing spawned!");
};

// --- Step 3: MediaPipe Hands Setup ---
const hands = new Hands({locateFile: (file) => {
    return \`https://cdn.jsdelivr.net/npm/@mediapipe/hands/\${file}\`;
}});
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Get index finger tip (landmark 8)
        const indexFinger = results.multiHandLandmarks[0][8];
        
        // Map normalized MediaPipe coords (0 to 1) to Three.js world space
        // Note: X is inverted in mirrored webcams
        const vector = new THREE.Vector3(
            -(indexFinger.x * 2 - 1), 
            -(indexFinger.y * 2 - 1), 
            0.5
        );
        vector.unproject(camera);
        const dir = vector.sub(camera.position).normalize();
        const distance = -camera.position.z / dir.z;
        const pos = camera.position.clone().add(dir.multiplyScalar(distance));
        
        handPointer.set(pos.x, pos.y);
    } else {
        handPointer.set(-100, -100); // Move offscreen if no hands
    }
});

const cameraUtils = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    width: 640, height: 480
});
cameraUtils.start();

// --- Step 4: Animation & Interaction Loop ---
function animate() {
    requestAnimationFrame(animate);

    drawings.forEach(drawing => {
        // Floating movement
        drawing.position.x += drawing.userData.velocityX;
        drawing.position.y += drawing.userData.velocityY;

        // Bounce off walls (rough bounds)
        if (drawing.position.x > 5 || drawing.position.x < -5) drawing.userData.velocityX *= -1;
        if (drawing.position.y > 3 || drawing.position.y < -3) drawing.userData.velocityY *= -1;

        // Interaction: Run away from hand
        const dist = Math.sqrt(
            Math.pow(drawing.position.x - handPointer.x, 2) + 
            Math.pow(drawing.position.y - handPointer.y, 2)
        );

        if (dist < 2.0) { // If hand is close
            drawing.position.x += (drawing.position.x - handPointer.x) * 0.05;
            drawing.position.y += (drawing.position.y - handPointer.y) * 0.05;
        }
    });

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

initThreeJS();
