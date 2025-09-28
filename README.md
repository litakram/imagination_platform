# Imagination Platform v4

An interactive web application that transforms simple sketches into stunning artwork using AI. This platform allows users to draw directly in the browser and convert their sketches into various artistic styles through integration with powerful AI image generation APIs.

## Features

* **Interactive Drawing Canvas:** Full-screen drawing canvas with intuitive controls for a seamless sketching experience
* **Rich Drawing Tools:** 
  * Brush with adjustable size
  * Eraser tool
  * Advanced color picker
  * Undo/redo functionality
  * Canvas clearing option
* **Intelligent AI Integration:**
  * Sketch recognition that guesses what you're drawing in real-time
  * Interactive prompts that ask questions about your drawing
  * Smart prompt generation that incorporates your answers
* **Multiple Art Styles:**
  * Aquarelle (Watercolor)
  * Illustration
  * Pop Art
  * Croquis (Sketch)
  * Dessin Animé 3D (3D Cartoon)
  * Peinture à l'huile (Oil Painting)
* **Personal Prompt Customization:** Add text instructions to further customize the generated artwork
* **Important Sketches Library:** Save, load, and manage your favorite sketches
* **Responsive Design:** Works on various screen sizes and devices
* **Fallback API System:** Uses BFL AI API as a backup if the primary Fal AI service fails

## Project Structure

```
imagination_platform_v3
├── server.js              # Node/Express server handling API calls to AI services
├── package.json           # Node dependencies and scripts
├── .env                   # Environment variables (API keys)
├── public/                # Static front-end files served by Express
│   ├── index.html         # Main HTML structure
│   ├── style.css          # CSS styles for the application
│   ├── script.js          # Front-end JavaScript for interactive features
│   └── color-picker.js    # Advanced color picker implementation
└── images/                # Style reference images
    ├── 3D cat.jpg         # 3D style reference image
    ├── aquarelle cat.jpg  # Watercolor style reference image
    ├── croquis cat.jpg    # Sketch style reference image
    ├── illustration cat.jpg # Illustration style reference image
    ├── oil cat.png        # Oil painting style reference image
    └── pop art cat.jpg    # Pop art style reference image
```

## Technical Implementation

### Front-End

The front-end is built with vanilla JavaScript, HTML, and CSS, focusing on a clean and intuitive user experience. Key components include:

* **Canvas Drawing System:** Uses the HTML5 Canvas API for a responsive drawing experience
* **Style Selection Carousel:** Horizontal scrollable carousel of style options with visual previews
* **Intelligent Prompts:** Timed prompts that ask users about their sketches
* **Responsive Overlays:** Clean overlays for results and loading states

### Back-End

The Node.js/Express back-end serves as a secure proxy to multiple AI services:

* **Google Gemini API:** For sketch recognition and prompt enhancement
* **Fal AI API:** Primary image generation service using the flux-pro/kontext model
* **BFL AI API:** Backup image generation service when Fal AI is unavailable

The server includes two main API endpoints:
1. `/api/predict` - For real-time sketch recognition
2. `/api/generate` - For final artwork generation

## Setup Instructions

### Prerequisites

* Node.js (v14 or higher)
* NPM or Yarn
* API keys for Google Gemini, Fal AI, and BFL AI (optional)

### Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd imagination_platform_v3
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root with your API keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   FAL_API_KEY=your_fal_ai_api_key
   BFL_API_KEY=your_bfl_api_key
   PORT=3000
   ```

4. Start the server:
   ```
   node server.js
   ```

5. Access the application in your browser at `http://localhost:3000`

## Usage

1. Click on the start screen to begin drawing
2. Use the side toolbar to select tools, colors, and brush sizes
3. Draw your sketch on the canvas
4. Periodically, the app will ask questions about what you're drawing
5. Select a style from the bottom carousel to apply to your final image
6. Add any custom text instructions in the prompt field (optional)
7. Click "Generate" to transform your sketch into artwork
8. View your creation and click "Back" to continue drawing

## Image Path Configuration

For proper display of style images in both local development and Node.js server environments, image paths are configured as follows:

* In script.js: The style images are referenced using absolute paths from the server root: `/images/filename.jpg`
* In server.js: The images folder is explicitly served as static content:
  ```javascript
  app.use('/images', express.static(path.join(__dirname, 'images')));
  ```

## Credits

- Created by Ai Crafters
- Utilizes Google Gemini, Fal AI, and BFL AI technologies
- Cat style reference images showcasing different artistic styles

## License


All rights reserved. This project is proprietary and not available for redistribution.
