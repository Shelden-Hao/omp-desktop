/**
 * 当前会话的「能力」：运行模式、配置项（模型/思考强度）、以及模型面板要展示的行。
 * 只读 connection 暴露的 sessionStates，写入走 ACP 的 setMode / set_config_option。
 */

import { useCallback } from "react";
import type { ModelRow } from "../components/composer/ModelPanel";
import { buildModelRows, readModelCapabilities } from "../core/model-rows";
import type { AgentConnection } from "./use-agent-connection";

export function useAgentCapabilities(connection: AgentConnection) {
  const { client, activeId, sessionStates, setSessionStates, setStatus } = connection;

  const activeState = activeId ? sessionStates[activeId] : undefined;
  const capabilities = readModelCapabilities(activeState);

  const changeMode = useCallback(
    async (modeId: string) => {
      if (!client || !activeId) return;
      try {
        await client.setMode(activeId, modeId);
        setSessionStates((prev) => {
          const current = prev[activeId] || { modes: null, configOptions: [] };
          return {
            ...prev,
            [activeId]: {
              ...current,
              modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
            },
          };
        });
      } catch (error) {
        setStatus(`切换档位失败：${(error as Error).message}`);
      }
    },
    [activeId, client, setSessionStates, setStatus],
  );

  const changeConfigOption = useCallback(
    async (optionId: string, value: string | boolean) => {
      if (!client || !activeId) return;
      try {
        await client.setConfigOption(activeId, optionId, value);
        setSessionStates((prev) => {
          const current = prev[activeId] || { modes: null, configOptions: [] };
          return {
            ...prev,
            [activeId]: {
              ...current,
              configOptions: current.configOptions.map((option) =>
                option.id === optionId
                  ? {
                      ...option,
                      currentValue: typeof value === "string" ? value : option.currentValue,
                      currentBoolean: typeof value === "boolean" ? value : option.currentBoolean,
                    }
                  : option,
              ),
            },
          };
        });
      } catch (error) {
        setStatus(`切换配置失败：${(error as Error).message}`);
      }
    },
    [activeId, client, setSessionStates, setStatus],
  );

  // 模型详情面板只列模型相关能力；运行模式已移到输入区的「添加」聚合菜单
  const modelRows: ModelRow[] = buildModelRows(capabilities).map((row) => ({
    id: row.id,
    label: row.label,
    valueLabel: row.valueLabel,
    currentValue: row.currentValue,
    options: row.options,
    onSelect: (value) =>
      void changeConfigOption(row.id, row.toggle ? (row.toggleNext ?? value) : value),
  }));

  return { activeState, capabilities, modelRows, changeMode, changeConfigOption };
}
