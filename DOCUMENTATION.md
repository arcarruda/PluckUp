# PluckUp — User Guide

**PluckUp** is a Chrome extension that lets you select elements on any web page, annotate them with comments, and export everything as a structured AI-ready prompt you can paste into Claude Code, ChatGPT or any other AI tool.

---

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the PluckUp project folder
4. The PluckUp icon will appear in your browser toolbar

---

## Getting Started

Click the **PluckUp icon** in your browser toolbar to open the popup. From there you can:

- **Select elements** on the current page
- **View and manage** your selections
- **Export** a formatted prompt to your clipboard
- **Pin** the panel directly onto the page for hands-free use
- **Configure** your OpenAI API key for voice input

---

## Selecting Elements

1. Click the **Select Element** button in the popup (or floating panel)
2. Move your mouse over the page — elements will be highlighted with a **magenta outline** as you hover
3. Click on the element you want to capture
4. A comment overlay will appear where you can describe what you need

When selection mode is active, normal page interactions (clicking links, buttons, etc.) are paused so you can safely click on any element.

To **exit selection mode** without selecting anything, click the **Select Element** button again.

---

## Adding Comments

After clicking an element, a comment overlay appears showing the element you selected:

1. Type your comment in the text area — describe what changes you want, what's wrong, or what you'd like the AI to analyze
2. Click **Save** to confirm your selection
3. Click **Cancel** to discard it

A **numbered bubble** will appear on the selected element on the page, and the selection will be added to your list.

---

## Voice Comments

You can dictate comments using your microphone instead of typing. This feature uses OpenAI's Whisper API for transcription **with automatic translation to English** — you can speak in any language and the transcription will be translated to English.

### Prerequisites

You need an **OpenAI API key** configured in Settings (see [Settings](#settings)).

### How to Record

1. Click the **microphone icon** in the comment overlay
2. Allow microphone access when prompted by your browser
3. Speak your comment in **any language** — a timer and pulsing red dot will show while recording
4. Click **Send** to transcribe and translate your recording, or **Cancel** to discard it
5. The transcribed text (translated to English) will appear in the text area where you can review and edit it before saving

> **Note:** The translation uses OpenAI's audio translations endpoint, so your speech is always converted to English regardless of the language you speak. This is useful for multilingual teams or when you prefer to think in your native language while producing English-language prompts.

---

## Element Screenshots

You can capture a screenshot of a selected element and include it in the exported prompt. This provides visual context alongside the HTML and comment data.

### How to Capture

1. After selecting an element, the comment overlay appears with a **camera icon** next to the microphone button
2. Click the **camera icon** to capture a screenshot of the selected element
3. A "Screenshot taken" status message confirms the capture
4. The camera icon highlights to indicate a screenshot is attached

### Removing a Screenshot

- Click the **camera icon** again on an element that already has a screenshot to remove it
- The status will update to "Screenshot removed"

### How It Works

- PluckUp captures the visible browser tab and automatically crops the image to the selected element's bounding rectangle
- The screenshot is stored as a Base64-encoded PNG
- When editing an existing selection, any previously captured screenshot is preserved and can be replaced or removed

### In the Exported Prompt

Screenshots are included in the exported prompt as Base64 PNG data within a code block under each element's section. You can paste this into AI tools that support image input for visual analysis.

### Limitations

- The element must be **visible in the viewport** at the time of capture — elements scrolled out of view cannot be captured
- Very small elements may fail to capture
- The screenshot reflects the element's current appearance, including any hover states or dynamic content visible at that moment

---

## Managing Selections

Your selections appear as a numbered list in the popup or floating panel.

For each selection, you can:

- **Click the numbered badge** or **pencil icon** — edit the comment for that selection
- **Click the X button** — remove the selection from the list

At the bottom of the list:

- **Clear All** — removes all selections and clears the numbered bubbles from the page

Selections are preserved as long as you stay on the same page and tab. Navigating to a different page or closing the tab will clear them.

---

## Exporting Prompts

Once you've selected and annotated elements, click **Export Prompt** to generate a formatted markdown prompt.

### What Happens

1. A structured prompt is **copied to your clipboard**
2. All selections are **cleared automatically**
3. A confirmation message appears

### What's Included in the Prompt

The exported prompt contains:

- **Page URL** — the source page
- **For each selected element:**
  - HTML tag, ID, and CSS classes
  - Text content preview
  - HTML snippet
  - Parent element hierarchy (for context)
  - Your comment
  - Element screenshot (Base64 PNG), if captured
- **Instructions section** — a default prompt asking for analysis and suggestions

You can paste this prompt directly into Claude Code, ChatGPT, or any AI assistant for page analysis, design feedback, code review, and more.

---

## Floating Panel

Instead of using the popup, you can **pin PluckUp directly onto the page** for a more convenient workflow.

### Opening the Panel

- Click the **pin icon** in the popup header, or
- Click the PluckUp **extension icon** when no popup is open

### Using the Panel

The floating panel has the same features as the popup:

- Select elements, add comments, manage selections, and export prompts
- The panel stays visible while you interact with the page

### Moving the Panel

- **Click and drag** the panel header to reposition it anywhere on the page
- The panel remembers its position for the current session

### Closing the Panel

- Click the **X button** on the panel header
- This will close the panel and clear all current selections

---

## Settings

Access Settings by clicking the **gear icon** in the popup or floating panel header.

### OpenAI API Key

An API key is needed only for the **voice comment** feature (transcription and translation to English). All other features, including element screenshots, work without it.

1. **Enter your key** — paste your OpenAI API key (starts with `sk-`)
2. **Validate** — test if the key is valid by checking against the OpenAI API
3. **Save Key** — store the key locally in your browser (it never leaves your device except for API calls to OpenAI)
4. **Clear** — remove the stored key

The eye icon toggles key visibility in the input field.

A green checkmark indicates a valid key is saved and ready to use.

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
|---|---|---|
| `Cmd/Ctrl + Enter` | Comment overlay | Save the comment |
| `Escape` | Comment overlay | Cancel without saving |

---

## Tips & Troubleshooting

### General Tips

- You can select multiple elements before exporting — build up a comprehensive prompt with all the areas you want analyzed
- Use specific, descriptive comments to get better AI responses (e.g., "This button should be more prominent and use the primary brand color" instead of "fix this")
- The floating panel is great for longer annotation sessions since it stays on the page

### Element Not Selectable?

Some deeply nested or dynamically generated elements may be difficult to target. Try hovering carefully and watching the magenta outline to confirm the right element is highlighted before clicking.

### Voice Recording Not Working?

- Make sure you have an **OpenAI API key** saved in Settings
- Ensure your browser has **microphone permission** for the current site
- Check that your API key is valid by clicking **Validate** in Settings

### Selections Disappeared?

- Selections are tied to the current page URL and tab. Navigating away or refreshing the page will clear them
- Closing the floating panel with the X button also clears selections

### Panel Not Showing?

- Try clicking the PluckUp extension icon in the toolbar
- If the page loaded before the extension was installed, refresh the page

---

## Contact

For questions, feedback, or support, reach out at [contact@pluckup.xyz](mailto:contact@pluckup.xyz).
