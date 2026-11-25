/**
 * contenteditable 输入区的协议常量。
 * DOM 即内容真相源：chip 用 data-* 标记，序列化时据此还原成 omp 认识的文本。
 */

/** 光标前正在输入的技能指令：/name 或 /skill:name（omp 实际识别的写法） */
export const SKILL_TOKEN_RE = /(?:^|\s)\/(?:skill:)?([\w-]*)$/;
/** 光标前正在输入的资源引用：@关键字；Win 路径含空格，关键字阶段只匹配非空白 */
export const RESOURCE_TOKEN_RE = /(?:^|\s)@([^\s@]*)$/;

export const SKILL_CHIP_ATTR = "data-skill";
export const RESOURCE_CHIP_ATTR = "data-resource";
/** 两种 chip 共用的删除判定 */
export const CHIP_ATTRS = [SKILL_CHIP_ATTR, RESOURCE_CHIP_ATTR] as const;

/** 用于 closest/querySelector 的 chip 选择器 */
export const CHIP_SELECTOR = CHIP_ATTRS.map((attr) => `[${attr}]`).join(",");
