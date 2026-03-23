const btn = document.getElementById('grant');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = 'Requesting access...';
  status.className = 'status';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Permission granted — stop tracks immediately
    stream.getTracks().forEach(t => t.stop());

    status.textContent = 'Microphone access granted! This tab will close shortly.';
    status.className = 'status success';

    // Notify service worker that permission was granted
    chrome.runtime.sendMessage({ type: 'micPermissionGranted' });

    setTimeout(() => window.close(), 1200);
  } catch (e) {
    btn.disabled = false;

    if (e.name === 'NotAllowedError') {
      status.textContent = 'Permission denied. Click the camera icon in the address bar to allow, then try again.';
    } else {
      status.textContent = 'Error: ' + (e.message || 'Could not access microphone');
    }
    status.className = 'status error';
  }
});
