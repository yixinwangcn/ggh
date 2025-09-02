#!/bin/bash

# 可直接使用的图生视频curl命令
# 这个命令使用了测试成功的参数

echo "发送图生视频请求..."

curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcyMDAyMTM0LCJuYmYiOjE3NTY0NTAxMzQsImlhdCI6MTc1NjQ1MDEzNCwianRpIjoiMTRiYmUzNjA1NmQyNDkxZWE2OWU4NWZiMWE5Y2Y1MjEiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJjY2ZmNTBkMWQ0ZGU0YWVhYWYxMjZjOWMxOWMyMGZiMSIsInR5cGUiOiJyZWZyZXNoIn0.Ba93tq3hskD_zNlHxBgvmH15NAr9ClIulDyqUW6V4os" \
  -d '{
    "model": "cogvideox",
    "prompt": "让这个可爱的女孩动起来，眨眨眼睛，微笑",
    "image_url": "https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp"
  }' \
  --silent \
  --show-error \
  --fail \
  | python3 -m json.tool

echo -e "\n请求完成！"