import _ from "lodash";

import Request from "@/lib/request/Request.ts";
import chat from "@/api/controllers/chat.ts";
import util from "@/lib/util.ts";
import { VideoTaskStatusResponse } from "@/lib/interfaces/IVideoTaskStatus.ts";

export default {

  prefix: "/v1/videos",

  get: {
    "/status/:chatId": async (request: Request) => {
      request
        .validate("headers.authorization", _.isString)
        .validate("params.chatId", _.isString);
      
      // refresh_token切分
      const tokens = chat.tokenSplit(request.headers.authorization);
      // 随机挑选一个refresh_token
      const token = _.sample(tokens);
      const { chatId } = request.params;
      
      const result = await chat.getVideoTaskStatus(chatId, token);
      
      return {
        status: 0,
        message: "success",
        result,
        rid: util.uuid(false)
      };
    }
  },

  post: {

    "/generations": async (request: Request) => {
      request
        .validate(
          "body.conversation_id",
          (v) => _.isUndefined(v) || _.isString(v)
        )
        .validate("body.model", (v) => _.isUndefined(v) || _.isString(v))
        .validate("body.prompt", _.isString)
        .validate("body.audio_id", (v) => _.isUndefined(v) || _.isString(v))
        .validate("body.image_url", (v) => _.isUndefined(v) || _.isString(v))
        .validate("body.label_watermark", (v) => _.isUndefined(v) || _.isNumber(v))
        .validate("body.options", (v) => _.isUndefined(v) || _.isObject(v))
        .validate(
          "body.video_style",
          (v) =>
            _.isUndefined(v) ||
            ["卡通3D", "黑白老照片", "油画", "电影感"].includes(v),
          "video_style must be one of 卡通3D/黑白老照片/油画/电影感"
        )
        .validate(
          "body.emotional_atmosphere",
          (v) =>
            _.isUndefined(v) ||
            ["温馨和谐", "生动活泼", "紧张刺激", "凄凉寂寞"].includes(v),
          "emotional_atmosphere must be one of 温馨和谐/生动活泼/紧张刺激/凄凉寂寞"
        )
        .validate(
          "body.mirror_mode",
          (v) =>
            _.isUndefined(v) || ["水平", "垂直", "推近", "拉远"].includes(v),
          "mirror_mode must be one of 水平/垂直/推近/拉远"
        )
        .validate("headers.authorization", _.isString);
      // refresh_token切分
      const tokens = chat.tokenSplit(request.headers.authorization);
      // 随机挑选一个refresh_token
      const token = _.sample(tokens);
      const {
        model,
        conversation_id: convId,
        prompt,
        image_url: imageUrl,
        video_style: videoStyle = "",
        emotional_atmosphere: emotionalAtmosphere = "",
        mirror_mode: mirrorMode = "",
        audio_id: audioId,
        label_watermark = 1, // 修正：GLM官方 1=去水印，0=有水印
        options = {
          generationPattern: 1,
          resolution: 1, // 图生视频统一使用resolution=1
          fps: 60,
          duration: 1,
          ratioWidth: 608,
          ratioHeight: 1080
        }
      } = request.body;
      console.log('开始调用视频生成函数...');
      const data = await chat.generateVideos(
        model,
        prompt,
        token,
        {
          imageUrl,
          videoStyle,
          emotionalAtmosphere,
          mirrorMode,
          audioId,
          labelWatermark: label_watermark,
          options,
        },
        convId
      );
      
      console.log('视频生成函数返回数据:', JSON.stringify(data, null, 2));
      
      // 提取chatId用于状态查询
      const chatId = data.length > 0 ? data[0].chat_id : null;
      
      console.log('提取的chatId:', chatId);
      
      const result = {
        created: util.unixTimestamp(),
        chat_id: chatId,
        data,
      };
      
      console.log('最终返回给前端的结果:', JSON.stringify(result, null, 2));
      
      return result;
    },
  },

};
