#!/bin/sh
# verify 一次性服务：代码测试 + 构建检查 + HTTP 冒烟。
# 任一环节失败即以非零退出码结束；全部通过输出 VERIFY OK 并以 0 退出。
set -eu

echo "==> [1/3] 代码测试（vitest：同代价基组分类 / 规范裁决 / 向量长度错误边界 等）"
npm run test:run

echo "==> [2/3] 构建检查（tsc --noEmit && vite build）"
npm run build

echo "==> [3/3] HTTP 冒烟（${WEB_URL:-http://web}）"
BASE="${WEB_URL:-http://web}"

i=0
until wget -q -O /tmp/health.out "$BASE/health" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "FAIL: 健康检查等待超时"
    exit 1
  fi
  sleep 1
done
grep -q "ok" /tmp/health.out || { echo "FAIL: /health 响应异常"; exit 1; }
echo "    /health 通过"

wget -q -O /tmp/index.html "$BASE/" || { echo "FAIL: 首页不可达"; exit 1; }
grep -q 'id="root"' /tmp/index.html || { echo "FAIL: 首页缺少应用挂载点"; exit 1; }
echo "    / 通过"

ASSET=$(grep -o '/assets/[^"]*\.js' /tmp/index.html | head -n 1 || true)
if [ -n "$ASSET" ]; then
  wget -q -O /dev/null "$BASE$ASSET" || { echo "FAIL: 静态资源 $ASSET 不可达"; exit 1; }
  echo "    $ASSET 通过"
fi

echo "VERIFY OK: 代码测试、构建检查、HTTP 冒烟全部通过"
exit 0
