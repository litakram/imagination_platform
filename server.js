const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
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

// Helper: BFL AI fallback
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
    // Check if we have at least an image or a personalPrompt
    if (!image && !personalPrompt) {
      return res.status(400).json({ error: 'No image or prompt provided' });
    }
    
    // If there's an image, process it; otherwise we'll generate from text only
    const base64 = image ? image.replace(/^data:image\/\w+;base64,/, '') : '';
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
      '?key=' + apiKey;

    // Single step: describe and optimize prompt
    const q = question || '';
    const a = answer || '';
    const userPromptFragment = personalPrompt ? `L'utilisateur a fourni cette instruction spécifique à intégrer: "${personalPrompt}". ` : '';
    const combinedPrompt =
      `Vous êtes un expert en interprétation visuelle et en création de descriptions immersives pour l'IA artistique. Analysez attentivement l’image fournie et déduisez les sujets principaux, leurs positions, proportions, perspective et intention générale. Imaginez des couleurs réalistes, des matériaux, des textures, un éclairage cohérent et un arrière-plan crédible afin de transformer la scène en une représentation professionnelle et immersive. Ne mentionnez pas l’existence de l’image ou du croquis, ni d’instructions techniques. Retournez UNIQUEMENT un paragraphe en français entre <<<BEGIN_PROMPT>>> et <<<END_PROMPT>>>. Maximum 1000 caractères. Le texte doit être descriptif, fluide et exploitable tel quel par un modèle de diffusion image-à-image ou text-à-image.

Tâche :
1) Intégrez l’analyse visuelle pour enrichir les détails (matériaux, lumière, ambiance, environnement) tout en respectant la structure et les relations de la scène.
2) Ajoutez la dimension d’intention : la dernière question posée à l’utilisateur était "${q}" et la réponse était "${a}".
3) Fusionnez cela avec ${userPromptFragment}, qui précise le style ou l’ambiance souhaitée.

Format attendu :
<<<BEGIN_PROMPT>>>
{paragraphe final en français}
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
      // Log the complete Gemini response for debugging
      console.log('Gemini response (refined prompt):', combinedText);
      
      // Split description and prompt by line
      const [desc, ...promptLines] = combinedText.split('\n');
      description = desc.trim();
      finalPrompt = promptLines.join(' ').trim();
    }

    // Step 3: Try Fal AI, fallback to BFL AI if error or timeout (40s)
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
        
        // Prepare prompt
        const promptToUse = finalPrompt || description || personalPrompt || 'Une image détaillée et belle';
        
        // Log the input for debugging
        console.log('Fal AI Input:', {
          prompt: promptToUse.substring(0, 100) + '...',
          imageProvided: !!dataUri
        });
        
        let falResult;
        
        // If we have an image, use image-to-image model (kontext)
        // Otherwise use text-to-image model (stable-diffusion)
        if (dataUri) {
          falResult = await subscribe('fal-ai/flux-pro/kontext', {
            input: {
              prompt: promptToUse,
              image_url: dataUri,
            },
            sync_mode: true,
            logs: true, // Enable logs for debugging
          });
        } else {
          // Text-to-image generation when no sketch is provided
          falResult = await subscribe('fal-ai/stable-diffusion-xl-lightning', {
            input: {
              prompt: promptToUse,
              negative_prompt: "deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blurry, watermark, watermarked, oversaturated, censored, distorted, deeply detailed, poorly drawn, low quality, draft, out of frame, cut off, poorly framed",
              width: 768,
              height: 768,
              num_images: 1
            },
            sync_mode: true,
            logs: true,
          });
        }
        
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
        'Request timed out after 40 seconds' : 
        (falError ? falError.message : 'Unknown error'));
      
      // Fallback to BFL AI
      usedFallback = true;
      console.log('Falling back to BFL AI API...');
      try {
        // Use the exact same prompt as for Fal AI
        const bflPrompt = finalPrompt || description || personalPrompt || 'Une image détaillée et belle';
        
        // Options for BFL AI API
        const options = {
          width: 768,
          height: 768,
        };
        
        // Si nous avons une image, l'inclure comme seedImage
        if (dataUri) {
          // Pour BFL, passer uniquement la partie base64 du dataURI
          if (dataUri.startsWith('data:')) {
            options.seedImage = dataUri.replace(/^data:image\/\w+;base64,/, '');
            console.log("Passing base64 to BFL (extracted from dataURI), length:", options.seedImage.length);
          } else {
            options.seedImage = dataUri;
            console.log("Passing image data to BFL directly, length:", dataUri.length);
          }
          options.strength = 0.8;
        }
        
        resultImage = await generateImageWithBFL(bflPrompt, options);
      } catch (bflErr) {
        console.error('BFL AI fallback error:', bflErr);
        return res.status(500).json({ error: 'Both Fal AI and BFL AI failed' });
      }
    }
    res.json({ description, prompt: finalPrompt || description, image: resultImage, fallback: usedFallback, fallbackType: usedFallback ? 'BFL AI' : 'Fal AI' });
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
