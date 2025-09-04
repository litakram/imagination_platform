# Imagination Platform Remake

This repository contains a full‑stack web application that lets users draw on a canvas in a mall kiosk and transform their sketches into polished artwork using AI. 

## Features

* **Interactive drawing:** Users can sketch on a full‑screen canvas.  A slide‑out toolbar on the right provides an eraser, a brush‑size slider, a colour picker, and an undo button.
* **Smart suggestions:** Every seven seconds the application captures the current drawing and asks the Gemini API to guess what is being drawn in two or three words【243548973318086†L785-L819】.  This guess is shown as a question (e.g. “Is it a dog?”) with Yes/No buttons; the user’s answer is saved for later.
* **Style carousel:** A horizontal carousel presents six art styles—Watercolour, Illustration, Pop Art, Sketch, 3D Cartoon and Oil Painting.  Selecting a style influences the final result.
* **High‑quality generation:** When the user clicks **Generate**, the server asks Gemini to describe the drawing and build a powerful prompt that includes the description, the last question and answer, and the chosen style【243548973318086†L785-L819】.  It then forwards the prompt and the drawing to Fal AI’s flux‑pro/kontext model using their official client【528599900572812†L100-L116】 to produce a polished image.
* **Modern UI:** Built with plain HTML, CSS and vanilla JavaScript, the front‑end features smooth transitions, responsive layout and on‑canvas overlays instead of separate panels.
* **Secure backend:** API keys are stored in a `.env` file and never exposed to the browser【528599900572812†L120-L133】.  The Node/Express server proxies calls to Gemini and Fal AI.

## Directory structure

```
imagination_platform_remake
├── server.js          # Express backend with two API endpoints
├── package.json       # Node dependencies and scripts
├── .env.example       # Template for environment variables
├── README.md          # This file
└── public/            # Static front‑end files served by Express
    ├── index.html     # Entry point with canvas and UI
    ├── style.css      # Modern styles for the app
    └── script.js      # Front‑end logic for drawing and API calls
```

## How it works

### Periodic prediction

Every seven seconds the front‑end captures the canvas as a base64 data URL and posts it to `/api/predict`.  The server strips the `data:image/png;base64,` prefix and passes the raw base64 string to the Gemini `generateContent` endpoint【243548973318086†L785-L819】.  Gemini replies with a short description predicting the subject of the drawing.  The UI displays this as a question with Yes/No buttons.  The user’s answer is recorded and sent along with the final request.

### Final generation

When the user presses **Generate**, the front‑end sends the final drawing, the selected style, and the last question/answer to `/api/generate`.  The backend performs two Gemini calls: first to describe the image and infer the user’s intention, and second to build a powerful image‑to‑image prompt combining the description, the user’s response and the chosen style.  This prompt and the drawing (as a data URI) are then sent to Fal AI’s flux‑pro/kontext model using the official client library【528599900572812†L100-L116】.  A data URI can be used directly as the `image_url` parameter【528599900572812†L192-L204】.  Fal AI returns a high‑resolution artwork which the UI displays to the user.

### Security and environment variables

All API keys are loaded from a `.env` file via `dotenv`.  The back‑end never exposes these keys to the front‑end【528599900572812†L120-L133】.  Instead, it proxies requests to the external services and returns only the results.  This design ensures that sensitive credentials remain on the server.

## Setup

1. Clone this repository.
2. Navigate into the project folder and install dependencies:

   ```bash
   cd imagination_platform_remake
   npm install
   ```

3. Create a `.env` file based on `.env.example` and fill in your own keys:

   ```bash
   cp .env.example .env
   # then edit .env with your favourite editor
   ```

   - **GEMINI_API_KEY** – obtain from the [Google Gemini API](https://ai.google.dev/gemini-api).  The example payload in the Gemini docs shows how to send a base64‑encoded image and text prompt in a JSON body【243548973318086†L785-L819】.
   - **FAL_API_KEY** – obtain from [fal.ai](https://fal.ai).  The Fal AI client library uses this key to authenticate requests【528599900572812†L100-L116】.
   - **PORT** – port number for the Express server (defaults to 3000).

4. Start the server:

   ```bash
   npm start
   ```

5. Open your browser at `http://localhost:<PORT>` to use the application.

## Notes

* The front‑end uses modern browser APIs such as `fetch`, `CanvasRenderingContext2D` and CSS Flexbox.  It should run in any recent Chrome, Edge or Firefox without additional plugins.
* API calls are asynchronous; the loader overlay appears while waiting for responses.
* Do not commit your `.env` file to version control.  API keys are sensitive.

By following the instructions above you can deploy a working demo of the Imagination Platform.  We hope you enjoy turning your imagination into reality!
