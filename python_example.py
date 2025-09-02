#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import time

def generate_image_to_video(image_url, prompt, jwt_token):
    """
    图生视频API调用示例
    
    Args:
        image_url (str): 图片URL
        prompt (str): 视频生成提示词
        jwt_token (str): JWT认证token
    
    Returns:
        dict: API响应结果
    """
    
    # API端点
    url = "http://localhost:8000/v1/videos/generations"
    
    # 请求头
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {jwt_token}"
    }
    
    # 请求数据
    data = {
        "model": "cogvideox",
        "prompt": prompt,
        "image_url": image_url
    }
    
    print("发送图生视频请求...")
    print(f"图片URL: {image_url}")
    print(f"提示词: {prompt}")
    print(f"请求数据: {json.dumps(data, ensure_ascii=False, indent=2)}")
    
    try:
        # 发送POST请求
        response = requests.post(url, headers=headers, json=data, timeout=120)
        
        print(f"\n响应状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        
        # 解析响应
        result = response.json()
        print(f"\n响应结果:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
        # 检查结果
        if response.status_code == 200 and result.get('data'):
            print("\n✅ 视频生成成功!")
            
            for i, video_data in enumerate(result['data']):
                print(f"\n视频 {i+1}:")
                print(f"  对话ID: {video_data.get('conversation_id', 'N/A')}")
                print(f"  视频URL: {video_data.get('video_url', 'N/A')}")
                print(f"  封面URL: {video_data.get('cover_url', 'N/A')}")
                print(f"  视频时长: {video_data.get('video_duration', 'N/A')}")
                print(f"  分辨率: {video_data.get('resolution', 'N/A')}")
                
                # 可以下载视频
                video_url = video_data.get('video_url')
                if video_url:
                    print(f"  可以访问视频: {video_url}")
            
            return result
        else:
            print(f"\n❌ 请求失败:")
            print(f"错误信息: {result.get('message', '未知错误')}")
            return None
            
    except requests.exceptions.Timeout:
        print("\n⏰ 请求超时，视频生成可能需要更长时间")
        return None
    except requests.exceptions.RequestException as e:
        print(f"\n❌ 请求异常: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"\n❌ JSON解析错误: {e}")
        print(f"原始响应: {response.text}")
        return None

def main():
    """主函数示例"""
    
    # 配置参数
    JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcyMDAyMTM0LCJuYmYiOjE3NTY0NTAxMzQsImlhdCI6MTc1NjQ1MDEzNCwianRpIjoiMTRiYmUzNjA1NmQyNDkxZWE2OWU4NWZiMWE5Y2Y1MjEiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJjY2ZmNTBkMWQ0ZGU0YWVhYWYxMjZjOWMxOWMyMGZiMSIsInR5cGUiOiJyZWZyZXNoIn0.Ba93tq3hskD_zNlHxBgvmH15NAr9ClIulDyqUW6V4os"  # 替换为你的token
    
    # 示例1：基础图生视频
    print("=== 示例1: 基础图生视频 ===")
    result1 = generate_image_to_video(
        image_url="https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp",
        prompt="让这个可爱的女孩动起来，眨眨眼睛，微笑",
        jwt_token=JWT_TOKEN
    )
    
    time.sleep(2)  # 等待2秒
    
    # 示例2：更复杂的提示词
    print("\n\n=== 示例2: 复杂提示词 ===")
    result2 = generate_image_to_video(
        image_url="https://example.com/your-image.jpg",  # 替换为你的图片URL
        prompt="图片中的人物开始跳舞，动作优雅流畅，背景保持不变，光线自然",
        jwt_token=JWT_TOKEN
    )

if __name__ == "__main__":
    main()