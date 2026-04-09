const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { home, away, competition, stage, context } = req.body;

  if (!home || !away) {
    return res.status(400).json({ error: 'Both team names are required.' });
  }

  const OG_PRIVATE_KEY = process.env.OG_PRIVATE_KEY;

  const prompt = `You are a world-class football analyst. Predict this match and respond ONLY with valid JSON, no markdown, no extra text.

Match: ${home} vs ${away}
Competition: ${competition || 'Unknown'}
Stage: ${stage || 'Regular Season'}
${context ? `Context: ${context}` : ''}

Return this exact JSON structure:
{
  "homeScore": <integer 0-5>,
  "awayScore": <integer 0-5>,
  "homeWinPct": <integer>,
  "drawPct": <integer>,
  "awayWinPct": <integer>,
  "analysis": "<2-3 sentence tactical analysis>",
  "factors": ["factor 1", "factor 2", "factor 3", "factor 4"]
}

Note: homeWinPct + drawPct + awayWinPct must equal exactly 100.`;

  try {
    if (!OG_PRIVATE_KEY) {
      return res.status(500).json({ error: 'OG_PRIVATE_KEY is not set in environment variables.' });
    }

    const ogRes = await fetch('https://gateway.opengradient.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Private-Key': OG_PRIVATE_KEY,
        'X-Settlement-Mode': 'SETTLE_BATCH',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!ogRes.ok) {
      const errText = await ogRes.text();
      console.error('OpenGradient error:', errText);
      return res.status(500).json({ error: `OpenGradient API error: ${errText}` });
    }

    const ogData = await ogRes.json();
    const raw = ogData.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let prediction;
    try {
      prediction = JSON.parse(clean);
      const total = (prediction.homeWinPct || 0) + (prediction.drawPct || 0) + (prediction.awayWinPct || 0);
      if (total !== 100) {
        prediction.awayWinPct = 100 - (prediction.homeWinPct || 0) - (prediction.drawPct || 0);
      }
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }

    return res.status(200).json({
      ...prediction,
      model: ogData.model || 'openai/gpt-4.1',
      paymentHash: ogData.payment_hash || ogData.x402_hash || null,
      predictionId: 'OG-' + Date.now().toString(36).toUpperCase(),
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Prediction failed.' });
  }
};

module.exports = handler;
