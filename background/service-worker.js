// Ensure content scripts can access session storage on every worker start
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

// Track which tab initiated the current recording
let recordingTabId = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log("PluckUp extension installed");
});

// --- Offscreen document management ---

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Microphone access for voice recording',
  });
}

async function closeOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

// --- Message handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getTabId') {
    sendResponse({ tabId: sender.tab?.id ?? null });
    return false;
  }

  if (message.type === 'checkApiKey') {
    chrome.storage.local.get('pluckup-openai-api-key', (result) => {
      const key = result['pluckup-openai-api-key'];
      sendResponse({ hasKey: !!key });
    });
    return true;
  }

  if (message.type === 'testApiKey') {
    (async () => {
      try {
        const apiKey = message.apiKey;
        if (!apiKey) {
          sendResponse({ ok: false, error: 'No API key provided' });
          return;
        }
        const response = await fetch('https://api.openai.com/v1/models/whisper-1', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (response.ok) {
          sendResponse({ ok: true });
        } else {
          const errBody = await response.text();
          sendResponse({ ok: false, error: `API error (${response.status}): ${errBody}` });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message || 'Connection failed' });
      }
    })();
    return true;
  }

  if (message.type === 'transcribeAudio') {
    (async () => {
      try {
        const keyResult = await chrome.storage.local.get('pluckup-openai-api-key');
        const apiKey = keyResult['pluckup-openai-api-key'];
        if (!apiKey) {
          sendResponse({ error: 'No API key configured' });
          return;
        }

        const binaryStr = atob(message.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: message.mimeType || 'audio/webm' });

        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        formData.append('model', 'whisper-1');
        formData.append('prompt', 'PluckUp is a browser extension for selecting and annotating web page elements. The user (web designer) is dictating a comment about a selected element on the page.');

        const response = await fetch('https://api.openai.com/v1/audio/translations', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        });

        if (!response.ok) {
          const errBody = await response.text();
          sendResponse({ error: `API error (${response.status}): ${errBody}` });
          return;
        }

        const data = await response.json();
        sendResponse({ text: data.text || '' });
      } catch (e) {
        sendResponse({ error: e.message || 'Transcription failed' });
      }
    })();
    return true;
  }

  if (message.type === 'captureVisibleTab') {
    const windowId = sender.tab?.windowId;
    if (windowId === undefined) {
      sendResponse({ error: 'Could not resolve tab window for screenshot' });
      return false;
    }

    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message || 'Failed to capture screenshot' });
        return;
      }
      if (!dataUrl) {
        sendResponse({ error: 'No screenshot data returned' });
        return;
      }
      sendResponse({ dataUrl });
    });
    return true;
  }

  // --- Recording messages from content script ---

  if (message.type === 'startRecording') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: 'Could not determine tab' });
      return false;
    }
    (async () => {
      try {
        await ensureOffscreenDocument();
        recordingTabId = tabId;
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'offscreen-start',
        });
        if (result?.error) {
          recordingTabId = null;
          // Permission denied — open a visible extension page to request mic access
          if (result.error.includes('NotAllowed') || result.error.includes('Permission')) {
            chrome.tabs.create({ url: chrome.runtime.getURL('permissions/microphone.html') });
          }
          sendResponse({ error: result.error });
        } else {
          sendResponse({ ok: true });
        }
      } catch (e) {
        recordingTabId = null;
        sendResponse({ error: e.message || 'Failed to start recording' });
      }
    })();
    return true;
  }

  if (message.type === 'stopRecording') {
    (async () => {
      try {
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'offscreen-stop',
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message || 'Failed to stop recording' });
      }
    })();
    return true;
  }

  if (message.type === 'cancelRecording') {
    (async () => {
      try {
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'offscreen-cancel',
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message || 'Failed to cancel recording' });
      }
    })();
    return true;
  }

  // --- Messages from offscreen document ---

  if (message.type === 'offscreen-audioLevel') {
    if (recordingTabId !== null) {
      chrome.tabs.sendMessage(recordingTabId, {
        type: 'audioLevel',
        level: message.level,
      }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'offscreen-audioData') {
    const tabId = recordingTabId;
    recordingTabId = null;
    (async () => {
      try {
        // Transcribe via OpenAI
        const keyResult = await chrome.storage.local.get('pluckup-openai-api-key');
        const apiKey = keyResult['pluckup-openai-api-key'];
        if (!apiKey) {
          if (tabId !== null) {
            chrome.tabs.sendMessage(tabId, {
              type: 'recordingError',
              error: 'No API key configured',
            }).catch(() => {});
          }
          await closeOffscreenDocument();
          return;
        }

        const binaryStr = atob(message.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: message.mimeType || 'audio/webm' });

        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        formData.append('model', 'whisper-1');
        formData.append('prompt', 'PluckUp is a browser extension for selecting and annotating web page elements. The user (web designer) is dictating a comment about a selected element on the page.');

        const response = await fetch('https://api.openai.com/v1/audio/translations', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        });

        if (!response.ok) {
          const errBody = await response.text();
          if (tabId !== null) {
            chrome.tabs.sendMessage(tabId, {
              type: 'recordingError',
              error: `API error (${response.status}): ${errBody}`,
            }).catch(() => {});
          }
          await closeOffscreenDocument();
          return;
        }

        const data = await response.json();
        if (tabId !== null) {
          chrome.tabs.sendMessage(tabId, {
            type: 'transcriptionResult',
            text: data.text || '',
          }).catch(() => {});
        }
        await closeOffscreenDocument();
      } catch (e) {
        if (tabId !== null) {
          chrome.tabs.sendMessage(tabId, {
            type: 'recordingError',
            error: e.message || 'Transcription failed',
          }).catch(() => {});
        }
        await closeOffscreenDocument();
      }
    })();
    return false;
  }

  if (message.type === 'offscreen-recordingError') {
    const tabId = recordingTabId;
    recordingTabId = null;
    if (tabId !== null) {
      chrome.tabs.sendMessage(tabId, {
        type: 'recordingError',
        error: message.error || 'Recording failed',
      }).catch(() => {});
    }
    closeOffscreenDocument().catch(() => {});
    return false;
  }

  if (message.type === 'offscreen-cancelComplete') {
    recordingTabId = null;
    closeOffscreenDocument().catch(() => {});
    return false;
  }

  if (message.type === 'micPermissionGranted') {
    // Permission page granted mic access; clean up the failed offscreen doc
    closeOffscreenDocument().catch(() => {});
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([`pluckup-state-${tabId}`, `pluckup-panel-state-${tabId}`]);

  // If the removed tab was recording, cancel and clean up
  if (recordingTabId === tabId) {
    recordingTabId = null;
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'offscreen-cancel',
    }).catch(() => {});
    closeOffscreenDocument().catch(() => {});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.url?.startsWith("chrome://")) return;

  // Ensure content script is injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content/content.css"],
    });
  } catch (e) {
    // Already injected, that's fine
  }

  // Toggle the floating panel
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "togglePanel" });
  } catch (e) {
    console.error("Failed to toggle panel:", e);
  }
});
