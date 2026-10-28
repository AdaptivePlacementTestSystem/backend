#!/usr/bin/env bash
# Kiểm tra cục bộ chạy ở pre-push (lint/test). Repo nào cần gì thì sửa file này.
# Mặc định: nếu có package.json thì chạy lint và test (bỏ qua nếu script không tồn tại).
set -e
if [ -f package.json ]; then
  echo "devkit: npm run lint"; npm run lint --if-present
  echo "devkit: npm test";     npm test --if-present
else
  echo "devkit: khong co package.json -> khong co lint/test cuc bo (bo qua)."
fi
