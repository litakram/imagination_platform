/**
 * Imagination Platform Server
 * ==============================================
 * 
 * This server provides a dual-screen interactive drawing experience with AI-powered
 * image generation. The system integrates multiple AI services for a complete
 * sketch-to-image and text-to-image generation pipeline.
 * 
 * WORKFLOW STAGES:
 * ---------------
 * 1. Sketch Prediction (Gemini API)
 *    - Analyzes user sketch to predict what it represents
 *    - Returns a brief 2-3 word description in French
 * 
 * 2. Enhanced Description & Prompt Generation (Gemini API)
 *    - Generates detailed visual description based on sketch
 *    - Creates optimized prompt for image generation systems
 *    - Incorporates user-specified style and personal prompts
 * 
 * 3. Primary Image Generation (BFL AI)
 *    - Uses Black Forest Labs AI for high-quality image generation
 *    - Supports both image-to-image and text-to-image generation
 * 
 * 4. Fallback Image Generation (Fal AI)
 *    - Used if BFL AI fails or times out (40 seconds max wait)
 *    - Provides alternative image generation using Kontext model
 * 
 * 5. Text-Only Image Generation (Fal AI Stable Diffusion)
 *    - Used when no sketch is provided, only text prompt
 *    - Generates images from scratch using Stable Diffusion
 */

// Import required dependencies
const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');
let uuidv4;

// Load environment variables from .env file
require('dotenv').config();

// Import and configure Fal AI client for the fallback image generation
const { fal } = require('@fal-ai/client');

// Configure Fal AI with credentials from the environment
fal.config({
  credentials: process.env.FAL_API_KEY || '',
});

// Extract the subscribe function for easier access
const { subscribe } = fal;

/**
 * Express and WebSocket Server Setup
 * Creates a dual-interface application with:
 * - Web server for handling HTTP requests
 * - WebSocket server for real-time synchronization between screens
 */
const app = express();
const server = http.createServer(app);

// Store connected WebSocket clients by type
const clients = {
  controllers: [], // index2.html clients (21" screens control interface)
  displays: []     // index.html clients (vertical display screens for output)
};

// Create WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data);

      switch (data.type) {
        case 'register_controller':
          // Register as controller (index2.html)
          clients.controllers.push(ws);
          ws.clientType = 'controller';
          console.log(`Controller registered. Total controllers: ${clients.controllers.length}`);
          break;

        case 'register_display':
          // Register as display (index.html)
          clients.displays.push(ws);
          ws.clientType = 'display';
          console.log(`Display registered. Total displays: ${clients.displays.length}`);
          break;

        case 'controller_action':
          // Forward controller actions to all displays
          console.log('Broadcasting controller action to displays:', data.action);
          broadcastToDisplays({
            type: 'sync_action',
            action: data.action,
            payload: data.payload || {}
          });
          break;

        case 'page_change':
          // Handle page navigation
          console.log('Broadcasting page change to displays:', data.page);
          broadcastToDisplays({
            type: 'sync_page_change',
            page: data.page,
            payload: data.payload || {}
          });
          break;

        case 'app_start':
          // Handle application start
          console.log('Broadcasting app start to displays');
          broadcastToDisplays({
            type: 'sync_app_start',
            payload: data.payload || {}
          });
          break;

        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    
    // Remove from appropriate client list
    if (ws.clientType === 'controller') {
      clients.controllers = clients.controllers.filter(client => client !== ws);
      console.log(`Controller disconnected. Remaining controllers: ${clients.controllers.length}`);
    } else if (ws.clientType === 'display') {
      clients.displays = clients.displays.filter(client => client !== ws);
      console.log(`Display disconnected. Remaining displays: ${clients.displays.length}`);
    }
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket connection successful'
  }));
});

