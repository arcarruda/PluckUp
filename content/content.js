(() => {
  if (window.__pluckupInitialized) return;
  window.__pluckupInitialized = true;

  const state = {
    isSelecting: false,
    selections: [],
    nextIndex: 1,
    currentHovered: null,
    commentOverlay: null,
    pendingElement: null,
    panelElement: null,
    isPinned: false,
    panelPosition: null,
    isRecording: false,
  };

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let tabId = null;

  function isExtensionContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  }

  async function getTabId() {
    if (!isExtensionContextValid()) return null;
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'getTabId' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response?.tabId ?? null);
          }
        });
      });
    } catch (e) {
      console.warn('PluckUp: failed to get tab ID', e);
      return null;
    }
  }

  function getPageUrl() {
    return location.origin + location.pathname;
  }

  // --- Selection Mode ---

  function handleSelectionKeyDown(e) {
    if (e.key === "Escape" && !state.commentOverlay) {
      disableSelectionMode();
      updatePanelSelectButton();
      notifyPopup();
    }
  }

  function enableSelectionMode() {
    state.isSelecting = true;
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleSelectionKeyDown, true);
    persistState();
  }

  function disableSelectionMode() {
    state.isSelecting = false;
    clearHighlight();
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleSelectionKeyDown, true);
    persistState();
  }

  function handleMouseMove(e) {
    if (state.commentOverlay) return;
    const el = e.target;
    if (el.closest("[data-pluckup-overlay]") || el.closest("[data-pluckup-panel]") || el.hasAttribute("data-pluckup-bubble")) return;
    if (state.currentHovered && state.currentHovered !== el) {
      state.currentHovered.classList.remove("pluckup-highlight");
    }
    el.classList.add("pluckup-highlight");
    state.currentHovered = el;
  }

  function handleClick(e) {
    if (state.commentOverlay) return;
    const el = e.target;
    if (el.closest("[data-pluckup-overlay]") || el.closest("[data-pluckup-panel]") || el.hasAttribute("data-pluckup-bubble")) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    clearHighlight();
    state.pendingElement = el;
    showCommentOverlay(el);
  }

  function clearHighlight() {
    if (state.currentHovered) {
      state.currentHovered.classList.remove("pluckup-highlight");
      state.currentHovered = null;
    }
  }

  // --- Comment Overlay ---

  function showCommentOverlay(targetEl, existingComment, onSave, clickPos, existingScreenshotBase64 = "") {
    removeCommentOverlay();

    const rect = targetEl.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.setAttribute("data-pluckup-overlay", "true");

    let top, left;

    if (clickPos) {
      top = clickPos.y;
      left = clickPos.x;
      if (left + 322 > window.innerWidth) {
        left = clickPos.x - 322;
      }
      if (top + 360 > window.innerHeight) {
        top = clickPos.y - 360;
      }
    } else {
      top = rect.bottom + 8;
      left = rect.left;
      if (top + 360 > window.innerHeight) {
        top = Math.max(8, rect.top - 360);
      }
      if (left + 322 > window.innerWidth) {
        left = Math.max(8, window.innerWidth - 330);
      }
    }

    top = Math.max(8, top);
    left = Math.max(8, left);

    overlay.style.setProperty("top", top + "px", "important");
    overlay.style.setProperty("left", left + "px", "important");

    const descriptor = describeElement(targetEl);

    overlay.innerHTML = `
      <div class="pluckup-overlay-header">
        <div class="pluckup-overlay-title">Comment on: ${escapeHtml(descriptor)}</div>
        <button class="pluckup-overlay-close" data-pluckup-cancel-top title="Cancel">&times;</button>
      </div>
      <div class="pluckup-overlay-input-area">
        <textarea placeholder="Describe what you want to change..." data-pluckup-textarea></textarea>
      </div>
      <div class="pluckup-recording-ui" style="display:none;" data-pluckup-recording-ui>
        <div class="pluckup-recording-heading" data-pluckup-recording-heading>Recording...</div>
        <div class="pluckup-recording-subtitle">Mic level...</div>
        <div class="pluckup-level-track">
          <div class="pluckup-level-fill" data-pluckup-level-fill></div>
        </div>
        <div class="pluckup-recording-actions">
          <button class="pluckup-btn-cancel-rec" data-pluckup-cancel-rec>Cancel</button>
          <button class="pluckup-btn-send-rec" data-pluckup-send-rec>Stop and send</button>
        </div>
      </div>
      <div class="pluckup-overlay-footer">
        <div class="pluckup-overlay-tools">
          <button class="pluckup-mic-btn" data-pluckup-mic title="Dictate with microphone">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm0 18a7 7 0 0 0 7-7h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 7 7zm-1 2v3h2v-3h-2z"/></svg>
          </button>
          <button class="pluckup-screenshot-btn" data-pluckup-screenshot title="Capture screenshot">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/>
              <circle cx="12" cy="12.5" r="3.5"/>
            </svg>
          </button>
          <div class="pluckup-screenshot-status" data-pluckup-screenshot-status></div>
        </div>
        <button class="pluckup-btn-save" data-pluckup-save>Save</button>
      </div>
      <div class="pluckup-overlay-errors" data-pluckup-overlay-errors></div>
    `;

    overlay.setAttribute("popover", "manual");
    document.body.appendChild(overlay);
    overlay.showPopover();
    state.commentOverlay = overlay;
    overlay.__pluckupTargetEl = targetEl;
    overlay.dataset.pluckupScreenshotBase64 = existingScreenshotBase64 || "";
    overlay.dataset.pluckupScreenshotMessage = existingScreenshotBase64 ? "Screenshot taken" : "";

    const textarea = overlay.querySelector("[data-pluckup-textarea]");
    if (existingComment) {
      textarea.value = existingComment;
    }
    setTimeout(() => textarea.focus(), 50);

    const saveFn = onSave || saveSelection;

    textarea.addEventListener("keydown", (e) => {
      if (state.isRecording) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveFn();
      } else if (e.key === "Escape") {
        cancelSelection();
      }
    });

    overlay.querySelector("[data-pluckup-save]").addEventListener("click", saveFn);
    overlay.querySelector("[data-pluckup-cancel-top]").addEventListener("click", cancelSelection);

    overlay.querySelector("[data-pluckup-mic]").addEventListener("click", () => handleMicClick(overlay));
    overlay.querySelector("[data-pluckup-screenshot]").addEventListener("click", () => handleScreenshotToggle(overlay));
    overlay.querySelector("[data-pluckup-cancel-rec]").addEventListener("click", () => handleCancelRecording(overlay));
    overlay.querySelector("[data-pluckup-send-rec]").addEventListener("click", () => handleSendRecording(overlay));
    updateScreenshotUi(overlay);
  }

  function saveSelection() {
    const textarea = state.commentOverlay?.querySelector("[data-pluckup-textarea]");
    const comment = textarea ? textarea.value.trim() : "";
    const el = state.pendingElement;

    if (!el) {
      cancelSelection();
      return;
    }

    const data = extractElementData(el);
    data.comment = comment;
    data.index = state.nextIndex++;
    data.screenshotBase64 = getOverlayScreenshotBase64(state.commentOverlay);

    const bubble = createBubble(el, data.index);
    data.bubbleId = bubble.id;
    data.elementRef = el;
    data.selector = generateSelector(el);

    state.selections.push(data);
    removeCommentOverlay();
    state.pendingElement = null;

    persistState();
    notifyPopup();
  }

  function cancelSelection() {
    removeCommentOverlay();
    state.pendingElement = null;
  }

  function editSelection(index, clickPos) {
    const sel = state.selections.find((s) => s.index === index);
    if (!sel || !sel.elementRef || !sel.elementRef.isConnected) return;

    showCommentOverlay(sel.elementRef, sel.comment || "", () => {
      const textarea = state.commentOverlay?.querySelector("[data-pluckup-textarea]");
      sel.comment = textarea ? textarea.value.trim() : "";
      sel.screenshotBase64 = getOverlayScreenshotBase64(state.commentOverlay);
      removeCommentOverlay();
      persistState();
      notifyPopup();
    }, clickPos, sel.screenshotBase64 || "");
  }

  function removeCommentOverlay() {
    if (state.isRecording) {
      state.isRecording = false;
      chrome.runtime.sendMessage({ type: 'cancelRecording' });
    }
    if (state.commentOverlay) {
      state.commentOverlay.remove();
      state.commentOverlay = null;
    }
  }

  // --- Mic / Recording ---

  function handleMicClick(overlay) {
    if (state.isRecording) return;

    // Remove any previous warning/error
    overlay.querySelectorAll(".pluckup-api-warning, .pluckup-mic-error").forEach((el) => el.remove());

    chrome.runtime.sendMessage({ type: 'checkApiKey' }, (response) => {
      if (chrome.runtime.lastError || !response?.hasKey) {
        const warning = document.createElement("div");
        warning.className = "pluckup-api-warning";
        warning.textContent = "OpenAI API key not set. Click the gear icon in the panel header to add your key.";
        overlay.querySelector("[data-pluckup-overlay-errors]").appendChild(warning);
        return;
      }
      startRecording(overlay);
    });
  }

  function startRecording(overlay) {
    // Send startRecording to service worker → offscreen document handles getUserMedia
    chrome.runtime.sendMessage({ type: 'startRecording' }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        const errorMsg = response?.error || chrome.runtime.lastError?.message || 'Failed to start recording';
        overlay.querySelectorAll(".pluckup-mic-error").forEach((el) => el.remove());
        const errEl = document.createElement("div");
        errEl.className = "pluckup-mic-error";
        errEl.textContent = errorMsg.includes("NotAllowed") || errorMsg.includes("Permission")
          ? "Microphone permission needed. A new tab has opened — grant access there, then try again."
          : "Could not access microphone: " + errorMsg;
        overlay.querySelector("[data-pluckup-overlay-errors]").appendChild(errEl);
        return;
      }

      // Recording started successfully in offscreen document
      state.isRecording = true;
      const micBtn = overlay.querySelector("[data-pluckup-mic]");
      const recordingUI = overlay.querySelector("[data-pluckup-recording-ui]");
      if (micBtn) micBtn.disabled = true;
      const saveBtn = overlay.querySelector("[data-pluckup-save]");
      const screenshotBtn = overlay.querySelector("[data-pluckup-screenshot]");
      if (saveBtn) saveBtn.disabled = true;
      if (screenshotBtn) screenshotBtn.disabled = true;
      if (recordingUI) recordingUI.style.display = "flex";
      setRecordingUiState(overlay, "recording");
    });
  }

  function handleCancelRecording(overlay) {
    if (!state.isRecording) return;
    state.isRecording = false;
    chrome.runtime.sendMessage({ type: 'cancelRecording' });
    restoreAfterRecording(overlay);
  }

  function handleSendRecording(overlay) {
    if (!state.isRecording) return;

    const cancelRecBtn = overlay.querySelector("[data-pluckup-cancel-rec]");
    const sendRecBtn = overlay.querySelector("[data-pluckup-send-rec]");
    const saveBtn = overlay.querySelector("[data-pluckup-save]");
    const micBtn = overlay.querySelector("[data-pluckup-mic]");
    const screenshotBtn = overlay.querySelector("[data-pluckup-screenshot]");
    const textarea = overlay.querySelector("[data-pluckup-textarea]");
    const closeBtn = overlay.querySelector("[data-pluckup-cancel-top]");

    setRecordingUiState(overlay, "sending");
    if (cancelRecBtn) cancelRecBtn.disabled = true;
    if (sendRecBtn) sendRecBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;
    if (micBtn) micBtn.disabled = true;
    if (screenshotBtn) screenshotBtn.disabled = true;
    if (textarea) textarea.disabled = true;
    if (closeBtn) closeBtn.disabled = true;

    state.isRecording = false;
    // Tell offscreen document to stop recording; it will send audio data to service worker
    // which will transcribe and send the result back via transcriptionResult message
    chrome.runtime.sendMessage({ type: 'stopRecording' });
  }

  function restoreAfterRecording(overlay) {
    const textarea = overlay.querySelector("[data-pluckup-textarea]");
    const micBtn = overlay.querySelector("[data-pluckup-mic]");
    const screenshotBtn = overlay.querySelector("[data-pluckup-screenshot]");
    const saveBtn = overlay.querySelector("[data-pluckup-save]");
    const recordingUI = overlay.querySelector("[data-pluckup-recording-ui]");

    const closeBtn = overlay.querySelector("[data-pluckup-cancel-top]");
    if (textarea) textarea.disabled = false;
    if (micBtn) micBtn.disabled = false;
    if (screenshotBtn) screenshotBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
    if (closeBtn) closeBtn.disabled = false;
    if (recordingUI) recordingUI.style.display = "none";
    setRecordingUiState(overlay, "recording");
  }

  function setRecordingUiState(overlay, mode) {
    const recordingUI = overlay.querySelector("[data-pluckup-recording-ui]");
    const heading = overlay.querySelector("[data-pluckup-recording-heading]");
    const cancelRecBtn = overlay.querySelector("[data-pluckup-cancel-rec]");
    const sendRecBtn = overlay.querySelector("[data-pluckup-send-rec]");
    const levelFill = overlay.querySelector("[data-pluckup-level-fill]");

    if (!recordingUI || !heading || !cancelRecBtn || !sendRecBtn || !levelFill) return;

    if (mode === "sending") {
      recordingUI.classList.add("is-sending");
      heading.textContent = "Sending...";
      sendRecBtn.textContent = "Sending...";
      levelFill.style.width = "45%";
    } else {
      recordingUI.classList.remove("is-sending");
      heading.textContent = "Recording...";
      sendRecBtn.textContent = "Stop and send";
      cancelRecBtn.disabled = false;
      sendRecBtn.disabled = false;
      levelFill.style.width = "0%";
    }
  }

  function updateAudioLevel(level) {
    const overlay = state.commentOverlay;
    if (!overlay?.isConnected) return;
    const levelFill = overlay.querySelector("[data-pluckup-level-fill]");
    if (levelFill) levelFill.style.width = `${level}%`;
  }

  async function handleScreenshotToggle(overlay) {
    const screenshotBtn = overlay.querySelector("[data-pluckup-screenshot]");
    if (!screenshotBtn || screenshotBtn.disabled) return;

    const currentScreenshot = overlay.dataset.pluckupScreenshotBase64 || "";
    if (currentScreenshot) {
      overlay.dataset.pluckupScreenshotBase64 = "";
      overlay.dataset.pluckupScreenshotMessage = "Screenshot removed";
      updateScreenshotUi(overlay);
      setTimeout(() => {
        if (overlay.isConnected && overlay.dataset.pluckupScreenshotMessage === "Screenshot removed") {
          overlay.dataset.pluckupScreenshotMessage = "";
          updateScreenshotUi(overlay);
        }
      }, 2000);
      return;
    }

    const targetEl = overlay.__pluckupTargetEl;
    if (!targetEl || !targetEl.isConnected) {
      alert("Could not capture screenshot because the selected element is no longer available.");
      return;
    }

    screenshotBtn.disabled = true;

    try {
      const screenshotBase64 = await captureElementScreenshotBase64(targetEl);
      overlay.dataset.pluckupScreenshotBase64 = screenshotBase64;
      overlay.dataset.pluckupScreenshotMessage = "Screenshot taken";
      updateScreenshotUi(overlay);
    } catch (e) {
      alert(e.message || "Failed to capture screenshot");
    } finally {
      screenshotBtn.disabled = false;
    }
  }

  function updateScreenshotUi(overlay) {
    const screenshotBtn = overlay.querySelector("[data-pluckup-screenshot]");
    const status = overlay.querySelector("[data-pluckup-screenshot-status]");
    const hasScreenshot = !!(overlay.dataset.pluckupScreenshotBase64 || "");

    if (screenshotBtn) screenshotBtn.classList.toggle("is-active", hasScreenshot);
    if (status) {
      status.textContent = overlay.dataset.pluckupScreenshotMessage || "";
    }
  }

  async function captureElementScreenshotBase64(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      throw new Error("Selected element is too small to capture.");
    }

    const dataUrl = await captureVisibleTab();
    const screenshotImage = await loadImage(dataUrl);
    const dpr = window.devicePixelRatio || 1;

    let sourceX = Math.max(0, Math.floor(rect.left * dpr));
    let sourceY = Math.max(0, Math.floor(rect.top * dpr));
    let sourceWidth = Math.floor(rect.width * dpr);
    let sourceHeight = Math.floor(rect.height * dpr);

    sourceWidth = Math.min(sourceWidth, screenshotImage.width - sourceX);
    sourceHeight = Math.min(sourceHeight, screenshotImage.height - sourceY);

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("Selected element is outside the visible area.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to prepare screenshot canvas.");
    }

    ctx.drawImage(
      screenshotImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    return canvas.toDataURL("image/png").split(",")[1];
  }

  function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "captureVisibleTab" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.dataUrl) {
          reject(new Error(response?.error || "Failed to capture tab screenshot"));
          return;
        }
        resolve(response.dataUrl);
      });
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load captured screenshot"));
      image.src = dataUrl;
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to process recorded audio"));
      reader.readAsDataURL(blob);
    });
  }

  function getOverlayScreenshotBase64(overlay) {
    if (!overlay) return "";
    return overlay.dataset.pluckupScreenshotBase64 || "";
  }

  // --- Element Data Extraction ---

  function extractElementData(el) {
    const tagName = el.tagName.toLowerCase();
    const id = el.id || "";
    const classes = Array.from(el.classList)
      .filter((c) => c !== "pluckup-highlight")
      .join(", ");
    const textContent = (el.textContent || "").trim().substring(0, 200);
    const outerSnippet = el.outerHTML.substring(0, 300);
    const hierarchy = getParentHierarchy(el);

    return { tagName, id, classes, textContent, outerSnippet, hierarchy };
  }

  function getParentHierarchy(el) {
    const parts = [];
    let current = el.parentElement;
    let depth = 0;
    while (current && depth < 5 && current !== document.documentElement) {
      let desc = current.tagName.toLowerCase();
      if (current.id) desc += "#" + current.id;
      if (current.classList.length > 0) {
        desc += "." + Array.from(current.classList).join(".");
      }
      parts.push(desc);
      current = current.parentElement;
      depth++;
    }
    return parts;
  }

  function describeElement(el) {
    let desc = el.tagName.toLowerCase();
    if (el.id) desc += "#" + el.id;
    else if (el.classList.length > 0) desc += "." + el.classList[0];
    const text = (el.textContent || "").trim();
    if (text.length > 0) desc += ` "${text.substring(0, 30)}"`;
    return desc;
  }

  // --- Bubbles ---

  function createBubble(el, index) {
    const bubble = document.createElement("div");
    bubble.setAttribute("data-pluckup-bubble", "true");
    bubble.id = "pluckup-bubble-" + index;
    bubble.textContent = index;

    bubble.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      editSelection(index, { x: e.clientX, y: e.clientY });
    });

    document.body.appendChild(bubble);
    positionBubble(bubble, el);
    return bubble;
  }

  function positionBubble(bubble, el) {
    if (!el.isConnected) return;
    const rect = el.getBoundingClientRect();
    bubble.style.setProperty("top", (rect.top + window.scrollY - 8) + "px", "important");
    bubble.style.setProperty("left", (rect.right + window.scrollX - 8) + "px", "important");
  }

  function updateAllBubbles() {
    const placed = [];
    const BUBBLE_SIZE = 22;
    const GAP = 4;
    const STEP = BUBBLE_SIZE + GAP;

    state.selections.forEach((sel) => {
      const bubble = document.getElementById(sel.bubbleId);
      if (bubble && sel.elementRef && sel.elementRef.isConnected) {
        positionBubble(bubble, sel.elementRef);

        let bTop = parseFloat(bubble.style.getPropertyValue("top"));
        let bLeft = parseFloat(bubble.style.getPropertyValue("left"));

        let offset = 0;
        while (placed.some((p) => Math.abs(p.top - (bTop + offset)) < BUBBLE_SIZE && Math.abs(p.left - bLeft) < BUBBLE_SIZE)) {
          offset += STEP;
        }

        if (offset > 0) {
          bubble.style.setProperty("top", (bTop + offset) + "px", "important");
        }

        placed.push({ top: bTop + offset, left: bLeft });
      }
    });
  }

  window.addEventListener("scroll", updateAllBubbles, true);
  window.addEventListener("resize", () => {
    updateAllBubbles();
    clampPanelToViewport();
  });

  // --- Clipboard Helper ---

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {
      // clipboard API blocked by Permissions-Policy or security context
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("Both clipboard methods failed");
  }

  // --- Prompt Builder ---

  function buildPrompt() {
    let prompt = "# Page Analysis Request\n\n";
    prompt += `**Source URL:** ${window.location.href}\n\n`;
    prompt += "## Selected Elements\n\n";

    state.selections.forEach((sel, i) => {
      prompt += `### Element ${sel.index}\n`;
      prompt += `- **Tag:** ${sel.tagName}\n`;
      if (sel.id) prompt += `- **ID:** ${sel.id}\n`;
      if (sel.classes) prompt += `- **Classes:** ${sel.classes}\n`;
      if (sel.textContent) {
        const text = sel.textContent.length > 200 ? sel.textContent.substring(0, 200) + "..." : sel.textContent;
        prompt += `- **Text Content:** "${text}"\n`;
      }
      prompt += `- **HTML Snippet:** \`${sel.outerSnippet}\`\n`;
      if (sel.hierarchy.length > 0) {
        prompt += `- **Parent Hierarchy:** ${sel.hierarchy.join(" > ")}\n`;
      }
      if (sel.comment) {
        prompt += `- **Comment:** ${sel.comment}\n`;
      }
      if (sel.screenshotBase64) {
        prompt += "- **Element Screenshot (Base64 PNG):**\n";
        prompt += "```text\n";
        prompt += `${sel.screenshotBase64}\n`;
        prompt += "```\n";
      }
      if (i < state.selections.length - 1) prompt += "\n---\n\n";
    });

    prompt += "\n\n## Instructions\n\n";
    prompt += "Based on the selected elements and comments above, please provide detailed suggestions for improving this page.\n";

    return prompt;
  }

  // --- Cleanup ---

  function removeSelection(index) {
    const idx = state.selections.findIndex((s) => s.index === index);
    if (idx === -1) return;

    const sel = state.selections[idx];
    const bubble = document.getElementById(sel.bubbleId);
    if (bubble) bubble.remove();

    state.selections.splice(idx, 1);
    persistState();
    notifyPopup();
  }

  function clearAll() {
    state.selections.forEach((sel) => {
      const bubble = document.getElementById(sel.bubbleId);
      if (bubble) bubble.remove();
    });
    state.selections = [];
    state.nextIndex = 1;
    removeCommentOverlay();
    clearHighlight();
    if (state.isSelecting) disableSelectionMode();
    persistState();
  }

  // --- Serialization ---

  function serializeSelections() {
    return state.selections.map((sel) => ({
      index: sel.index,
      tagName: sel.tagName,
      id: sel.id,
      classes: sel.classes,
      textContent: sel.textContent ? sel.textContent.substring(0, 100) : "",
      comment: sel.comment,
      hasScreenshot: !!sel.screenshotBase64,
    }));
  }

  // --- Communication ---

  function notifyPopup() {
    if (!isExtensionContextValid()) return;
    chrome.runtime.sendMessage({
      type: "selectionUpdated",
      selections: serializeSelections(),
      isSelecting: state.isSelecting,
    }).catch(() => {});

    if (state.isPinned && state.panelElement) {
      renderPanelSelections();
      updatePanelSelectButton();
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case "getState":
        sendResponse({
          selections: serializeSelections(),
          isSelecting: state.isSelecting,
        });
        break;

      case "toggleSelectionMode":
        if (state.isSelecting) {
          disableSelectionMode();
        } else {
          enableSelectionMode();
        }
        sendResponse({ isSelecting: state.isSelecting });
        break;

      case "removeSelection":
        removeSelection(msg.index);
        sendResponse({ ok: true });
        break;

      case "editSelection":
        editSelection(msg.index);
        sendResponse({ ok: true });
        break;

      case "exportPrompt":
        sendResponse({ prompt: buildPrompt() });
        break;

      case "clearAll":
        clearAll();
        sendResponse({ ok: true });
        break;

      case "togglePanel":
        if (state.isPinned && state.panelElement) {
          hidePanel();
        } else {
          showPanel();
        }
        sendResponse({ ok: true });
        break;

      case "pinPanel":
        showPanel();
        sendResponse({ ok: true });
        break;

      case "unpinPanel":
        hidePanel();
        sendResponse({ ok: true });
        break;

      case "audioLevel":
        updateAudioLevel(msg.level);
        break;

      case "transcriptionResult": {
        const overlay = state.commentOverlay;
        if (!overlay?.isConnected) break;
        restoreAfterRecording(overlay);

        const textValue = (msg.text || "").trim();
        if (!textValue) {
          alert("No speech detected");
          break;
        }

        const input = overlay.querySelector("[data-pluckup-textarea]");
        if (!input) break;
        input.value = input.value.trim()
          ? input.value.trimEnd() + " " + textValue
          : textValue;
        input.focus();
        break;
      }

      case "recordingError": {
        const errOverlay = state.commentOverlay;
        state.isRecording = false;
        if (errOverlay?.isConnected) {
          restoreAfterRecording(errOverlay);
          errOverlay.querySelectorAll(".pluckup-mic-error").forEach((el) => el.remove());
          const errEl = document.createElement("div");
          errEl.className = "pluckup-mic-error";
          errEl.textContent = msg.error || "Recording failed";
          errOverlay.querySelector("[data-pluckup-overlay-errors]").appendChild(errEl);
        }
        break;
      }

      default:
        sendResponse({ error: "unknown message type" });
    }
    return true;
  });

  // --- Floating Panel ---

  function showPanel() {
    if (state.panelElement) return;
    state.isPinned = true;

    const panel = document.createElement("div");
    panel.setAttribute("data-pluckup-panel", "true");

    panel.innerHTML = `
      <div class="pluckup-panel-header">
        <span class="pluckup-panel-logo">PluckUp</span>
        <span class="pluckup-panel-tagline">AI Prompt Builder</span>
        <button class="pluckup-panel-settings-btn" title="Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button class="pluckup-panel-unpin" title="Close panel">&times;</button>
      </div>
      <div class="pluckup-panel-main" data-pluckup-panel-main>
        <button class="pluckup-panel-select">Select Element</button>
        <div class="pluckup-panel-list">
          <div class="pluckup-panel-empty">No elements selected yet.<br>Click "Select Element" to start.</div>
        </div>
        <div class="pluckup-panel-footer">
          <button class="pluckup-panel-export" disabled>Export Prompt to Clipboard</button>
          <button class="pluckup-panel-clear" disabled>Clear All</button>
        </div>
        <div class="pluckup-panel-status"></div>
      </div>
      <div class="pluckup-panel-settings" data-pluckup-panel-settings>
        <div class="pluckup-panel-settings-label">OpenAI API Key</div>
        <div class="pluckup-panel-settings-input-row">
          <input type="password" class="pluckup-panel-settings-input" placeholder="sk-..." data-pluckup-settings-key />
          <button class="pluckup-panel-settings-eye" title="Show/hide key" data-pluckup-settings-eye>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <div class="pluckup-panel-settings-actions">
          <button class="pluckup-panel-settings-test" data-pluckup-settings-test>Test</button>
          <button class="pluckup-panel-settings-save" data-pluckup-settings-save>Save</button>
          <button class="pluckup-panel-settings-clear" data-pluckup-settings-clear>Clear</button>
        </div>
        <div class="pluckup-panel-settings-status" data-pluckup-settings-status></div>
      </div>
    `;

    if (state.panelPosition) {
      panel.style.setProperty("top", state.panelPosition.top + "px", "important");
      panel.style.setProperty("left", state.panelPosition.left + "px", "important");
      panel.style.setProperty("bottom", "auto", "important");
      panel.style.setProperty("right", "auto", "important");
    }

    panel.setAttribute("popover", "manual");
    document.body.appendChild(panel);
    panel.showPopover();
    state.panelElement = panel;

    bindPanelEvents(panel);
    initPanelDrag(panel);
    renderPanelSelections();
    if (!state.isSelecting) enableSelectionMode();
    updatePanelSelectButton();
    savePanelState();
  }

  function hidePanel() {
    if (state.isSelecting) disableSelectionMode();
    if (state.panelElement) {
      state.panelElement.remove();
      state.panelElement = null;
    }
    state.isPinned = false;
    state.panelPosition = null;
    clearPanelState();
  }

  function bindPanelEvents(panel) {
    panel.querySelector(".pluckup-panel-unpin").addEventListener("click", () => {
      // Clear all selections and exit selection mode when closing
      state.selections.forEach((sel) => {
        const bubble = document.getElementById(sel.bubbleId);
        if (bubble) bubble.remove();
      });
      state.selections = [];
      state.nextIndex = 1;
      removeCommentOverlay();
      clearHighlight();
      if (state.isSelecting) disableSelectionMode();
      persistState();

      hidePanel();
      notifyPopup();
    });

    // --- Settings gear ---
    const mainContent = panel.querySelector("[data-pluckup-panel-main]");
    const settingsPanel = panel.querySelector("[data-pluckup-panel-settings]");
    const settingsBtn = panel.querySelector(".pluckup-panel-settings-btn");
    const settingsKeyInput = panel.querySelector("[data-pluckup-settings-key]");
    const settingsStatus = panel.querySelector("[data-pluckup-settings-status]");
    let settingsKeyVisible = false;

    function setSettingsView(showSettings) {
      mainContent.classList.toggle("is-hidden", showSettings);
      settingsPanel.classList.toggle("is-visible", showSettings);
      settingsBtn.classList.toggle("active", showSettings);
    }

    setSettingsView(false);

    settingsBtn.addEventListener("click", () => {
      const showingSettings = settingsPanel.classList.contains("is-visible");
      if (showingSettings) {
        // Back to main content
        setSettingsView(false);
      } else {
        // Show settings, hide main content
        setSettingsView(true);
        // Check if a key already exists
        chrome.storage.local.get("pluckup-openai-api-key", (result) => {
          if (chrome.runtime.lastError) return;
          if (result["pluckup-openai-api-key"]) {
            settingsKeyInput.placeholder = "••••••••••••";
            settingsKeyInput.value = "";
          } else {
            settingsKeyInput.placeholder = "sk-...";
            settingsKeyInput.value = "";
          }
        });
      }
    });

    panel.querySelector("[data-pluckup-settings-eye]").addEventListener("click", () => {
      settingsKeyVisible = !settingsKeyVisible;
      if (settingsKeyVisible) {
        settingsKeyInput.type = "text";
        // Load actual key if input is empty
        if (!settingsKeyInput.value) {
          chrome.storage.local.get("pluckup-openai-api-key", (result) => {
            if (chrome.runtime.lastError) return;
            const key = result["pluckup-openai-api-key"];
            if (key) settingsKeyInput.value = key;
          });
        }
      } else {
        settingsKeyInput.type = "password";
      }
    });

    panel.querySelector("[data-pluckup-settings-test]").addEventListener("click", () => {
      // Use the value in the input, or fall back to the stored key
      const inputVal = settingsKeyInput.value.trim();
      if (inputVal) {
        doTestKey(inputVal, settingsStatus);
      } else {
        chrome.storage.local.get("pluckup-openai-api-key", (result) => {
          if (chrome.runtime.lastError) return;
          const storedKey = result["pluckup-openai-api-key"];
          if (storedKey) {
            doTestKey(storedKey, settingsStatus);
          } else {
            showSettingsStatus(settingsStatus, "No key to test", "error");
          }
        });
      }
    });

    panel.querySelector("[data-pluckup-settings-save]").addEventListener("click", () => {
      const key = settingsKeyInput.value.trim();
      if (!key.startsWith("sk-")) {
        showSettingsStatus(settingsStatus, "Key must start with sk-", "error");
        return;
      }
      chrome.storage.local.set({ "pluckup-openai-api-key": key }, () => {
        if (chrome.runtime.lastError) {
          showSettingsStatus(settingsStatus, "Failed to save", "error");
          return;
        }
        settingsKeyInput.value = "";
        settingsKeyInput.type = "password";
        settingsKeyInput.placeholder = "••••••••••••";
        settingsKeyVisible = false;
        showSettingsStatus(settingsStatus, "API key saved", "success");
      });
    });

    panel.querySelector("[data-pluckup-settings-clear]").addEventListener("click", () => {
      chrome.storage.local.remove("pluckup-openai-api-key", () => {
        if (chrome.runtime.lastError) {
          showSettingsStatus(settingsStatus, "Failed to clear", "error");
          return;
        }
        settingsKeyInput.value = "";
        settingsKeyInput.placeholder = "sk-...";
        settingsKeyInput.type = "password";
        settingsKeyVisible = false;
        showSettingsStatus(settingsStatus, "API key cleared", "success");
      });
    });

    panel.querySelector(".pluckup-panel-select").addEventListener("click", () => {
      if (state.isSelecting) {
        disableSelectionMode();
      } else {
        enableSelectionMode();
      }
      updatePanelSelectButton();
      notifyPopup();
    });

    panel.querySelector(".pluckup-panel-export").addEventListener("click", async () => {
      const prompt = buildPrompt();
      if (prompt) {
        try {
          await copyToClipboard(prompt);
          // Inline cleanup (same as clear handler) so panel stays visible
          state.selections.forEach((sel) => {
            const bubble = document.getElementById(sel.bubbleId);
            if (bubble) bubble.remove();
          });
          state.selections = [];
          state.nextIndex = 1;
          removeCommentOverlay();
          clearHighlight();
          if (state.isSelecting) disableSelectionMode();
          persistState();

          renderPanelSelections();
          updatePanelSelectButton();
          notifyPopup();
          showPanelStatus("Prompt copied to clipboard!");
        } catch (e) {
          showPanelStatus("Failed to copy");
        }
      }
    });

    panel.querySelector(".pluckup-panel-clear").addEventListener("click", () => {
      // clearAll() calls hidePanel(), but for clear we want panel to stay
      state.selections.forEach((sel) => {
        const bubble = document.getElementById(sel.bubbleId);
        if (bubble) bubble.remove();
      });
      state.selections = [];
      state.nextIndex = 1;
      removeCommentOverlay();
      clearHighlight();
      if (state.isSelecting) disableSelectionMode();
      persistState();

      renderPanelSelections();
      updatePanelSelectButton();
      notifyPopup();
      showPanelStatus("All cleared");
    });
  }

  function renderPanelSelections() {
    if (!state.panelElement) return;
    const list = state.panelElement.querySelector(".pluckup-panel-list");
    const empty = list.querySelector(".pluckup-panel-empty");

    list.querySelectorAll(".pluckup-panel-card").forEach((c) => c.remove());

    const selections = serializeSelections();

    if (selections.length === 0) {
      empty.style.display = "block";
      updatePanelFooterButtons(0);
      return;
    }

    empty.style.display = "none";
    updatePanelFooterButtons(selections.length);

    selections.forEach((sel) => {
      const card = document.createElement("div");
      card.className = "pluckup-panel-card";

      let descriptor = sel.tagName;
      if (sel.id) descriptor += "#" + sel.id;
      else if (sel.classes) descriptor += "." + sel.classes.split(",")[0].trim();

      const text = sel.textContent
        ? sel.textContent.substring(0, 40) + (sel.textContent.length > 40 ? "..." : "")
        : "";

      card.innerHTML = `
        <div class="pluckup-panel-badge">${sel.index}</div>
        <div class="pluckup-panel-info">
          <div class="pluckup-panel-descriptor">${escapeHtml(descriptor)}${text ? ' "' + escapeHtml(text) + '"' : ""}</div>
          ${sel.comment ? '<div class="pluckup-panel-comment">' + escapeHtml(sel.comment) + "</div>" : ""}
        </div>
        <button class="pluckup-panel-edit" data-index="${sel.index}" title="Edit">&#9998;</button>
        <button class="pluckup-panel-delete" data-index="${sel.index}" title="Remove">&times;</button>
      `;

      card.querySelector(".pluckup-panel-badge").addEventListener("click", () => {
        editSelection(sel.index);
      });

      card.querySelector(".pluckup-panel-edit").addEventListener("click", () => {
        editSelection(sel.index);
      });

      card.querySelector(".pluckup-panel-delete").addEventListener("click", () => {
        removeSelection(sel.index);
      });

      list.appendChild(card);
    });
  }

  function updatePanelSelectButton() {
    if (!state.panelElement) return;
    const btn = state.panelElement.querySelector(".pluckup-panel-select");
    btn.classList.toggle("active", state.isSelecting);
    btn.textContent = state.isSelecting ? "Selecting..." : "Select Element";
  }

  function updatePanelFooterButtons(count) {
    if (!state.panelElement) return;
    state.panelElement.querySelector(".pluckup-panel-export").disabled = count === 0;
    state.panelElement.querySelector(".pluckup-panel-clear").disabled = count === 0;
  }

  function showPanelStatus(text) {
    if (!state.panelElement) return;
    const statusEl = state.panelElement.querySelector(".pluckup-panel-status");
    statusEl.textContent = text;
    statusEl.classList.add("visible");
    setTimeout(() => statusEl.classList.remove("visible"), 2000);
  }

  function showSettingsStatus(statusEl, text, type) {
    statusEl.textContent = text;
    statusEl.className = "pluckup-panel-settings-status " + (type === "success" ? "success" : type === "error" ? "error" : "");
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "pluckup-panel-settings-status";
    }, 3000);
  }

  function doTestKey(apiKey, statusEl) {
    showSettingsStatus(statusEl, "Testing...", "");
    chrome.runtime.sendMessage({ type: 'testApiKey', apiKey }, (response) => {
      if (chrome.runtime.lastError) {
        showSettingsStatus(statusEl, "Connection error", "error");
        return;
      }
      if (response?.ok) {
        showSettingsStatus(statusEl, "Key is valid!", "success");
      } else {
        const errMsg = response?.error || "Invalid key";
        showSettingsStatus(statusEl, errMsg.length > 60 ? "Invalid API key" : errMsg, "error");
      }
    });
  }

  // --- Drag ---

  function initPanelDrag(panel) {
    const header = panel.querySelector(".pluckup-panel-header");

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".pluckup-panel-unpin") || e.target.closest(".pluckup-panel-settings-btn")) return;
      e.preventDefault();
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      header.style.setProperty("cursor", "grabbing", "important");
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const panel = state.panelElement;
      if (!panel) return;

      const maxLeft = window.innerWidth - panel.offsetWidth;
      const maxTop = window.innerHeight - panel.offsetHeight;
      const left = Math.max(0, Math.min(e.clientX - dragOffsetX, maxLeft));
      const top = Math.max(0, Math.min(e.clientY - dragOffsetY, maxTop));

      panel.style.setProperty("top", top + "px", "important");
      panel.style.setProperty("left", left + "px", "important");
      panel.style.setProperty("bottom", "auto", "important");
      panel.style.setProperty("right", "auto", "important");

      state.panelPosition = { top, left };
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      const panel = state.panelElement;
      if (panel) {
        panel.querySelector(".pluckup-panel-header").style.setProperty("cursor", "grab", "important");
      }
      savePanelState();
    });
  }

  function clampPanelToViewport() {
    const panel = state.panelElement;
    if (!panel || !state.panelPosition) return;

    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    const left = Math.max(0, Math.min(state.panelPosition.left, maxLeft));
    const top = Math.max(0, Math.min(state.panelPosition.top, maxTop));

    panel.style.setProperty("top", top + "px", "important");
    panel.style.setProperty("left", left + "px", "important");

    state.panelPosition = { top, left };
    savePanelState();
  }

  // --- Top Layer Re-promotion ---

  let _repromoteScheduled = false;

  function repromoteToTopLayer() {
    if (_repromoteScheduled) return;
    _repromoteScheduled = true;
    queueMicrotask(() => {
      _repromoteScheduled = false;
      // Re-promote panel first, then overlay (overlay should stay on top of panel)
      if (state.panelElement?.matches(":popover-open")) {
        state.panelElement.hidePopover();
        state.panelElement.showPopover();
      }
      if (state.commentOverlay?.matches(":popover-open")) {
        state.commentOverlay.hidePopover();
        state.commentOverlay.showPopover();
      }
    });
  }

  // --- Panel Persistence ---

  function savePanelState() {
    if (tabId === null || !isExtensionContextValid()) return;
    try {
      chrome.storage.session.set({
        [`pluckup-panel-state-${tabId}`]: {
          url: getPageUrl(),
          isPinned: state.isPinned,
          position: state.panelPosition,
        },
      }).catch((e) => console.warn('PluckUp: failed to save panel state', e));
    } catch (e) {
      console.warn('PluckUp: extension context invalidated (savePanelState)', e);
    }
  }

  function clearPanelState() {
    if (tabId === null || !isExtensionContextValid()) return;
    try {
      chrome.storage.session.remove(`pluckup-panel-state-${tabId}`);
    } catch (e) {
      console.warn('PluckUp: extension context invalidated (clearPanelState)', e);
    }
  }

  async function restorePanelState() {
    if (tabId === null || !isExtensionContextValid()) return;
    try {
      const key = `pluckup-panel-state-${tabId}`;
      const result = await chrome.storage.session.get(key);
      const saved = result[key];
      if (!saved) return;
      if (saved.url !== getPageUrl()) {
        clearPanelState();
        return;
      }
      if (saved.isPinned) {
        state.panelPosition = saved.position || null;
        showPanel();
      }
    } catch (e) {
      console.warn('PluckUp: failed to restore panel state', e);
    }
  }

  // --- State Persistence ---

  function generateSelector(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const path = [];
    let current = el;
    while (current && current !== document.documentElement && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift("#" + CSS.escape(current.id));
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(" > ");
  }

  function persistState() {
    if (tabId === null || !isExtensionContextValid()) return;
    try {
      chrome.storage.session.set({
        [`pluckup-state-${tabId}`]: {
          url: getPageUrl(),
          isSelecting: state.isSelecting,
          nextIndex: state.nextIndex,
          selections: state.selections.map((sel) => ({
            index: sel.index,
            tagName: sel.tagName,
            id: sel.id,
            classes: sel.classes,
            textContent: sel.textContent,
            outerSnippet: sel.outerSnippet,
            hierarchy: sel.hierarchy,
            comment: sel.comment,
            screenshotBase64: sel.screenshotBase64 || "",
            selector: sel.selector,
          })),
        },
      }).catch((e) => console.warn('PluckUp: failed to persist state', e));
    } catch (e) {
      console.warn('PluckUp: extension context invalidated (persistState)', e);
    }
  }

  async function restoreState() {
    if (tabId === null || !isExtensionContextValid()) return;
    try {
      const key = `pluckup-state-${tabId}`;
      const result = await chrome.storage.session.get(key);
      const saved = result[key];
      if (!saved) return;
      if (saved.url !== getPageUrl()) {
        try {
          chrome.storage.session.remove(key);
        } catch (_e) { /* context invalidated */ }
        return;
      }

      state.nextIndex = saved.nextIndex || 1;

      if (saved.selections && saved.selections.length > 0) {
        saved.selections.forEach((sel) => {
          const el = sel.selector ? document.querySelector(sel.selector) : null;
          if (!el) return;

          const bubble = createBubble(el, sel.index);
          state.selections.push({
            ...sel,
            bubbleId: bubble.id,
            elementRef: el,
          });
        });
      }

      if (saved.isSelecting) {
        enableSelectionMode();
      }
    } catch (e) {
      console.warn('PluckUp: failed to restore state', e);
    }
  }

  // --- Helpers ---

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function init() {
    tabId = await getTabId();
    if (tabId === null) return;
    await restoreState();
    await restorePanelState();

    // Detect page popovers entering the top layer
    document.addEventListener("toggle", (e) => {
      if (e.newState === "open"
          && !e.target.hasAttribute("data-pluckup-panel")
          && !e.target.hasAttribute("data-pluckup-overlay")) {
        repromoteToTopLayer();
      }
    }, true);

    // Detect <dialog> elements opened via showModal()
    const _dlgObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.target.tagName === "DIALOG" && m.target.hasAttribute("open")) {
          repromoteToTopLayer();
          return;
        }
      }
    });
    _dlgObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  }
  init();
})();
