// Vercel 是无状态环境，不能写入文件系统。
// 反馈数据通过 console.log 输出，可在 Vercel Dashboard → Functions → Logs 中查看。
// 如需持久化，建议后续接入外部存储（如 Vercel KV、Airtable、Notion API 等）。

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { userMessage, aiReply, rating, reason, mode } = req.body || {};
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      type: rating === 'report' ? 'report' : 'feedback',
      rating: rating || null,
      userMessage: userMessage || '',
      aiReply: aiReply || '',
      mode: mode || 'unknown',
      reason: reason || '',
    };

    // 在 Vercel Function Logs 中输出完整反馈 JSON
    console.log('[Feedback] recorded:', JSON.stringify(entry));

    res.json({ ok: true });
  } catch (error) {
    console.error('[Feedback] failed:', error.message);
    res.status(500).json({ ok: false, error: 'FEEDBACK_FAILED' });
  }
};
