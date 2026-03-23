// PluckUp offscreen document — handles audio capture via getUserMedia
// Runs in the extension's own origin, unaffected by host page restrictions.

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyserNode = null;
let levelInterval = null;
let stream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  switch (msg.type) {
    case 'offscreen-start':
      handleStart().then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ error: err.message || 'Failed to start recording' })
      );
      return true;

    case 'offscreen-stop':
      handleStop();
      sendResponse({ ok: true });
      return false;

    case 'offscreen-cancel':
      handleCancel();
      sendResponse({ ok: true });
      return false;
  }
});

async function handleStart() {
  // Clean up any previous session
  cleanup();

  stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioChunks = [];

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  });

  mediaRecorder.addEventListener('stop', async () => {
    // Stop stream tracks inside the stop handler (fixes race condition)
    stopStreamTracks();

    const blob = new Blob(audioChunks, { type: mimeType });
    audioChunks = [];

    try {
      const base64 = await blobToBase64(blob);
      chrome.runtime.sendMessage({
        type: 'offscreen-audioData',
        audioBase64: base64,
        mimeType: mimeType,
      });
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'offscreen-recordingError',
        error: e.message || 'Failed to process audio data',
      });
    }

    cleanupAudioContext();
    mediaRecorder = null;
  });

  mediaRecorder.addEventListener('error', (e) => {
    chrome.runtime.sendMessage({
      type: 'offscreen-recordingError',
      error: e.error?.message || 'MediaRecorder error',
    });
    cleanup();
  });

  mediaRecorder.start();

  // Set up audio level analysis
  setupAudioLevel(stream);
}

function handleStop() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    // Stop the level interval immediately so UI stops updating
    clearLevelInterval();
    mediaRecorder.stop();
    // Stream tracks and AudioContext are cleaned up in the 'stop' event handler
  }
}

function handleCancel() {
  cleanup();
  // Notify service worker that cancel is complete
  chrome.runtime.sendMessage({ type: 'offscreen-cancelComplete' });
}

function setupAudioLevel(mediaStream) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return;

  audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  source.connect(analyserNode);

  const dataArray = new Uint8Array(analyserNode.fftSize);

  levelInterval = setInterval(() => {
    if (!analyserNode) return;
    analyserNode.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const centered = (dataArray[i] - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const level = Math.max(4, Math.min(100, Math.round(rms * 220)));

    chrome.runtime.sendMessage({
      type: 'offscreen-audioLevel',
      level: level,
    });
  }, 100);
}

function clearLevelInterval() {
  if (levelInterval !== null) {
    clearInterval(levelInterval);
    levelInterval = null;
  }
}

function stopStreamTracks() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function cleanupAudioContext() {
  clearLevelInterval();
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyserNode = null;
}

function cleanup() {
  clearLevelInterval();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    // Remove the stop listener to prevent sending data on cancel
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  audioChunks = [];

  stopStreamTracks();
  cleanupAudioContext();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to process recorded audio'));
    reader.readAsDataURL(blob);
  });
}
