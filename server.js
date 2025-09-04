const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
// Import the `fal` namespace from the client.  According to the fal.ai
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
    let prompt = 'Describe this sketch in two or three words. Only reply with the words.';
    // userResponse and previousPrediction are destructured from req.body above
    if (previousPrediction && userResponse) {
      prompt = `Describe this sketch in two or three words. Only reply with the words. Do not repeat the previous guess: "${previousPrediction}". The user responded: "${userResponse}". Make your new guess more specific and different.`;
    } else if (previousPrediction) {
      prompt = `Describe this sketch in two or three words. Only reply with the words. Do not repeat the previous guess: "${previousPrediction}". Make your new guess more specific and different.`;
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
 * Generates a final artwork from the user’s sketch. The request must include
 * the base64 data URL of the sketch, the chosen style (optional), and the
 * last question/answer pair (optional). The server sends a single prompt to
 * Gemini to both describe the drawing and craft an optimal prompt for the
 * image‑to‑image model. It then sends the prompt and the sketch to the Fal AI
 * flux‑pro/kontext model using the official client library and returns the result.
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { image, style, question, answer } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
      '?key=' + apiKey;

    // Single step: describe and optimize prompt
    const styleFragment = style ? ` in the style of ${style}` : '';
    const q = question || '';
    const a = answer || '';
    const combinedPrompt =
      `You are an expert visual interpreter and AI art prompt engineer. Analyze the attached sketch image. Return ONLY one paragraph between <<<BEGIN_PROMPT>>> and <<<END_PROMPT>>>. No preface, no labels, no lists, no code fences, no quotes, no placeholders. Max 1000 characters. Do not mention “sketch”, “user”, or “prompt”. Use clear, descriptive, production-quality language for an image-to-image diffusion model.
Task:
1) Analyze the attached sketch to infer the main subject(s), positions, proportions, perspective, and intent; infer suitable realistic colors, materials, textures, lighting, and a coherent background so the scene is professionally immersive and reproducible.
2) Merge that analysis with ` + (q ? `The last question asked to the user was "${q}" and the answer was "${a}". ` : '') +
      ` to produce ONE final, photorealistic, 3D-like, high-quality paragraph that preserves the drawn structure and relationships, enriches details (materials, light/shadows, mood, environment), and remains faithful to the original intent. the main style of the picture-prompt is ${styleFragment}.

Output format:
<<<BEGIN_PROMPT>>>
{final paragraph only}
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


    // Step 3: call Fal AI.  Use sync_mode: true at the top level of the
    // subscribe options so that the API returns the completed image
    // directly without requiring separate polling.  Pass the full data URI
    // as `image_url`.  When the call resolves, the first generated
    // image URL can typically be found under the `images` array on the
    // result itself.  Some versions of the client wrap this array in a
    // `data` property instead.  Accommodate both cases and fall back to
    // any `output` field if available.
    const dataUri = image;
    let resultImage;
    try {
      const falResult = await subscribe('fal-ai/flux-pro/kontext', {
        input: {
          prompt: finalPrompt || description || 'A detailed, beautiful image',
          image_url: dataUri,
        },
        sync_mode: true,
        logs: false,
      });
      // Extract image URL from different possible response shapes
      if (falResult?.images && falResult.images.length > 0) {
        resultImage = falResult.images[0].url;
      } else if (falResult?.data?.images && falResult.data.images.length > 0) {
        resultImage = falResult.data.images[0].url;
      } else if (falResult?.output) {
        resultImage = falResult.output;
      }
    } catch (e) {
      console.error('Fal AI generation error:', e);
      return res.status(500).json({ error: 'Fal AI generation failed' });
    }
    if (!resultImage) {
      return res.status(500).json({ error: 'No image returned from Fal AI' });
    }
    res.json({ description, prompt: finalPrompt || description, image: resultImage });
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