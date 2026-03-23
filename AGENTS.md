# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**PluckUp** (https://pluckup.xyz) is a Chrome Extension (Manifest V3) that lets users select elements on any web page, annotate them with comments (typed or voice-dictated), and export a structured AI prompt to the clipboard. The repo name is "Marker" but the extension is branded "PluckUp".

## Development

No build step — plain JavaScript, HTML, and CSS loaded directly by Chrome. To develop:

1. Open `chrome://extensions`, enable Developer mode
2. Click "Load unpacked" and select this project directory
3. After code changes, click the reload button on the extension card

## Architecture

### Three runtime contexts

- **Service Worker** (`background/service-worker.js`) — Handles extension lifecycle, toolbar icon clicks (injects content script + toggles panel), proxies OpenAI API calls (test key, Whisper transcription), and manages per-tab session storage cleanup.

- **Content Script** (`content/content.js` + `content/content.css`) — Injected into web pages. Contains all core logic: element selection mode (hover highlight + click capture), comment overlay with voice recording, numbered bubble markers on selected elements, floating draggable panel (mirrors popup functionality), prompt builder, and state persistence via `chrome.storage.session` keyed by tab ID.

- **Popup** (`popup/popup.html`, `popup/popup.js`, `popup/popup.css`) — Extension popup UI. Communicates with the content script via `chrome.tabs.sendMessage`. Provides selection controls, selection list, export, and API key settings. The popup and floating panel are independent UIs for the same underlying state.

### Key patterns

- **State is per-tab**: All selection data and panel state are stored in `chrome.storage.session` using keys like `pluckup-state-${tabId}` and `pluckup-panel-state-${tabId}`. State restores when the content script re-initializes.
- **Guard against re-initialization**: Content script uses `window.__pluckupInitialized` flag since it may be injected multiple times (both via manifest and programmatic injection from the service worker).
- **API key storage**: OpenAI API key is stored in `chrome.storage.local` under key `pluckup-openai-api-key`. API calls (Whisper transcription, key validation) are routed through the service worker because content scripts cannot make cross-origin requests.
- **CSS uses `!important` extensively** in `content.css` to override host page styles. All content-script elements use `data-pluckup-*` attributes for identification and CSS scoping.
- **CSS variables** are prefixed `--plk-*` with both dark and light theme support via `prefers-color-scheme`.
- **Message types** between contexts: `getTabId`, `checkApiKey`, `testApiKey`, `transcribeAudio`, `togglePanel`, `pinPanel`, `getState`, `toggleSelectionMode`, `removeSelection`, `editSelection`, `exportPrompt`, `clearAll`, `selectionUpdated`.

### Prompt output format

The exported prompt is Markdown with a `# Page Analysis Request` header, source URL, and per-element sections showing tag, ID, classes, text content, HTML snippet, parent hierarchy, and user comment.
