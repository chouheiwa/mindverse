#!/usr/bin/env bash
# 部署到 mindverse.chouheiwa.top。
#
# 密钥不在这里：服务器 /etc/mindverse/env（0640, root:mindverse）已经存了
# ZHIHU_OAUTH_APP_KEY 与 ZHIHU_ACCESS_SECRET，本脚本不碰它。
#
# 回调地址同样只在服务器 env 里。不要写进 hackathon.config.json ——
# 那会让本地开发也判定为非 LocalOnly，Cookie 带上 Secure 后在 http 本地失效。
set -euo pipefail

HOST="${DEPLOY_HOST:-aliyun-mindverse}"
REMOTE=/opt/mindverse
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> 构建 linux/amd64（CGO_ENABLED=0，纯 Go SQLite 驱动才编得动）"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /tmp/mindverse-linux ./cmd/server

echo "==> 上传静态资源"
# --no-xattrs 避免 macOS 的 ._* 元数据文件混进服务器
tar --no-xattrs -czf - web testdata hackathon.config.json \
  | ssh "$HOST" "tar xzf - -C $REMOTE && find $REMOTE -name '._*' -delete"

echo "==> 上传数据库（含同题公共回答）"
if [ -f data/mindverse.db ]; then
  scp -q data/mindverse.db "$HOST:$REMOTE/data/mindverse.db"
  ssh "$HOST" "chown mindverse:mindverse $REMOTE/data/mindverse.db"
fi

echo "==> 上传二进制并重启"
scp -q /tmp/mindverse-linux "$HOST:$REMOTE/mindverse.new"
ssh "$HOST" "mv $REMOTE/mindverse.new $REMOTE/mindverse && chmod 755 $REMOTE/mindverse && systemctl restart mindverse"

echo "==> 健康检查"
sleep 3
for i in 1 2 3 4 5; do
  if curl -fsS --max-time 15 https://mindverse.chouheiwa.top/api/health; then
    echo; echo "==> 部署完成"; exit 0
  fi
  sleep 3
done
echo "健康检查失败，查看：ssh $HOST journalctl -u mindverse -n 50" >&2
exit 1