// Function to broadcast messages to all display clients
function broadcastToDisplays(message) {
  clients.displays.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Function to broadcast messages to all controller clients
function broadcastToControllers(message) {
  clients.controllers.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

/**
 * Express Middleware and Static File Configuration
 */
// Increase JSON payload limit to handle large base64 encoded images (up to 15MB)
app.use(express.json({ limit: '15mb' }));

// Serve static web assets from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Make the images folder available for reference by the client
app.use('/images', express.static(path.join(__dirname, 'images')));

/**
 * Web Routes
 */
// Main entry point - serves the display screen (index.html)
// Note: index.html automatically opens index2.html (controller) in a new window
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Optional: Add a manual route to open both screens
app.get('/dual-screen', (req, res) => {
  const dualScreenHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dual Screen Launcher</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px; 
          background: linear-gradient(135deg, #EDBF0D, #FDE484);
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        button {
          background: linear-gradient(135deg, #7460C4 0%, #381978 100%);
          color: white;
          border: none;
          padding: 15px 30px;
          font-size: 18px;
          border-radius: 8px;
          cursor: pointer;
          margin: 10px;
        }
        button:hover { transform: translateY(-2px); }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎨 Imagination Platform - Dual Screen Setup</h1>
        <p>Click the button below to launch both screens:</p>
        <button onclick="openDualScreen()">🚀 Launch Dual Screen Mode</button>
        <p><small>Or visit <a href="/">the main page</a> for automatic setup</small></p>
      </div>
      
      <script>
        function openDualScreen() {
          // Open display screen in current tab
          window.location.href = '/';
          // The display screen will automatically open the controller
        }
      </script>
    </body>
    </html>
  `;
  res.send(dualScreenHTML);
});

/**
 * STEP 1: Sketch Prediction API
 * 
 * POST /api/predict
 *
 * This endpoint analyzes a sketch and provides a brief description (2-3 words).
 * 
 * Request:
 * - image: Base64 encoded PNG data URL of the sketch
 * - previousPrediction (optional): Previous guess to avoid repetition
 * - userResponse (optional): User's response to previous prediction
 * 
 * Response:
 * - guess: 2-3 word French description of the sketch
 * - ethics: 1 if content is appropriate, 0 if inappropriate/censored
 * - error: Error message if the prediction fails
 */
app.post('/api/predict', async (req, res) => {
  try {
    // Extract parameters from request
    const { image, previousPrediction, userResponse } = req.body;
    
    // Validate input
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    // Clean the base64 data by removing the data URL prefix
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');

    // Build the JSON-formatted prompt for Gemini based on context
    let prompt = `Analysez ce croquis et retournez UNIQUEMENT un objet JSON valide avec cette structure exacte:
{
  "prediction": "2-3 mots français décrivant le croquis",
  "ethics": 1
}

CONTENU CENSURÉ (ethics = 0):
- Pays et drapeaux (France, USA, Allemagne, etc.)
- Politique (politiciens, partis, élections, etc.)
- Sang et violence (blessures, armes, combats)
- Contenu sexuel ou romantique (baisers, câlins intimes)
- Drogues et substances (cigarettes, alcool, pilules)
- Symboles haineux ou religieux controversés
- Contenu mature ou inapproprié

CONTENU AUTORISÉ (ethics = 1):
- Croquis incomplets (juste une tête, un bras, etc.) - DÉCRIVEZ CE QUE VOUS VOYEZ
- Animaux, objets, nature, nourriture
- Personnages neutres et innocents
- Véhicules, bâtiments, formes géométriques

Règles importantes:
- prediction: Décrivez en 2-3 mots français simples ce que vous voyez réellement dans le croquis
- Si le croquis est incomplet, décrivez la partie visible (ex: "tête", "bras", "forme ronde")
- Ne dites jamais "croquis incomplet" - décrivez toujours ce qui est visible
- ethics: Mettez 0 si le contenu fait partie de la liste censurée, sinon 1
- Retournez UNIQUEMENT le JSON, aucun autre texte, aucune explication

Exemples de réponses valides:
{"prediction": "chat mignon", "ethics": 1}
{"prediction": "tête humaine", "ethics": 1}
{"prediction": "contenu censuré", "ethics": 0}`;
    
    // Adapt prompt based on previous interactions
    if (previousPrediction && userResponse) {
      // If we have both a previous prediction and user response
      prompt = `Analysez ce croquis et retournez UNIQUEMENT un objet JSON valide avec cette structure exacte:
{
  "prediction": "2-3 mots français décrivant le croquis",
  "ethics": 1
}

CONTENU CENSURÉ (ethics = 0):
- Pays et drapeaux (France, USA, Allemagne, etc.)
- Politique (politiciens, partis, élections, etc.)
- Sang et violence (blessures, armes, combats)
- Contenu sexuel ou romantique (baisers, câlins intimes)
- Drogues et substances (cigarettes, alcool, pilules)
- Symboles haineux ou religieux controversés
- Contenu mature ou inapproprié

CONTENU AUTORISÉ (ethics = 1):
- Croquis incomplets (juste une tête, un bras, etc.) - DÉCRIVEZ CE QUE VOUS VOYEZ
- Animaux, objets, nature, nourriture
- Personnages neutres et innocents
- Véhicules, bâtiments, formes géométriques

Règles importantes:
- prediction: Décrivez en 2-3 mots français simples ce que vous voyez réellement dans le croquis
- Si le croquis est incomplet, décrivez la partie visible (ex: "tête", "bras", "forme ronde")
- Ne dites jamais "croquis incomplet" - décrivez toujours ce qui est visible
- ethics: Mettez 0 si le contenu fait partie de la liste censurée, sinon 1
- Ne répétez pas la supposition précédente: "${previousPrediction}"
- L'utilisateur a répondu: "${userResponse}" - utilisez cette information pour affiner
- Retournez UNIQUEMENT le JSON, aucun autre texte, aucune explication

Exemples de réponses valides:
{"prediction": "chat mignon", "ethics": 1}
{"prediction": "tête humaine", "ethics": 1}
{"prediction": "contenu censuré", "ethics": 0}`;
    } else if (previousPrediction) {
      // If we only have a previous prediction
      prompt = `Analysez ce croquis et retournez UNIQUEMENT un objet JSON valide avec cette structure exacte:
{
  "prediction": "2-3 mots français décrivant le croquis",
  "ethics": 1
}

CONTENU CENSURÉ (ethics = 0):
- Pays et drapeaux (France, USA, Allemagne, etc.)
- Politique (politiciens, partis, élections, etc.)
- Sang et violence (blessures, armes, combats)
- Contenu sexuel ou romantique (baisers, câlins intimes)
- Drogues et substances (cigarettes, alcool, pilules)
- Symboles haineux ou religieux controversés
- Contenu mature ou inapproprié

CONTENU AUTORISÉ (ethics = 1):
- Croquis incomplets (juste une tête, un bras, etc.) - DÉCRIVEZ CE QUE VOUS VOYEZ
- Animaux, objets, nature, nourriture
- Personnages neutres et innocents
- Véhicules, bâtiments, formes géométriques

Règles importantes:
- prediction: Décrivez en 2-3 mots français simples ce que vous voyez réellement dans le croquis
- Si le croquis est incomplet, décrivez la partie visible (ex: "tête", "bras", "forme ronde")
- Ne dites jamais "croquis incomplet" - décrivez toujours ce qui est visible
- ethics: Mettez 0 si le contenu fait partie de la liste censurée, sinon 1
- Ne répétez pas la supposition précédente: "${previousPrediction}"
- Rendez votre nouvelle supposition plus précise et différente
- Retournez UNIQUEMENT le JSON, aucun autre texte, aucune explication

Exemples de réponses valides:
{"prediction": "chat mignon", "ethics": 1}
{"prediction": "tête humaine", "ethics": 1}
{"prediction": "contenu censuré", "ethics": 0}`;
    }

    // Prepare the request body for Gemini API
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/png',
                data: base64,
              },
            },
          ],
        },
      ],
    };
    
    // Get API key and construct Gemini API URL
    const apiKey = process.env.GEMINI_API_KEY;
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
      '?key=' + apiKey;
    
    // Call Gemini API to analyze the sketch
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    // Parse the response
    const data = await response.json();
    let guess = '';
    let ethics = 1; // Default to appropriate content
    
    // Extract the prediction if available
    if (data && Array.isArray(data.candidates) && data.candidates[0]?.content?.parts?.length) {
      const rawResponse = data.candidates[0].content.parts.map((p) => p.text).join(' ').trim();
      
      try {
        // Try to parse as JSON
        const jsonResponse = JSON.parse(rawResponse);
        
        if (jsonResponse.prediction && typeof jsonResponse.ethics === 'number') {
          guess = jsonResponse.prediction.trim();
          ethics = jsonResponse.ethics;
          console.log('✓ STEP 1: Successfully parsed JSON response', { guess, ethics });
        } else {
          // Fallback if JSON structure is incorrect - force appropriate fallback
          console.warn('⚠️ STEP 1: Invalid JSON structure, using safe fallback');
           guess = "croquis incomplet";
          ethics = 1; // Default to safe content
        }
      } catch (jsonError) {
        // Fallback if not valid JSON - prevent raw JSON from being shown
        console.warn('⚠️ STEP 1: Failed to parse JSON, using safe fallback');
        
        // Check if it looks like inappropriate content
        const lowerResponse = rawResponse.toLowerCase();
        if (lowerResponse.includes('censuré') || 
            lowerResponse.includes('inapproprié') ||
            lowerResponse.includes('politique') ||
            lowerResponse.includes('sang') ||
            lowerResponse.includes('baiser') ||
            lowerResponse.includes('drapeau') ||
            lowerResponse.includes('pays')) {
          guess = "contenu censuré";
          ethics = 0;
        } else {
          // Safe fallback for any parsing issues
          guess = "croquis incomplet";
          ethics = 1;
        }
      }
    }
    
    // Return the prediction with ethics flag to the client
    res.json({ 
      guess,
      ethics 
    });
  } catch (err) {
    // Handle errors
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Prediction failed' });
  }
});

/**
 * STEP 2-5: Complete Image Generation Pipeline
 * 
 * POST /api/generate
 *
 * This endpoint handles the full image generation workflow:
 * 1. Accepts sketch or text prompt with style preferences
 * 2. Uses Gemini to generate an enhanced description and prompt (STEP 2)
 * 3. Attempts to generate image with BFL AI (STEP 3)
 * 4. Falls back to Fal AI if BFL fails (STEP 4)
 * 5. Uses text-to-image if no sketch is provided (STEP 5)
 * 
 * Request:
 * - image (optional): Base64 data URL of the sketch
 * - style (optional): Desired artistic style
 * - question (optional): Last question from prediction
 * - answer (optional): User's answer to prediction
 * - personalPrompt (optional): User's text prompt
 * 
 * Response:
 * - image: URL to the generated image
 * - description: Brief description of the image
 * - prompt: The enhanced prompt used for generation
 * - fallback: Whether the fallback service was used
 * - fallbackType: Which service was used (BFL or Fal)
 */
app.post('/api/generate', async (req, res) => {
  try {
    // Extract all parameters from request
    const { image, style, question, answer, personalPrompt } = req.body;
    
    // Validate input - need at least an image or text prompt
    if (!image && !personalPrompt) {
      return res.status(400).json({ error: 'No image or prompt provided' });
    }
    
    // Prepare image data and Gemini API configuration
    const base64 = image ? image.replace(/^data:image\/\w+;base64,/, '') : '';
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
      '?key=' + apiKey;

    // STEP 2: Gemini Call for Enhanced Description and Prompt
    // --------------------------------------------------------
    
    // Get context from previous prediction if available
    const q = question || '';
    const a = answer || '';
    
    // Emphasize style by marking it as IMPORTANT and placing it first
    const styleFragment = style ? 
      `IMPORTANT: L'image doit être générée dans le style spécifique "${style}". ` : '';

    // Format user's personal prompt as additional context
    const userPromptFragment = personalPrompt ? 
      `L'utilisateur a fourni cette instruction spécifique: "${personalPrompt}". ` : '';

    // Combine with style emphasized first for priority
    const combinedUserInput = `${styleFragment}${userPromptFragment}`;
    
    const combinedPrompt =
      `Vous êtes un expert en interprétation visuelle et en création de descriptions immersives pour l'IA artistique. Analysez attentivement l’image fournie et déduisez les sujets principaux, leurs positions, proportions, perspective et intention générale. Imaginez des couleurs réalistes, des matériaux, des textures, un éclairage cohérent et un arrière-plan crédible afin de transformer la scène en une représentation professionnelle et immersive. Ne mentionnez pas l’existence de l’image ou du croquis, ni d’instructions techniques. Retournez UNIQUEMENT un paragraphe en français entre <<<BEGIN_PROMPT>>> et <<<END_PROMPT>>>. Maximum 1000 caractères. Le texte doit être descriptif, fluide et exploitable tel quel par un modèle de diffusion image-à-image ou text-à-image.

Tâche :
1) Intégrez l’analyse visuelle pour enrichir les détails (matériaux, lumière, ambiance, environnement) tout en respectant la structure et les relations de la scène.
2) Ajoutez la dimension d’intention : la dernière question posée à l’utilisateur était "${q}" et la réponse était "${a}".
3) Fusionnez cela avec ${combinedUserInput}, qui précise le style ou l’ambiance souhaitée.

Format attendu :
<<<BEGIN_PROMPT>>>
{paragraphe final en français}
<<<END_PROMPT>>>`;
    // Prepare the Gemini API request with both text prompt and image
    const body = {
      contents: [
        {
          parts: [
            { text: combinedPrompt },
            // Include the image in the request if provided
            ...(base64 ? [{
              inline_data: {
                mime_type: 'image/png',
                data: base64,
              },
            }] : []),
          ],
        },
      ],
    };
    // Log details of the Gemini request for debugging
    console.log('STEP 2: Sending sketch and context to Gemini for prompt refinement');
    console.log('   - Style specified:', style || 'none');
    console.log('   - Personal prompt:', personalPrompt || 'none');
    console.log('   - Combined input:', combinedUserInput);
    // Make the API call to Gemini for prompt enhancement
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    // Parse the response from Gemini
    const geminiJson = await geminiRes.json();
    
    // Initialize variables to store the enhanced description and prompt
    let description = '';
    let finalPrompt = '';
    
    // Extract the enhanced description and prompt if available
    if (geminiJson && Array.isArray(geminiJson.candidates) && geminiJson.candidates[0]?.content?.parts?.length) {
      // Combine all text parts from the response
      const combinedText = geminiJson.candidates[0].content.parts.map((p) => p.text).join('\n').trim();
      
      // Log the response for debugging
      console.log('Gemini response received with length:', combinedText.length);
      console.log('Gemini response preview:', combinedText.substring(0, 100) + '...');
      
      // Process the response to extract description and prompt
      // Format expected is a multi-line response with description and prompt sections
      const [desc, ...promptLines] = combinedText.split('\n');
      description = desc.trim();
      finalPrompt = promptLines.join(' ').trim();
      
      console.log('✓ STEP 2: Successfully generated enhanced description and prompt');
    } else {
      console.warn('⚠️ STEP 2: Gemini response missing or invalid, using fallback prompt');
    }

    // STEP 3: Primary Image Generation with BFL AI
    // --------------------------------------------------------
    // Attempt to generate an image with BFL AI as the primary service
    // Will automatically fall back to Fal AI if BFL fails or times out
    
    /**
     * Primary Image Generation Service - BFL AI
     * 
     * This function handles the primary image generation using Black Forest Labs AI API.
     * It supports both text-to-image and image-to-image generation modes.
     * 
     * @param {string} prompt - The text prompt to guide image generation
     * @param {object} options - Configuration options including width, height, and seedImage
     * @returns {Promise<string>} - URL of the generated image
     */
    async function generateImageWithBFL(prompt, options = {}) {
      const axios = require("axios");
      const apiKey = process.env.BFL_API_KEY;
      
      if (!apiKey) {
        throw new Error('Missing BFL API key');
      }
      
      const {
        width = 768,
        height = 768,
        seedImage,
        strength = 0.8,
      } = options;
      
      try {
        console.log('Generating image with BFL AI...');
        
        // Préparer la requête pour l'API BFL
        let requestData = {
          prompt: prompt,
        };
        
        console.log('BFL prompt length:', prompt ? prompt.length : 0, 'chars');
        
        // Si une image source est fournie, l'ajouter à la requête
        if (seedImage) {
          // Pour BFL API, nous devons extraire uniquement la partie base64 (sans le préfixe dataURI)
          if (seedImage.startsWith('data:')) {
            // Si c'est un dataURI, extraire uniquement la partie base64
            requestData.input_image = seedImage.replace(/^data:image\/\w+;base64,/, '');
          } else {
            // Si c'est déjà du base64 pur, l'utiliser tel quel
            requestData.input_image = seedImage;
          }
          console.log('Using input image with BFL AI');
          // Afficher le début de l'image et sa longueur
          console.log('Image length:', requestData.input_image.length, 
                     'Preview:', requestData.input_image.substring(0, 20) + '...');
        }
        
        // Effectuer la requête initiale pour démarrer la génération
        const response = await axios.post(
          "https://api.bfl.ai/v1/flux-kontext-pro",
          requestData,
          {
            headers: {
              accept: "application/json",
              "x-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );
        
        console.log("BFL initial response received, polling for results...");
        
        // Extraire l'URL de polling pour suivre l'avancement
        const pollingUrl = response.data.polling_url;
        const requestId = response.data.id;
        
        if (!pollingUrl) {
          throw new Error('No polling URL returned from BFL API');
        }
        
        // Attendre que le résultat soit prêt (avec un timeout de 10 secondes)
        let resultUrl = null;
        let attempts = 0;
        const maxAttempts = 5; // 5 tentatives avec 2 secondes d'attente = 10 secondes max
        
        while (attempts < maxAttempts) {
          // Attendre 2 secondes entre chaque tentative
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          
          // Vérifier l'état de la génération
          const statusResponse = await axios.get(pollingUrl, {
            headers: {
              accept: "application/json",
              "x-key": apiKey
            }
          });
          
          const status = statusResponse.data.status;
          
          // Vérifier les différents états possibles
          console.log(`BFL status: ${status}, attempt ${attempts}/${maxAttempts}`);
          
          // Si la génération est terminée avec succès (COMPLETED ou Ready)
          if (status === "COMPLETED" || status === "Ready") {
            // Inspecter la réponse complète pour trouver l'URL de l'image
            console.log("BFL full response:", JSON.stringify(statusResponse.data, null, 2));

            // Vérifier si l'URL est dans le champ "sample" du résultat (format BFL observé)
            if (statusResponse.data.result && statusResponse.data.result.sample) {
              resultUrl = statusResponse.data.result.sample;
              console.log(`BFL image found at result.sample: ${resultUrl}`);
              break;
            }
            // Essayer d'autres chemins possibles
            else if (statusResponse.data.output && statusResponse.data.output.image) {
              resultUrl = statusResponse.data.output.image;
              console.log(`BFL image found at output.image: ${resultUrl}`);
              break;
            } 
            else if (statusResponse.data.image) {
              resultUrl = statusResponse.data.image;
              console.log(`BFL image found at root.image: ${resultUrl}`);
              break;
            }
            else if (statusResponse.data.output) {
              resultUrl = statusResponse.data.output;
              console.log(`BFL using output as image URL: ${resultUrl}`);
              break;
            }
            
            // Si le statut est "Ready", considérons que l'image est prête à la première tentative
            if (status === "Ready") {
              // D'après la capture d'écran, l'image est déjà prête dès le premier "Ready"
              // mais nous ne la trouvons pas dans la réponse - demandons une nouvelle fois
              console.log("Status is Ready but no image URL found yet. Continuing...");
            }
          }
          // Si la génération a échoué
          else if (status === "FAILED") {
            throw new Error(`BFL image generation failed: ${statusResponse.data.error || "Unknown error"}`);
          }
        }
        
        if (!resultUrl) {
          console.error(`BFL image generation timed out after ${maxAttempts} attempts (${maxAttempts * 2} seconds)`);
          throw new Error(`BFL image generation timed out after ${maxAttempts} attempts (${maxAttempts * 2} seconds)`);
        }
        
        // Vérifier si l'URL de l'image semble valide
        if (!resultUrl.startsWith('http')) {
          console.warn(`BFL returned potentially invalid image URL: ${resultUrl}. Proceeding anyway.`);
        }
        
        console.log(`BFL final image URL: ${resultUrl}`);
        return resultUrl;
      } catch (error) {
        console.error("BFL API error:", error.response?.data || error.message);
        
        // Fournir plus de détails sur l'erreur
        let errorMessage = error.message;
        if (error.response && error.response.data) {
          try {
            const errorData = error.response.data;
            if (typeof errorData === 'string') {
              errorMessage += ` - ${errorData}`;
            } else if (errorData.error) {
              errorMessage += ` - ${errorData.error}`;
            } else {
              errorMessage += ` - ${JSON.stringify(errorData)}`;
            }
          } catch (e) {
            console.error('Erreur lors du traitement des détails de l\'erreur:', e);
          }
        }
        
        throw new Error(`BFL API error: ${errorMessage}`);
      }
    }
    
    const dataUri = image;  // Store the image for use in both services
    let resultImage;        // Will store the final generated image URL
    let bflError = null;    // Track any BFL errors for logging
    let usedFallback = false;  // Flag to indicate if fallback was used
    
    // Prepare the best available prompt for both image generation services
    // Priority: 1) Enhanced prompt from Gemini, 2) Description, 3) User's personal prompt, 4) Default
    const promptToUse = finalPrompt || description || personalPrompt || 'Une image détaillée et belle';

    // Decide on the generation path based on whether an image is provided
    if (!dataUri) {
      // STEP 5: Direct text-to-image generation when no sketch is provided
      // ------------------------------------------------------------------
      console.log('STEP 5: No image provided, using direct text-to-image generation with Fal AI Stable Diffusion');
      
      try {
        // Verify Fal AI API key availability
        if (!process.env.FAL_API_KEY) {
          console.error('FAL_API_KEY is missing in environment variables');
          throw new Error('Missing Fal AI API key');
        }
        
        // Log request details for debugging
        console.log('Fal AI Text-to-Image Input:', {
          prompt: promptToUse.substring(0, 100) + '...',
          promptLength: promptToUse.length,
          style: style || 'none'
        });
        
        // Text-to-image generation with stable-diffusion model
        const falResult = await subscribe('fal-ai/stable-diffusion-xl-lightning', {
          input: {
            prompt: promptToUse,
            // Comprehensive negative prompt to avoid common generation issues
            negative_prompt: "deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blurry, watermark, watermarked, oversaturated, censored, distorted, deeply detailed, poorly drawn, low quality, draft, out of frame, cut off, poorly framed",
            width: 768,
            height: 768,
            num_images: 1
          },
          sync_mode: true,
          logs: true,
        });
        
        // Log response details
        console.log('Fal AI text-to-image response received:', 
                    falResult ? 'Success' : 'Empty response',
                    falResult?.images ? `with ${falResult.images.length} images` : 'without images');
        
        // Extract image URL from response (handling different response formats)
        if (falResult?.images && falResult.images.length > 0) {
          console.log('Using image URL from falResult.images[0].url');
          resultImage = falResult.images[0].url;
          usedFallback = true; // Mark as using Fal AI
        } else if (falResult?.data?.images && falResult.data.images.length > 0) {
          console.log('Using image URL from falResult.data.images[0].url');
          resultImage = falResult.data.images[0].url;
          usedFallback = true;
        } else if (falResult?.output) {
          console.log('Using image URL from falResult.output');
          resultImage = falResult.output;
          usedFallback = true;
        } else {
          // Log the full response for debugging if no image found
          console.error('No image URL found in Fal AI text-to-image response:', JSON.stringify(falResult, null, 2));
          throw new Error('No image returned from Fal AI text-to-image generation');
        }
        
        console.log('✓ STEP 5: Successfully generated image with Fal AI Stable Diffusion (text-to-image)');
        
      } catch (falErr) {
        console.error('✗ STEP 5: Fal AI text-to-image error:', falErr);
        return res.status(500).json({ error: 'Text-to-image generation failed' });
      }
    } else {
      // STEPS 3-4: Image-to-image generation workflow (when sketch is provided)
      // ------------------------------------------------------------------------

    // Create a promise that attempts BFL image generation with a timeout
    const bflPromise = (async () => {
      try {
        console.log('STEP 3: Attempting to generate image with BFL AI (primary service)...');
        
        // Verify API key availability
        if (!process.env.BFL_API_KEY) {
          console.error('BFL_API_KEY is missing in environment variables');
          throw new Error('Missing BFL AI API key');
        }
        
        // Log request details for debugging
        console.log('BFL AI Input:', {
          prompt: promptToUse.substring(0, 100) + '...',
          imageProvided: !!dataUri,
          promptLength: promptToUse.length
        });
        
        // Configure BFL API parameters
        const options = {
          width: 768,    // Standard resolution
          height: 768,
          strength: 0.8  // Balance between input image and prompt (higher = more prompt influence)
        };
        
        // Handle image-to-image mode if sketch is provided
        if (dataUri) {
          // BFL requires base64 without the data URI prefix
          if (dataUri.startsWith('data:')) {
            options.seedImage = dataUri.replace(/^data:image\/\w+;base64,/, '');
            console.log("Providing sketch to BFL (base64 format), length:", options.seedImage.length);
          } else {
            options.seedImage = dataUri;
            console.log("Providing sketch to BFL (raw format), length:", dataUri.length);
          }
        }
        
        // Call BFL AI service
        const bflResult = await generateImageWithBFL(promptToUse, options);
        console.log('BFL AI generation successful:', !!bflResult);
        return bflResult;
      } catch (e) {
        // Record error for fallback decision
        console.error('BFL AI generation error:', e.message);
        bflError = e;
        return null;
      }
    })();
    
    // Create a timeout promise to ensure BFL doesn't block the process
    function timeoutPromise(ms) {
      return new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), ms));
    }
    
    // Race the BFL generation against a timeout (40 second maximum wait)
    let bflResult = await Promise.race([bflPromise, timeoutPromise(40000)]);
    
    // STEP 3 (success path): Use BFL result if available
    if (bflResult && bflResult !== 'TIMEOUT') {
      console.log('✓ STEP 3: Successfully generated image with BFL AI (primary service)');
      resultImage = bflResult;
    } 
    // STEP 4: Fallback to Fal AI if BFL fails or times out
    // -------------------------------------------------------------
    else {
      // Log the specific reason for fallback
      console.error('✗ STEP 3: BFL AI failed:', bflResult === 'TIMEOUT' ? 
        'Request timed out after 40 seconds' : 
        (bflError ? bflError.message : 'Unknown error'));
      
      // Set fallback flag and proceed with Fal AI
      usedFallback = true;
      console.log('STEP 4: Initiating fallback to Fal AI...');
      
      try {
        // Verify Fal AI API key availability
        if (!process.env.FAL_API_KEY) {
          console.error('FAL_API_KEY is missing in environment variables');
          throw new Error('Missing Fal AI API key');
        }
        
        // Log request details for debugging
        console.log('Fal AI Input:', {
          prompt: promptToUse.substring(0, 100) + '...',
          imageProvided: !!dataUri,
          promptLength: promptToUse.length
        });
        
        // Image-to-image generation with kontext model (since we have a sketch)
        console.log('STEP 4: Using Fal AI Kontext for image-to-image generation (fallback)');
        const falResult = await subscribe('fal-ai/flux-pro/kontext', {
          input: {
            prompt: promptToUse,
            image_url: dataUri,  // Pass the full dataURI (Fal AI handles this format)
          },
          sync_mode: true,  // Wait for completion
          logs: true,       // Enable logs for debugging
        });
        
        // Log response details
        console.log('Fal AI response received:', 
                    falResult ? 'Success' : 'Empty response',
                    falResult?.images ? `with ${falResult.images.length} images` : 'without images');
        
        // Extract image URL from response (handling different response formats)
        if (falResult?.images && falResult.images.length > 0) {
          console.log('Using image URL from falResult.images[0].url');
          resultImage = falResult.images[0].url;
        } else if (falResult?.data?.images && falResult.data.images.length > 0) {
          console.log('Using image URL from falResult.data.images[0].url');
          resultImage = falResult.data.images[0].url;
        } else if (falResult?.output) {
          console.log('Using image URL from falResult.output');
          resultImage = falResult.output;
        } else {
          // Log the full response for debugging if no image found
          console.error('No image URL found in Fal AI response:', JSON.stringify(falResult, null, 2));
          throw new Error('No image returned from Fal AI');
        }
        
        console.log('✓ STEP 4: Successfully generated image with Fal AI (image-to-image fallback)');
        
      } catch (falErr) {
        // Handle case where both services fail
        console.error('✗ STEP 4: Fal AI error:', falErr);
        return res.status(500).json({ error: 'Both BFL AI and Fal AI failed' });
      }
    }
    } // End of image-to-image workflow (else block)
    
    // Return the complete generation results to the client
    res.json({ 
      description,                               // The detailed description from Gemini
      prompt: finalPrompt || description,        // The optimized prompt used for generation
      image: resultImage,                        // URL to the generated image
      fallback: usedFallback,                    // Flag indicating whether fallback was used
      fallbackType: usedFallback ? 'Fal AI' : 'BFL AI'  // Which service generated the final image
    });
    
    // Log completion of the entire generation workflow
    console.log('✓ Image generation workflow complete, returning results to client');
    console.log('  - Image generated by:', usedFallback ? 'Fal AI (fallback)' : 'BFL AI (primary)');
    console.log('  - Generation mode:', dataUri ? 'image-to-image' : 'text-to-image');
    
  } catch (err) {
    // Handle any uncaught errors in the generation process
    console.error('Generate endpoint error:', err);
    res.status(500).json({ error: 'Image generation failed' });
  }
});

/**
 * Server Startup
 * 
 * Initializes the HTTP and WebSocket servers on the configured port
 * Provides detailed startup information in the console
 */
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('\n=== IMAGINATION PLATFORM SERVER ===');
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log('\n📡 WEBSOCKET SERVICES:');
  console.log('   - Dual-screen synchronization active');
  console.log('   - Controllers (index2.html): Interactive control screens');
  console.log('   - Displays (index.html): Synchronized display screens');
  
  console.log('\n🎨 API ENDPOINTS:');
  console.log('   - POST /api/predict: STEP 1 - Sketch prediction (Gemini)');
  console.log('   - POST /api/generate: STEPS 2-5 - Complete image generation workflow');
  
  console.log('\n� WORKFLOW STAGES:');
  console.log('   1. Sketch prediction using Gemini');
  console.log('   2. Rich prompt generation using Gemini');
  console.log('   3. Primary image generation using BFL AI');
  console.log('   4. Fallback image generation using Fal AI (if needed)');
  console.log('   5. Text-only image generation using Stable Diffusion (if no sketch)');
  
  console.log('\n✅ Server initialization complete');
});

/**
 * Graceful Shutdown Handling
 * 
 * Ensures clean shutdown of WebSocket and HTTP servers on process termination
 * Can be triggered by Ctrl+C (SIGINT) or taskkill command on Windows
 */
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down Imagination Platform server...');
  
  // First close WebSocket server to stop ongoing communications
  wss.close(() => {
    console.log('   - WebSocket server closed');
    
    // Then close HTTP server to stop accepting new requests
    server.close(() => {
      console.log('   - HTTP server closed');
      console.log('✅ Server shutdown complete');
      
      // Exit with success code
      process.exit(0);
    });
  });
  
  // Safety timeout - force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
});
