const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
let uuidv4;
// Import the fal namespace from the client. According to the fal.ai
// documentation the client exports an object with a `fal` property,
// which in turn exposes the `config` and `subscribe` methods.  See
// Quickstart for details【133512691428894†L100-L117】.
const { fal } = require('@fal-ai/client');
require('dotenv').config();

// Configure the Fal AI client with credentials from the environment.
// The `fal` namespace exposes a `config` method that must be called
// before subscribing to any model【133512691428894†L100-L117】.
fal.config({
  credentials: process.env.FAL_API_KEY || '',
});

// Destructure subscribe from the configured fal namespace
const { subscribe } = fal;

const app = express();

// Helper: Runware fallback
async function generateImageWithRunware(prompt, options = {}) {
  if (!uuidv4) {
    // Dynamically import uuid for ESM compatibility
    const uuidModule = await import('uuid');
    uuidv4 = uuidModule.v4;
  }
  let apiKey = process.env.RUNWARE_API_KEY;
  if (!apiKey && process.env.RUNWAY_API_KEY) {
    // fallback for typo in .env
    apiKey = process.env.RUNWAY_API_KEY;
    console.warn('Warning: Using RUNWAY_API_KEY from .env, please rename to RUNWARE_API_KEY');
  }
  const {
    model = 'runware:101@1',
    width = 512,
    height = 512,
    seedImage,
    strength = 0.8,
    steps = 25,
    CFGScale = 7.5,
  } = options;
  if (!apiKey) throw new Error('Missing Runware API key');
  const task = {
    taskType: 'imageInference',
    taskUUID: uuidv4(),
    outputType: 'URL',
    outputFormat: 'JPG',
    positivePrompt: prompt,
    model,
    width,
    height,
    steps,
    CFGScale,
  };
  if (seedImage) {
    task.seedImage = seedImage;
    task.strength = strength;
  }
  const res = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([task]),
  });
  const responseText = await res.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Invalid JSON response: ${responseText}`);
  }
  if (!res.ok) {
    throw new Error(`Runware API error: ${res.status} - ${JSON.stringify(data, null, 2)}`);
  }
  const url = data?.items?.[0]?.result?.imageURL || data?.data?.[0]?.imageURL;
  if (!url) {
    throw new Error(`No image URL found in response: ${JSON.stringify(data)}`);
  }
  return url;
}

// Increase payload limit to allow large base64 images
app.use(express.json({ limit: '15mb' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/predict
 *
 * Receives a base64 encoded PNG (data URL) and uses the Google Gemini API to
 * generate a two‑ to three‑word guess describing the sketch.  The guess is
 * returned to the client.  If an error occurs the endpoint returns a
 * 500 status with an error message.
 */
app.post('/api/predict', async (req, res) => {
  try {
    const { image, previousPrediction, userResponse } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    // Remove the data URL prefix so only the base64 data is sent to Gemini
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');

    // Build a more specific prompt using previous prediction and user response
    let prompt = 'Décrivez ce croquis en deux ou trois mots en français. Répondez seulement avec les mots en français. Utilisez des substantifs simples.';
    // userResponse and previousPrediction are destructured from req.body above
    if (previousPrediction && userResponse) {
      prompt = `Décrivez ce croquis en deux ou trois mots en français. Répondez seulement avec les mots en français. Ne répétez pas la supposition précédente: "${previousPrediction}". L'utilisateur a répondu: "${userResponse}". Rendez votre nouvelle supposition plus précise et différente. Utilisez des substantifs simples.`;
    } else if (previousPrediction) {
      prompt = `Décrivez ce croquis en deux ou trois mots en français. Répondez seulement avec les mots en français. Ne répétez pas la supposition précédente: "${previousPrediction}". Rendez votre nouvelle supposition plus précise et différente. Utilisez des substantifs simples.`;
    }

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
    const apiKey = process.env.GEMINI_API_KEY;
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
      '?key=' + apiKey;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    let guess = '';
    if (data && Array.isArray(data.candidates) && data.candidates[0]?.content?.parts?.length) {
      guess = data.candidates[0].content.parts.map((p) => p.text).join(' ').trim();
    }
    res.json({ guess });
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Prediction failed' });
  }
});

