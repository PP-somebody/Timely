-- ============================================================
-- Supabase 建表 SQL
-- 在 Supabase Dashboard → SQL Editor 中执行以下语句
-- ============================================================

-- 创建 timeline 表
CREATE TABLE IF NOT EXISTS timeline (
  id         VARCHAR(10) PRIMARY KEY,
  topic      TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 为 id 列创建索引（加速 GET /api/timeline?id=xxx 查询）
CREATE INDEX IF NOT EXISTS idx_timeline_id ON timeline (id);

-- 为 created_at 创建索引（按时间排序查询）
CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON timeline (created_at DESC);

-- 启用行级安全（RLS）
ALTER TABLE timeline ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读取（GET 请求）
CREATE POLICY "允许匿名读取"
  ON timeline
  FOR SELECT
  USING (true);

-- 允许匿名用户插入（POST 请求）
-- ⚠️ 生产环境建议使用 service_role key 并限制来源 IP
CREATE POLICY "允许匿名插入"
  ON timeline
  FOR INSERT
  WITH CHECK (true);
