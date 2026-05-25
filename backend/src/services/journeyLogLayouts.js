/** 与 Urban Travel Journal Layouts 三套方案对应 */
export const LAYOUT_VARIANTS = ["A", "B", "C"];

export const LAYOUT_META = {
  A: { label: "Minimal Editorial", desc: "简洁杂志 ·  typography" },
  B: { label: "Scrapbook", desc: "手账拼贴 · 小红书感" },
  C: { label: "Cinematic", desc: "暗色电影 · 全幅封面" },
};

export function pickRandomLayoutVariant() {
  const i = Math.floor(Math.random() * LAYOUT_VARIANTS.length);
  return LAYOUT_VARIANTS[i];
}

export function layoutPromptHint(variant) {
  const hints = {
    A: "极简编辑风：克制、展签式 Field Notes、1 张主图 + 2 张辅图。",
    B: "手账拼贴风：轻松、可带 emoji 的 highlights、偏个人游记语气。",
    C: "电影杂志风：沉浸式、暗色叙事感、强烈场景描写。",
  };
  return hints[variant] || hints.A;
}