/**
 * POST /api/generate
 *
 * Generates a final artwork from the user's sketch. The request must include
 * the base64 data URL of the sketch, the chosen style (optional), and the
 * last question/answer pair (optional). The server sends a single prompt to
 * Gemini to both describe the drawing and craft an optimal prompt for the
 * image‑to‑image model. It then sends the prompt and the sketch to the Fal AI
 * flux‑pro/kontext model using the official client library and returns the result.
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { image, style, question, answer, personalPrompt } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
      '?key=' + apiKey;

    // Single step: describe and optimize prompt
    const styleFragment = style ? ` ${style}` : '';
    const q = question || '';
    const a = answer || '';
    const userPromptFragment = personalPrompt ? `L'utilisateur a fourni cette instruction spécifique à intégrer: "${personalPrompt}". ` : '';
    const combinedPrompt =
      `Vous êtes un expert en interprétation visuelle et en création de prompts pour l'IA artistique. Analysez l'image de croquis ci-jointe. Retournez UNIQUEMENT un paragraphe entre <<<BEGIN_PROMPT>>> et <<<END_PROMPT>>>. Pas de préface, pas d'étiquettes, pas de listes, pas de clôtures de code, pas de guillemets, pas d'espaces réservés. Maximum 1000 caractères. Ne mentionnez pas "croquis", "utilisateur" ou "prompt". Utilisez un langage clair, descriptif et de qualité professionnelle pour un modèle de diffusion image-à-image. Répondez entièrement en français.
Tâche:
1) Analysez le croquis ci-joint pour déduire le(s) sujet(s) principal(aux), les positions, les proportions, la perspective et l'intention; déduisez des couleurs réalistes appropriées, des matériaux, des textures, un éclairage et un arrière-plan cohérent pour que la scène soit professionnellement immersive et reproductible.
2) Fusionnez cette analyse avec ` + (q ? `La dernière question posée à l'utilisateur était "${q}" et la réponse était "${a}". ` : '') + userPromptFragment +
      ` pour produire UN paragraphe final, photoréaliste, en 3D, de haute qualité qui préserve la structure dessinée et les relations, enrichit les détails (matériaux, lumière/ombres, ambiance, environnement) et reste fidèle à l'intention originale. Le style principal de l'image-prompt est ${styleFragment}. Assurez-vous que votre réponse est en français avec une grammaire et des articles appropriés.

Format de sortie:
<<<BEGIN_PROMPT>>>
{paragraphe final uniquement en français}
<<<END_PROMPT>>>`;
    const body = {
      contents: [
        {
          parts: [
            { text: combinedPrompt },
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

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const geminiJson = await geminiRes.json();
    let description = '';
    let finalPrompt = '';
    if (geminiJson && Array.isArray(geminiJson.candidates) && geminiJson.candidates[0]?.content?.parts?.length) {
      const combinedText = geminiJson.candidates[0].content.parts.map((p) => p.text).join('\n').trim();
      // Split description and prompt by line
      const [desc, ...promptLines] = combinedText.split('\n');
      description = desc.trim();
      finalPrompt = promptLines.join(' ').trim();
    }

    // Step 3: Try Fal AI, fallback to Runware if error or timeout (30s)
    const dataUri = image;
    let resultImage;
    let falError = null;
    let usedFallback = false;
    const falPromise = (async () => {
      try {
        console.log('Attempting to generate image with Fal AI...');
        
        // Check for valid API key
        if (!process.env.FAL_API_KEY) {
          console.error('FAL_API_KEY is missing in environment variables');
          throw new Error('Missing Fal AI API key');
        }
        
        // Log the input for debugging
        console.log('Fal AI Input:', {
          prompt: (finalPrompt || description || 'Une image détaillée et belle').substring(0, 100) + '...',
          imageProvided: !!dataUri
        });
        
        const falResult = await subscribe('fal-ai/flux-pro/kontext', {
          input: {
            prompt: finalPrompt || description || 'Une image détaillée et belle',
            image_url: dataUri,
          },
          sync_mode: true,
          logs: true, // Enable logs for debugging
        });
        
        // Debug the response
        console.log('Fal AI Response received:', 
                    falResult ? 'Success' : 'Empty response',
                    falResult?.images ? `with ${falResult.images.length} images` : 'without images');
                   
        // Handle different response formats
        if (falResult?.images && falResult.images.length > 0) {
          console.log('Using falResult.images[0].url');
          return falResult.images[0].url;
        } else if (falResult?.data?.images && falResult.data.images.length > 0) {
          console.log('Using falResult.data.images[0].url');
          return falResult.data.images[0].url;
        } else if (falResult?.output) {
          console.log('Using falResult.output');
          return falResult.output;
        }
        
        // Log full response for debugging
        console.error('No image URL found in Fal AI response:', JSON.stringify(falResult, null, 2));
        throw new Error('No image returned from Fal AI');
      } catch (e) {
        console.error('Fal AI error:', e.message);
        falError = e;
        return null;
      }
    })();
    // 20s timeout (reduced from 30s for faster fallback)
    function timeoutPromise(ms) {
      return new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), ms));
    }
    let falResult = await Promise.race([falPromise, timeoutPromise(40000)]);
    if (falResult && falResult !== 'TIMEOUT') {
      console.log('Successfully generated image with Fal AI');
      resultImage = falResult;
    } else {
      // Log the reason for fallback
      console.error('Fal AI failed:', falResult === 'TIMEOUT' ? 
        'Request timed out after 20 seconds' : 
        (falError ? falError.message : 'Unknown error'));
      
      // Fallback to Runware
      usedFallback = true;
      console.log('Falling back to Runware API...');
      try {
        // Use the exact same prompt as for Fal AI
        const runwarePrompt = finalPrompt || description || 'Une image détaillée et belle';
        resultImage = await generateImageWithRunware(
          runwarePrompt,
          {
            seedImage: base64,
            strength: 0.8,
            width: 768,
            height: 768,
          }
        );
      } catch (runwareErr) {
        console.error('Runware fallback error:', runwareErr);
        return res.status(500).json({ error: 'Both Fal AI and Runware failed' });
      }
    }
    res.json({ description, prompt: finalPrompt || description, image: resultImage, fallback: usedFallback });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
