// scanner.js

function scanDrawing() {
    const video = document.getElementById('video-feed');
    const status = document.getElementById('status');
    
    if (!video || video.videoWidth === 0) {
        status.innerText = "Camera not ready. Check permissions.";
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.threshold(gray, gray, 150, 255, cv.THRESH_BINARY_INV);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() > 0) {
            status.innerText = "Drawing detected! Isolating...";
            
            let maxArea = 0;
            let maxIdx = -1;
            for (let i = 0; i < contours.size(); ++i) {
                let area = cv.contourArea(contours.get(i));
                if (area > maxArea) { maxArea = area; maxIdx = i; }
            }

            let rect = cv.boundingRect(contours.get(maxIdx));
            let croppedColor = src.roi(rect);
            
            // --- ADVANCED BACKGROUND REMOVAL ---
            let alphaMask = new cv.Mat();
            cv.cvtColor(croppedColor, alphaMask, cv.COLOR_RGBA2GRAY);
            cv.threshold(alphaMask, alphaMask, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
            
            let finalImage = new cv.Mat();
            cv.cvtColor(croppedColor, finalImage, cv.COLOR_RGB2RGBA);

            for (let i = 0; i < finalImage.rows; i++) {
                for (let j = 0; j < finalImage.cols; j++) {
                    if (alphaMask.ucharPtr(i, j)[0] === 0) {
                        finalImage.ucharPtr(i, j)[3] = 0;
                    }
                }
            }
            // --- END ---

            let texCanvas = document.createElement('canvas');
            cv.imshow(texCanvas, finalImage);

            if (window.spawnInThreeJS) {
                window.spawnInThreeJS(texCanvas);
                status.innerText = "Drawing spawned!";
            }

            croppedColor.delete(); alphaMask.delete(); finalImage.delete();
        } else {
            status.innerText = "No drawing found. Try better lighting.";
        }
        
        src.delete(); gray.delete(); contours.delete(); hierarchy.delete();

    } catch (err) {
        console.error("OpenCV Error: ", err);
        status.innerText = "Processing Error. See Console.";
    }
}

// This waits for the page to fully load before attaching the click listener
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('scan-btn').addEventListener('click', scanDrawing);
});
