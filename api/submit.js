// 题本数据采集后端（Vercel Serverless Function）
// 接收前端表单 POST，写入飞书多维表格
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Method not allowed" });
  }

  const { APP_ID, APP_SECRET, APP_TOKEN, TABLE_ID } = process.env;
  if (!APP_ID || !APP_SECRET || !APP_TOKEN || !TABLE_ID) {
    return res.status(500).json({ ok: false, msg: "server env not configured" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { industry, data } = body || {};

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ ok: false, msg: "invalid data" });
    }

    // 构建飞书字段：过滤空值，注入行业
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      fields[k] = v;
    }
    if (industry && !fields["行业"]) {
      fields["行业"] = [industry];
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ ok: false, msg: "empty data" });
    }

    const token = await getTenantToken(APP_ID, APP_SECRET);

    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fields }),
      }
    );
    const result = await resp.json();

    if (result.code !== 0) {
      return res.status(500).json({ ok: false, msg: result.msg || "feishu error", code: result.code });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message || "server error" });
  }
}

let _token = null;
let _tokenExp = 0;

async function getTenantToken(appId, appSecret) {
  if (_token && Date.now() < _tokenExp) return _token;
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );
  const data = await resp.json();
  if (data.code !== 0) throw new Error(data.msg || "token error");
  _token = data.tenant_access_token;
  _tokenExp = Date.now() + (data.expire - 60) * 1000;
  return _token;
}
