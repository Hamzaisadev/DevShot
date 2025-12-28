// DevShot Batch Video Helper
// Injected into tabs during batch video sessions
(function() {
    if (window.hasDevShotOverlay) return;
    window.hasDevShotOverlay = true;

    // Create dark premium overlay
    const overlay = document.createElement('div');
    overlay.id = 'devshot-video-batch-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(10, 10, 10, 0.9);
        backdrop-filter: blur(12px);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Outfit", "Segoe UI", Roboto, sans-serif;
    `;

    overlay.innerHTML = `
        <div style="background: #18181b; padding: 48px; border-radius: 32px; border: 1px solid #27272a; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); max-width: 440px; animation: modalIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);">
            <style>
                @keyframes modalIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
                .rec-btn:hover { background: #dc2626 !important; transform: scale(1.02); }
                .rec-btn:active { transform: scale(0.98); }
            </style>
            <div style="width: 80px; height: 80px; background: rgba(239, 68, 68, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                <div style="width: 24px; height: 24px; background: #ef4444; border-radius: 50%; animation: pulse 2s infinite;"></div>
            </div>
            <h1 style="margin: 0 0 12px 0; font-size: 28px; font-weight: 700; color: #fff; letter-spacing: -0.02em;">Ready to Record</h1>
            <p style="color: #a1a1aa; margin-bottom: 32px; line-height: 1.6; font-size: 16px;">Click the button below, then select <span style="color: #fff; font-weight: 600;">"This Tab"</span> in the Chrome prompt to start the automatic scroll recording.</p>
            <button id="devshot-start-btn" class="rec-btn" style="background: #ef4444; color: white; border: none; padding: 18px 40px; font-size: 18px; font-weight: 600; border-radius: 16px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; justify-content: center; gap: 12px; margin: 0 auto; width: 100%; box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3);">
                Allow Access
            </button>
        </div>
    `;

    document.documentElement.appendChild(overlay);

    const startBtn = document.getElementById('devshot-start-btn');
    
    startBtn.onclick = async () => {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.7';
        startBtn.textContent = 'Preparing...';
        
        try {
            // This triggers the Chrome permission prompt
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { 
                    displaySurface: 'browser',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                preferCurrentTab: true,
                audio: false
            });

            // If they didn't pick the current tab, we might have issues, 
            // but preferCurrentTab: true makes it the default.
            
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 300);
            
            startRecording(stream);
        } catch (e) {
            console.error('[DevShot] Media access failed:', e);
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.innerHTML = '❌ Failed. Try Again';
        }
    };

    function startRecording(stream) {
        const recordedChunks = [];
        const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 8000000 // 8Mbps
        });

        recorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            
            // Show saving state
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
            overlay.innerHTML = `
                <div style="text-align: center;">
                    <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #ef4444; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px;"></div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                    <div style="color:white; font-size: 20px; font-weight: 500;">Saving recording...</div>
                </div>
            `;
            
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = async () => {
                const dataUrl = reader.result;
                const url = window.location.href;
                const domain = window.location.hostname;
                
                try {
                    await chrome.runtime.sendMessage({
                        action: 'saveVideo',
                        data: {
                            filename: `${domain}_batch_${Date.now()}.webm`,
                            domain,
                            device: 'desktop',
                            captureType: 'video',
                            dataUrl,
                            url,
                            timestamp: Date.now()
                        }
                    });
                } catch (err) {
                    console.error('[DevShot] Failed to save video:', err);
                }
                
                // Request next URL in batch
                chrome.runtime.sendMessage({ action: 'videoBatchNext' });
            };
            reader.readAsDataURL(blob);
        };

        recorder.start();
        
        // Let it settle then scroll
        setTimeout(() => {
            autoScroll(() => {
                if (recorder.state !== 'inactive') recorder.stop();
            });
        }, 1500);
    }

    function autoScroll(callback) {
        const getMax = () => Math.max(
            document.body.scrollHeight, 
            document.documentElement.scrollHeight
        ) - window.innerHeight;

        let max = getMax();
        if (max <= 0) {
            setTimeout(callback, 2000);
            return;
        }

        let current = 0;
        let lastY = -1;
        let stuckCount = 0;

        function step() {
            const currentY = window.scrollY;
            max = getMax(); // Re-check in case lazy loading increases height

            if (currentY >= max - 2) {
                setTimeout(callback, 1000);
                return;
            }

            // Stuck detection
            if (Math.abs(currentY - lastY) < 1) {
                stuckCount++;
                if (stuckCount > 100) { // ~1.5s
                    setTimeout(callback, 500);
                    return;
                }
            } else {
                stuckCount = 0;
            }
            lastY = currentY;

            current += 6; // Speed
            window.scrollTo(0, Math.min(current, max));
            requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }
})();
