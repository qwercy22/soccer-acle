// api/predict.js
// Vercel Serverless Function — calls OpenGradient x402 LLM inference

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { home, away, competition, stage, context } = req.body;

  if (!home || !away) {
    return res.status(400).json({ error: 'Both team names are required.' });
  }

  const prompt = `You are a world-class football analyst and statistician. Analyze the following match and provide a detailed prediction.

Match: ${home} vs ${away}
Competition: ${competition}
Stage: ${stage}
${context ? `Additional context: ${context}` : ''}

Respond ONLY with a valid JSON object (no markdown, no extra text) in this exact format:
{
  "homeScore": <integer 0-5>,
  "awayScore": <integer 0-5>,
  "homeWinPct": <integer percentage, e.g. 55>,
  "drawPct": <integer percentage>,
  "awayWinPct": <integer percentage>,
  "analysis": "<2-3 sentence tactical analysis of why this result is likely>",
  "factors": [
    "<key factor 1>",
    "<key factor 2>",
    "<key factor 3>",
    "<key factor 4>"
  ]
}

Note: homeWinPct + drawPct + awayWinPct must equal exactly 100.`;

  try {
    // ─── OpenGradient x402 LLM Inference ───
    // Requires OG_PRIVATE_KEY env var (Base Sepolia wallet with $OPG testnet tokens)
    // Get free tokens: https://faucet.opengradient.ai
    const OG_ENDPOINT = process.env.OG_ENDPOINT || 'https://gateway.opengradient.ai/api/v1';
    const OG_PRIVATE_KEY = process.env.OG_PRIVATE_KEY;

    let prediction;
    let paymentHash = null;
    let modelUsed = 'openai/gpt-4.1';

    if (OG_PRIVATE_KEY) {
      // ── PRODUCTION: Real OpenGradient x402 call ──
      // The x402 protocol uses standard OpenAI-compatible chat completions
      // with payment handled via HTTP 402 Payment Required flow
      const ogResponse = await fetch(`${OG_ENDPOINT}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Private-Key': OG_PRIVATE_KEY,
          'X-Settlement-Mode': 'SETTLE_BATCH', // cost-efficient batch settlement
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!ogResponse.ok) {
        const errText = await ogResponse.text();
        throw new Error(`OpenGradient error: ${errText}`);
      }

      const ogData = await ogResponse.json();
      const rawText = ogData.choices?.[0]?.message?.content || '';
      paymentHash = ogData.payment_hash || ogData.x402_hash || null;
      modelUsed = ogData.model || modelUsed;
      prediction = parseJSON(rawText);

    } else {
      // ── DEVELOPMENT / DEMO: Uses OpenAI directly as fallback ──
      // Replace this with your own OpenAI key in .env for local dev
      const OPENAI_KEY = process.env.OPENAI_API_KEY;

      if (!OPENAI_KEY) {
        // No keys at all — return a mock for UI testing
        prediction = getMockPrediction(home, away);
        modelUsed = 'mock/demo';
      } else {
        const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            temperature: 0.7,
          }),
        });
        const oaiData = await oaiRes.json();
        const rawText = oaiData.choices?.[0]?.message?.content || '';
        prediction = parseJSON(rawText);
        modelUsed = 'openai/gpt-4o-mini (dev)';
      }
    }

    return res.status(200).json({
      ...prediction,
      model: modelUsed,
      paymentHash,
      predictionId: 'OG-' + Date.now().toString(36).toUpperCase(),
    });

  } catch (err) {
    console.error('Prediction error:', err);
    return res.status(500).json({ error: err.message || 'Prediction failed. Please try again.' });
  }
}

// Safely parse JSON from LLM output
function parseJSON(text) {
  try {
    // Strip markdown fences if present
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Ensure percentages add to 100
    const total = (parsed.homeWinPct || 0) + (parsed.drawPct || 0) + (parsed.awayWinPct || 0);
    if (total !== 100) {
      parsed.awayWinPct = 100 - (parsed.homeWinPct || 0) - (parsed.drawPct || 0);
    }
    return parsed;
  } catch {
    // Fallback if JSON parse fails
    return getMockPrediction('Home', 'Away');
  }
}

// Mock data for UI testing without any API keys
function getMockPrediction(home, away) {
  return {
    homeScore: 2,
    awayScore: 1,
    homeWinPct: 52,
    drawPct: 24,
    awayWinPct: 24,
    analysis: `${home} holds a strong home advantage and their pressing style should trouble ${away}'s build-up play. Expect an intense, closely contested match with the home side edging it through greater territorial dominance.`,
    factors: [
      'Home crowd advantage',
      'Recent form favors home side',
      'Away team missing key midfielder',
      'Head-to-head history at this venue'
    ]
  };
}
