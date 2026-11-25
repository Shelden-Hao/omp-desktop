/**
 * ACP 协议帧的对外形态。真正的 JSON-RPC 状态机在
 * renderer/core/acp/client.ts，这里只描述事件形状。
 */

export type AcpEvent =
  | { type: "notification"; method: string; params: unknown }
  | {
      type: "server_request";
      method: string;
      params: unknown;
      respond: (result: unknown) => void;
      respondError: (code: number, message: string) => void;
    };
