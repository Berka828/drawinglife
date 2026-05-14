// scanner.js
let processedTextureCanvas = document.createElement('canvas');

function scanDrawing() {
    const video = document.getElementById('video-feed');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Read image into OpenCV
    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // Threshold to isolate the black marker lines and color
    let thresh = new cv.Mat();
    cv.threshold(gray, thresh, 200, 255, cv.THRESH_BINARY_INV);

    // Find contours (looking for the paper or drawing bounds)
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() > 0) {
        // Find the largest contour assuming it's the drawing
        let maxArea = 0;
        let maxContourIndex = -1;
        for (let i = 0; i < contours.size(); ++i) {
            let area = cv.contourArea(contours.get(i));
            if (area > maxArea) {
                maxArea = area;
                maxContourIndex = i;
            }
        }

        let rect = cv.boundingRect(contours.get(maxContourIndex));
        
        // Crop the original image
        let rectRoi = new cv.Rect(rect.x, rect.y, rect.width, rect.height);
        let cropped = src.roi(rectRoi);

        // Make white background transparent
        let dst = new cv.Mat();
        cv.cvtColor(cropped, dst, cv.COLOR_RGBA2BGRA);
        for (let i = 0; i < dst.rows; i++) {
            for (let j = 0; j < dst.cols; j++) {
                let pixel = dst.ucharPtr(i, j);
                // If pixel is close to white, set alpha to 0
                if (pixel[0] > 200 && pixel[1] > 200 && pixel[2] > 200) {
                    pixel[3] = 0; 
                }
            }
        }

        // Draw back to our texture canvas
        processedTextureCanvas.width = dst.cols;
        processedTextureCanvas.height = dst.rows;
        cv.imshow(processedTextureCanvas, dst);

        // Tell app.js to spawn the entity
        if (typeof spawnDrawing === "function") {
            spawnDrawing(processedTextureCanvas);
        }

        dst.delete(); cropped.delete();
    }

    src.delete(); gray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
}

document.getElementById('scan-btn').addEventListener('click', () => {
    if (cv.getBuildInformation) {
        scanDrawing();
    } else {
        console.warn("OpenCV is not loaded yet.");
    }
});
