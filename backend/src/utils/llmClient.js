/**
 * 大模型客户端（当前默认 DeepSeek）。
 *
 * 为何仍 `import OpenAI from "openai"`？
 * - 这是 npm 上的 **OpenAI 兼容协议 SDK**，不是“必须用 OpenAI 公司”；
 * - DeepSeek 官方文档即用此 SDK，只需 baseURL=https://api.deepseek.com + deepseek-chat；
 * - 请求不会发往 api.openai.com，除非你在 .env 里改成 OpenAI 的地址和密钥。
 */
import fs from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", "..", ".env");

/**
 * 每次读取配置前重新加载 backend/.env。
 * node --watch 不会在改 .env 后自动重启，否则进程里一直是旧的空环境变量。
 */
export function reloadEnv() {
  try {
    let raw = fs.readFileSync(ENV_PATH, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed = dotenv.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      process.env[k] = v;
    }
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn("[env] 读取 .env 失败:", e.message);
    }
  }
}

reloadEnv();

const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

function pickApiKey() {
  const deepseek = (process.env.DEEPSEEK_API_KEY || "").trim();
  const llm = (process.env.LLM_API_KEY || "").trim();
  const openai = (process.env.OPENAI_API_KEY || "").trim();

  if (deepseek) return { apiKey: deepseek, keySource: "DEEPSEEK_API_KEY" };
  if (llm) return { apiKey: llm, keySource: "LLM_API_KEY" };

  const base =
    (process.env.LLM_BASE_URL || "").trim() ||
    (process.env.DEEPSEEK_BASE_URL || "").trim() ||
    (process.env.OPENAI_BASE_URL || "").trim() ||
    DEFAULT_DEEPSEEK_BASE;

  const useDeepSeekDefault = base.includes("deepseek.com");

  if (openai) {
    if (useDeepSeekDefault) {
      console.warn(
        "[llm] 检测到 OPENAI_API_KEY 但未设置 DEEPSEEK_API_KEY；已将密钥当作 DeepSeek 使用。建议在 .env 中改名为 DEEPSEEK_API_KEY=..."
      );
      return { apiKey: openai, keySource: "OPENAI_API_KEY(兼容)" };
    }
    return { apiKey: openai, keySource: "OPENAI_API_KEY" };
  }

  return { apiKey: "", keySource: null };
}

/**
 * 读取 LLM 配置（默认 DeepSeek 官方端点 + deepseek-chat）
 */
export function getLLMConfig() {
  let parsed = {};
  try {
    let raw = fs.readFileSync(ENV_PATH, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    parsed = dotenv.parse(raw);
  } catch {
    /* ignore */
  }
  reloadEnv();

  if ("DEEPSEEK_API_KEY" in parsed && !String(parsed.DEEPSEEK_API_KEY ?? "").trim()) {
    throw new Error(
      "backend/.env 里已有 DEEPSEEK_API_KEY= 但等号后面是空的。请在编辑器填好 sk- 密钥后按 Ctrl+S 保存，再点「沿路线叙事分析」（无需重启 backend）。"
    );
  }

  const { apiKey, keySource } = pickApiKey();

  if (!apiKey) {
    throw new Error(
      "未读取到大模型 API Key。请在 backend/.env 添加一行 DEEPSEEK_API_KEY=sk-... 并 Ctrl+S 保存。"
    );
  }

  if (apiKey.length < 20 || apiKey === "dummy" || apiKey.includes("your-key")) {
    throw new Error(
      `大模型 Key 无效或过短（来源 ${keySource}）。请填写 DeepSeek 平台生成的完整 DEEPSEEK_API_KEY 并保存 .env`
    );
  }

  const baseURL =
    (process.env.LLM_BASE_URL || "").trim() ||
    (process.env.DEEPSEEK_BASE_URL || "").trim() ||
    (process.env.OPENAI_BASE_URL || "").trim() ||
    DEFAULT_DEEPSEEK_BASE;

  const model =
    (process.env.LLM_MODEL || "").trim() ||
    (process.env.DEEPSEEK_MODEL || "").trim() ||
    DEFAULT_DEEPSEEK_MODEL;

  const timeout = Math.min(
    120000,
    Math.max(8000, Number(process.env.LLM_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS) || 45000)
  );

  const maxRetries = Number(process.env.LLM_MAX_RETRIES ?? process.env.OPENAI_MAX_RETRIES ?? 1);

  const provider = baseURL.includes("deepseek") ? "DeepSeek" : "LLM";

  return { apiKey, baseURL, model, timeout, maxRetries, provider, keySource };
}

/** 兼容协议 HTTP 客户端实例（默认 baseURL 指向 DeepSeek） */
export function getLLMClient() {
  const { apiKey, baseURL, timeout, maxRetries } = getLLMConfig();
  return new OpenAI({
    apiKey,
    baseURL,
    timeout,
    maxRetries,
  });
}

export function getLLMModel() {
  return getLLMConfig().model;
}

/** @deprecated */
export function getOpenAIClient() {
  return getLLMClient();
}

export function friendlyLLMError(err) {
  const status = err?.status;
  const code = err?.code || err?.error?.code;
  const apiMsg = err?.error?.message || err?.message || String(err || "");
  let keySource = "DEEPSEEK_API_KEY";
  try {
    keySource = getLLMConfig().keySource || keySource;
  } catch {
    /* ignore */
  }

  if (status === 401 || code === "invalid_request_error" && apiMsg.includes("api key")) {
    return (
      `DeepSeek 鉴权失败（${apiMsg}）。请确认 backend/.env 已保存 DEEPSEEK_API_KEY=sk-...，` +
      `当前读取来源：${keySource}。勿使用占位符 dummy；修改后重启 npm run dev。`
    );
  }

  if (status === 402 || apiMsg.includes("Insufficient Balance")) {
    return "DeepSeek 账户余额不足，请在平台充值后再试。";
  }

  const causeCode = err?.cause?.code || err?.code;
  const msg = String(apiMsg);

  if (
    causeCode === "ETIMEDOUT" ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Connection error") ||
    msg.includes("APIConnectionError")
  ) {
    let baseURL = DEFAULT_DEEPSEEK_BASE;
    try {
      baseURL = getLLMConfig().baseURL;
    } catch {
      /* ignore */
    }
    return (
      `无法连接大模型 API（${baseURL}）。路线规划仍可用；请检查网络与 DEEPSEEK_API_KEY。`
    );
  }

  if (msg.includes("未配置") && msg.includes("API Key")) {
    return msg;
  }

  return msg || "大模型请求失败";
}

/** @deprecated */
export const friendlyOpenAIError = friendlyLLMError;
