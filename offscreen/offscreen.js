// DevShot Offscreen Recorder

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ success: true, timestamp: Date.now() });
    return true;
  }

  if (message.action === 'startRecording') {
    console.log('[DevShot Offscreen] Received startRecording request');
    startRecording(message.data)
      .then(() => {
        console.log('[DevShot Offscreen] Recording initialization success');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('[DevShot Offscreen] Recording initialization error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'stopRecording') {
    console.log('[DevShot Offscreen] Received stopRecording request');
    stopRecording()
      .then(dataUrl => {
        console.log('[DevShot Offscreen] Recording stopped, data ready');
        sendResponse({ success: true, dataUrl });
      })
      .catch(error => {
        console.error('[DevShot Offscreen] Stop recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

let mediaRecorder;
let recordedChunks = [];

async function startRecording(data) {
  const streamId = data.streamId;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          minFrameRate: 30,
          maxFrameRate: 60
        }
      }
    });

    // High-quality recording options
    mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000 // 8 Mbps for high fidelity
    });

    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.start();
    console.log('Offscreen recording started');

  } catch (error) {
    console.error('Offscreen recording error:', error);
    throw error;
  }
}

async function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('No recording active'));
      return;
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result); // DataURL
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
      
      // Stop tracks
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
      mediaRecorder = null;
    };

    mediaRecorder.stop();
  });
}
