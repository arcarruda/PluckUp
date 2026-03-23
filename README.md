# PluckUp

**Build structured AI prompts by selecting elements on any web page.**

PluckUp is a Chrome extension that lets you click on page elements, annotate them with comments, and export everything as a formatted markdown prompt ready for Claude Code, ChatGPT, or any AI tool.

Website: [pluckup.xyz](https://pluckup.xyz)

---

## Features

- **Point-and-click element selection** — hover to highlight, click to capture. Normal page interactions are paused during selection so you can safely target any element.
- **Comments** — type or dictate comments on each selection. Voice input uses OpenAI Whisper with automatic translation to English.
- **Element screenshots** — capture a cropped screenshot of any selected element, included as Base64 PNG in the export.
- **Floating panel** — pin the UI directly onto the page for hands-free annotation sessions. Draggable and persistent.
- **One-click export** — generates a structured markdown prompt with HTML snippets, parent hierarchy, comments, and screenshots, copied to your clipboard.
- **Dark & light themes** — adapts to your system preference.

---

## Install

1. Download the latest release or clone this repo
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `extension_app` folder
5. The PluckUp icon appears in your toolbar

---

## How It Works

1. Click the **PluckUp icon** to open the popup (or pin the floating panel onto the page)
2. Hit **Select Element** and click on any page element
3. Add a comment describing what you want — type it or use the mic for voice input
4. Repeat for as many elements as you need
5. Click **Export Prompt** — a structured markdown prompt is copied to your clipboard
6. Paste into your AI tool of choice

### Exported Prompt Format

```
# Page Analysis Request
Source: https://example.com/page

## Element 1
- Tag / ID / Classes
- Text content preview
- HTML snippet
- Parent hierarchy
- Your comment
- Screenshot (Base64 PNG, if captured)

...
```

---

## Project Structure

```
extension_app/
├── manifest.json            # Chrome MV3 manifest
├── background/
│   └── service-worker.js    # Extension lifecycle, API proxying
├── content/
│   ├── content.js           # Core logic: selection, overlays, panel, export
│   └── content.css          # Scoped styles with dark/light theme support
├── popup/
│   ├── popup.html           # Extension popup UI
│   ├── popup.js             # Popup logic, communicates with content script
│   └── popup.css            # Popup styles
├── offscreen/               # Offscreen document for clipboard/capture
├── permissions/             # Permission handling
├── icons/                   # Extension icons (16/48/128px)
└── DOCUMENTATION.md         # Full user guide
```

### Architecture

Three runtime contexts communicate via `chrome.tabs.sendMessage`:

| Context | Entry Point | Role |
|---|---|---|
| **Service Worker** | `background/service-worker.js` | Extension lifecycle, toolbar icon clicks, OpenAI API proxy |
| **Content Script** | `content/content.js` | All page-level logic: selection, overlays, bubbles, panel, export |
| **Popup** | `popup/popup.html` | Toolbar popup UI — mirrors the floating panel |

State is stored per-tab in `chrome.storage.session` and persists as long as you stay on the same page.

---

## Development

No build step — plain JavaScript, HTML, and CSS loaded directly by Chrome.

1. Load the extension as described in [Install](#install)
2. Edit the source files
3. Go to `chrome://extensions/` and click the reload button on the PluckUp card
4. Refresh the target page to pick up content script changes

---

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab for element selection and screenshots |
| `clipboardWrite` | Copy the exported prompt to clipboard |
| `scripting` | Inject content script into pages |
| `storage` | Persist selections (session) and API key (local) |
| `offscreen` | Offscreen document for capture operations |
| `https://api.openai.com/*` | Voice transcription via Whisper (optional — only if you configure an API key) |

---

## Settings

Click the **gear icon** in the popup or floating panel to configure:

- **OpenAI API Key** — required only for voice comments. Stored locally in your browser, never sent anywhere except OpenAI. Validate before saving to confirm it works.

---

## Contact

For questions, feedback, or support: [contact@pluckup.xyz](mailto:contact@pluckup.xyz)

---

## License

See repository root for license information.
