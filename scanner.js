// scanner.js
window.scanDrawing = function() {
    console.log("Starting Scan...");
    const video = document.getElementById('video-feed');
    const status = document.getElementById('status');
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        
        // 1. Convert to Gray for contour detection
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        // 2. Threshold to find drawing boundaries
        cv.threshold(gray, gray, 150, 255, cv.THRESH_BINARY_INV);

        // 3. Find contours
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() > 0) {
            status.innerText = "Drawing detected! Processing background...";
            
            // Find largest contour (the bounding box of the drawing)
            let maxArea = 0;
            let maxIdx = -1;
            for (let i = 0; i < contours.size(); ++i) {
                let area = cv.contourArea(contours.get(i));
                if (area > maxArea) { maxArea = area; maxIdx = i; }
            }

            let rect = cv.boundingRect(contours.get(maxIdx));
            let croppedSrc = src.roi(rect); // The original color image, cropped
            
            // --- NEW: BACKGROUND REMOVAL LOGIC ---
            
            // Convert cropped image to RGBA so we have an Alpha channel
            let dst = new cv.Mat();
            cv.cvtColor(croppedSrc, dst, cv.COLOR_RGBA2BGRA); // Using BGRA for pixel manipulation
            
            // Loop through all pixels in the cropped image
            for (let i = 0; i < dst.rows; i++) {
                for (let j = 0; j < dst.cols; j++) {
                    let pixel = dst.ucharPtr(i, j);
                    // Check if pixel is "light" (e.g., the white paper)
                    // If R, G, and B are all high, it's close to white
                    if (pixel[0] > 180 && pixel[1] > 180 && pixel[2] > 180) {
                        pixel[3] = 0; // Set Alpha to 0 (Transparent)
                    }
                }
            }

            // Convert back to RGBA for canvas rendering
            cv.cvtColor(dst, dst, cv.COLOR_BGRA2RGBA);

            // --- END NEW LOGIC ---

            // 4. Create a temporary canvas for the texture
            let texCanvas = document.createElement('canvas');
            cv.imshow(texCanvas, dst);

            // 5. Pass to Three.js
            if (window.spawnInThreeJS) {
                window.spawnInThreeJS(texCanvas);
                status.innerText = "Drawing isolated and spawned!";
            }

            // Cleanup memory
            croppedSrc.delete();
            dst.delete();
        } else {
            status.innerText = "No drawing found. Try better lighting.";
        }

        src.delete(); gray.delete(); contours.delete(); hierarchy.delete();

    } catch (err) {
        console.error("OpenCV Error: ", err);
        status.innerText = "Processing Error. See Console.";
    }
};

document.getElementById('scan-btn').addEventListener('click', window.scanDrawing);
