// scanner.js
window.scanDrawing = function() {
    console.log("Starting Scan...");
    const video = document.getElementById('video-feed');
    const status = document.getElementById('status');
    
    // Create a temporary canvas to get the video frame
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
        
        // 2. Threshold to find where the drawing is
        cv.threshold(gray, gray, 150, 255, cv.THRESH_BINARY_INV);

        // 3. Find the bounding box of the drawing
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() > 0) {
            status.innerText = "Drawing detected! Isolating subject...";
            
            // Find the largest contour
            let maxArea = 0;
            let maxIdx = -1;
            for (let i = 0; i < contours.size(); ++i) {
                let area = cv.contourArea(contours.get(i));
                if (area > maxArea) { maxArea = area; maxIdx = i; }
            }

            let rect = cv.boundingRect(contours.get(maxIdx));
            let croppedColor = src.roi(rect); // The original color image, cropped
            
            // --- NEW: ADVANCED BACKGROUND REMOVAL LOGIC ---
            
            // 4. Create an Alpha Mask from the cropped drawing
            let alphaMask = new cv.Mat();
            cv.cvtColor(croppedColor, alphaMask, cv.COLOR_RGBA2GRAY);
            
            // Otsu's thresholding automatically adapts to the lighting in your room!
            cv.threshold(alphaMask, alphaMask, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

            // 5. Add an alpha channel to the color crop
            let rgbaPlanes = new cv.MatVector();
            cv.split(croppedColor, rgbaPlanes);
            
            // Replace or add the alpha channel
            if (rgbaPlanes.size() === 4) {
                rgbaPlanes.set(3, alphaMask);
            } else {
                rgbaPlanes.push_back(alphaMask); 
            }

            // 6. Merge the color (RGB) and the new alpha channel (A)
            let finalImage = new cv.Mat();
            cv.merge(rgbaPlanes, finalImage);

            // --- END NEW LOGIC ---

            // 7. Create a canvas for the final texture
            let texCanvas = document.createElement('canvas');
            cv.imshow(texCanvas, finalImage);

            // 8. Pass the isolated drawing to Three.js
            if (window.spawnInThreeJS) {
                window.spawnInThreeJS(texCanvas);
                status.innerText = "Drawing isolated and spawned!";
            }

            // Cleanup OpenCV memory
            croppedColor.delete();
            alphaMask.delete();
            rgbaPlanes.delete();
            finalImage.delete();

        } else {
            status.innerText = "No drawing found. Try better lighting or a darker marker.";
        }

        // Final cleanup
        src.delete();
        gray.delete();
        contours.delete();
        hierarchy.delete();

    } catch (err) {
        console.error("OpenCV Error: ", err);
        status.innerText = "Processing Error. See Console.";
    }
};

// Ensure this listener is attached after the button exists
document.addEventListener('DOMContentLoaded', (event) => {
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
        scanBtn.addEventListener('click', window.scanDrawing);
    }
});
