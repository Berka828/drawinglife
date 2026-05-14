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
        let dst = new cv.Mat();
        let gray = new cv.Mat();
        
        // 1. Convert to Gray
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        // 2. Threshold to find drawing (assuming dark ink on light paper)
        cv.threshold(gray, gray, 150, 255, cv.THRESH_BINARY_INV);

        // 3. Find the drawing's bounding box
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() > 0) {
            status.innerText = "Drawing detected! Processing...";
            
            // Find largest contour
            let maxArea = 0;
            let maxIdx = -1;
            for (let i = 0; i < contours.size(); ++i) {
                let area = cv.contourArea(contours.get(i));
                if (area > maxArea) { maxArea = area; maxIdx = i; }
            }

            let rect = cv.boundingRect(contours.get(maxIdx));
            let roi = src.roi(rect);
            
            // 4. Create a temporary canvas for the texture
            let texCanvas = document.createElement('canvas');
            cv.imshow(texCanvas, roi);

            // 5. Pass to Three.js
            if (window.spawnInThreeJS) {
                window.spawnInThreeJS(texCanvas);
                status.innerText = "Drawing spawned in 3D!";
            }

            roi.delete();
        } else {
            status.innerText = "No drawing found. Try better lighting.";
        }

        src.delete(); dst.delete(); gray.delete(); contours.delete(); hierarchy.delete();

    } catch (err) {
        console.error("OpenCV Error: ", err);
        status.innerText = "Processing Error. See Console.";
    }
};

document.getElementById('scan-btn').addEventListener('click', window.scanDrawing);
