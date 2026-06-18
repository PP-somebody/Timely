// 本地 API 开发服务器
// 模拟 Vercel Edge Function 的 /api/timeline 端点
// 使用方式: node api-server.mjs
// 需要先配置 .env.local 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY

import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 读取 .env.local ──
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn('⚠️  未找到 .env.local，请确保已设置环境变量');
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY 环境变量');
  console.error('   请复制 .env.example 为 .env.local 并填入实际值');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 工具函数 ──

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(body));
}

function errorResponse(res, message, status = 400) {
  jsonResponse(res, { error: message }, status);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        reject(new Error('无效的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ── 路由处理 ──

async function handlePost(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch {
    return errorResponse(res, '请求体必须是有效的 JSON', 400);
  }

  if (!body || typeof body.topic !== 'string' || !Array.isArray(body.events)) {
    return errorResponse(res, 'JSON 格式不正确，需要包含 topic（字符串）和 events（数组）字段', 400);
  }

  let id = generateId();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing } = await supabase
      .from('timeline')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) break;
    id = generateId();
  }

  const { error } = await supabase.from('timeline').insert({
    id,
    topic: body.topic,
    data: body,
  });

  if (error) {
    console.error('Supabase 插入失败:', error.message);
    return errorResponse(res, '数据保存失败，请稍后重试', 500);
  }

  const host = req.headers.host || 'localhost:5173';
  const proto = 'http';
  jsonResponse(res, { id, url: `${proto}://${host}/timeline?id=${id}` }, 201);
}

async function handleGet(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorResponse(res, '缺少 id 参数', 400);
  }

  const { data, error } = await supabase
    .from('timeline')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Supabase 查询失败:', error.message);
    return errorResponse(res, '数据查询失败，请稍后重试', 500);
  }

  if (!data) {
    return errorResponse(res, '时间轴不存在', 404);
  }

  jsonResponse(res, data.data);
}

// ── 启动服务器 ──

const PORT = 3456;

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  try {
    switch (req.method) {
      case 'POST':
        return await handlePost(req, res);
      case 'GET':
        return await handleGet(req, res);
      default:
        return errorResponse(res, '不支持的请求方法', 405);
    }
  } catch (err) {
    console.error('未捕获的错误:', err);
    errorResponse(res, '服务器内部错误', 500);
  }
});

server.listen(PORT, () => {
  console.log(`✅ 本地 API 服务器已启动: http://localhost:${PORT}/api/timeline`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
});
