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
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  const prompt = `You are a football analyst. Predict this match and respond ONLY with valid JSON, no markdown, no extra text.

Match: ${home} vs ${away}
Competition: ${competition || 'Unknown'}
Stage: ${stage || 'Regular Season'}
${context ? `Context: ${context}` : ''}

Return this exact JSON structure:
{
  "homeScore": 2,
  "awayScore": 1,
  "homeWinPct": 55,
  "drawPct": 25,
  "awayWinPct": 20,
  "analysis": "2-3 sentence tactical analysis here",
  "factors": ["factor 1", "factor 2", "factor 3", "factor 4"]
}`;

  try {
    let prediction;
    let modelUsed = 'demo';

    if (OPENAI_KEY) {
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
      const raw = oaiData.choices?.[0]?.message?.content || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      prediction = JSON.parse(clean);
      modelUsed = 'openai/gpt-4o-mini';

    } else {
      // Demo fallback
      prediction = {
        homeScore: 2,
        awayScore: 1,
        homeWinPct: 52,
        drawPct: 24,
        awayWinPct: 24,
        analysis: `${home} holds a strong home advantage and their pressing style should trouble ${away}'s build-up play. Expect an intense match with the home side edging it.`,
        factors: [
          'Home crowd advantage',
          'Recent form favors home side',
          'Away team travel fatigue',
          'Head-to-head history'
        ]
      };
    }

    return res.status(200).json({
      ...prediction,
      model: modelUsed,
      predictionId: 'OG-' + Date.now().toString(36).toUpperCase(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Prediction failed.' });
  }
};

module.exports = handler;
