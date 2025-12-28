// DevShot Offscreen Recorder

let mediaRecorder = null;
let recordedChunks = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages targeted for offscreen
  if (message.target && message.target !== 'offscreen') {
    return false;
  }

  if (message.action === 'ping') {
    sendResponse({ success: true, timestamp: Date.now() });
    return true;
  }

  if (message.action === 'startRecording') {
    console.log('[DevShot Offscreen] Received startRecording request');
    
    (async () => {
      try {
        await startRecording(message.data);
        console.log('[DevShot Offscreen] Recording initialization success');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[DevShot Offscreen] Recording initialization error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep the message channel open
  }
  
  if (message.action === 'stopRecording') {
    console.log('[DevShot Offscreen] Received stopRecording request');
    
    (async () => {
      try {
        const dataUrl = await stopRecording();
        console.log('[DevShot Offscreen] Recording stopped, data ready');
        sendResponse({ success: true, dataUrl });
      } catch (error) {
        console.error('[DevShot Offscreen] Stop recording error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep the message channel open
  }
  
  return false;
});

async function startRecording(data) {
  const streamId = data.streamId;
  
  if (!streamId) {
    throw new Error('No streamId provided');
  }
  
  console.log('[DevShot Offscreen] Getting media stream with ID:', streamId);
  
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

    console.log('[DevShot Offscreen] Got media stream, starting recorder');

    // Robust MediaRecorder initialization
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    
    let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    console.log('[DevShot Offscreen] Selected MIME type:', selectedMimeType);

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 8000000 
    });

    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.start();
    console.log('[DevShot Offscreen] MediaRecorder started successfully');
  } catch (error) {
    console.error('[DevShot Offscreen] startRecording failure:', error);
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
      console.log('[DevShot Offscreen] MediaRecorder stopped, processing chunks:', recordedChunks.length);
      
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const reader = new FileReader();
      
      reader.onloadend = () => {
        console.log('[DevShot Offscreen] Blob converted to dataURL');
        resolve(reader.result);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read recording blob'));
      };
      reader.readAsDataURL(blob);
      
      // Stop tracks
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
      }
      mediaRecorder = null;
    };

    console.log('[DevShot Offscreen] Stopping MediaRecorder');
    mediaRecorder.stop();
  });
}
