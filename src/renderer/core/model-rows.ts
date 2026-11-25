/**
 * 从 ACP 的 SessionState 里挑出模型相关的配置项，并折成模型面板要的行数据。
 * 纯视图模型：不碰 React，也不认识组件的回调，调用方自己补 onSelect。
 */
import type { SessionConfigOption, SessionState } from "../../shared/types";
import { pickLabel } from "./format";
import { THINKING_LABEL } from "./labels";

export interface ModelCapabilities {
  modelOption?: SessionConfigOption;
  thoughtOption?: SessionConfigOption;
  otherSelects: SessionConfigOption[];
  currentModeName?: string;
  currentModelName?: string;
  /** ACP 返回的模型名形如「kcoder-glm-flash · GLM-5.3-Flash」，底栏只留型号 */
  shortModelName: string;
}

const MODEL_NAME_HINT = /gpt|claude|glm|kimi|qwen|deepseek|model/i;

export function readModelCapabilities(state?: SessionState): ModelCapabilities {
  const modelOption = state?.configOptions.find(
    (option) =>
      option.category === "model" ||
      (!option.category && option.options?.some((item) => MODEL_NAME_HINT.test(item.name))),
  );
  const thoughtOption = state?.configOptions.find((option) => option.category === "thought_level");
  const otherSelects =
    state?.configOptions.filter(
      (option) =>
        option.id !== modelOption?.id &&
        option.id !== thoughtOption?.id &&
        option.category !== "mode",
    ) || [];
  const currentModeName = state?.modes?.availableModes.find(
    (mode) => mode.id === state.modes?.currentModeId,
  )?.name;
  const currentModelName =
    modelOption?.options?.find((item) => item.value === modelOption.currentValue)?.name ||
    modelOption?.currentValue;
  const shortModelName =
    (currentModelName || "").split("·").pop()?.trim() || currentModelName || "";
  return {
    modelOption,
    thoughtOption,
    otherSelects,
    currentModeName,
    currentModelName,
    shortModelName,
  };
}

export interface ModelRowDraft {
  id: string;
  label: string;
  valueLabel: string;
  currentValue?: string;
  options?: Array<{ value: string; label: string }>;
  /** boolean 类型：点一下就切换，没有二级列表 */
  toggle: boolean;
  toggleNext?: boolean;
}

export function buildModelRows(cap: ModelCapabilities): ModelRowDraft[] {
  const rows: ModelRowDraft[] = [];
  const thought = cap.thoughtOption;
  if (thought?.options && thought.options.length > 0) {
    rows.push({
      id: thought.id,
      label: "思考强度",
      valueLabel: pickLabel(THINKING_LABEL, thought.currentValue),
      currentValue: thought.currentValue,
      options: thought.options.map((item) => ({
        value: item.value,
        label: pickLabel(THINKING_LABEL, item.value, item.name),
      })),
      toggle: false,
    });
  }
  for (const option of cap.otherSelects) {
    if (option.type === "boolean") {
      rows.push({
        id: option.id,
        label: option.name,
        valueLabel: option.currentBoolean ? "已开启" : "已关闭",
        toggle: true,
        toggleNext: !option.currentBoolean,
      });
      continue;
    }
    if (!option.options || option.options.length === 0) continue;
    rows.push({
      id: option.id,
      label: option.name,
      valueLabel:
        option.options.find((item) => item.value === option.currentValue)?.name ||
        option.currentValue ||
        "",
      currentValue: option.currentValue,
      options: option.options.map((item) => ({ value: item.value, label: item.name })),
      toggle: false,
    });
  }
  return rows;
}
