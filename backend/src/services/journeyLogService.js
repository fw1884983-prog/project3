import { getLLMClient, getLLMModel, friendlyLLMError } from "../utils/llmClient.js";

/**
 * 将胶卷帧序列编排为线性旅行日志（按编辑顺序）。
 */
export async function compileJourneyLogNarrative({ frames = [], route_theme = null }) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("胶卷为空，无法结算旅行日志");
  }

  const client = getLLMClient();
  const system = `你是旅行杂志编辑。根据用户沿路线采集的「胶卷帧」材料（每帧对应一个触发地点，含拖入的关键词、百科摘录、图片说明），按帧顺序写成一篇线性旅行日志。
要求：中文散文；保持帧顺序；可呼应 route_theme；2~6 段；不要编造精确年代数字。
输出 JSON：{
  "title": string,
  "subtitle": string,
  "sections": [{"heading": string, "place": string, "body": string}],
  "full_story": string
}`;

  const payload = {
    route_theme,
    frame_count: frames.length,
    frames: frames.map((f, i) => ({
      order: i + 1,
      place: f.poiName || f.poi_name,
      progress: f.progress,
      items: (f.items || []).map((it) => ({
        type: it.type,
        label: it.label || it.text || it.caption,
      })),
    })),
  };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: getLLMModel(),
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
  } catch (e) {
    throw new Error(friendlyLLMError(e));
  }

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("旅行日志生成失败");
  return JSON.parse(text);
}
