import type { Direction, IndicatorEffects } from "@/domain/types";

export const directions: {
  id: Direction;
  label: string;
  short: string;
  symbol: string;
}[] = [
  { id: "transport", label: "Транспорт", short: "Транспорт", symbol: "↗" },
  { id: "ecology", label: "Экология", short: "Экология", symbol: "✳" },
  { id: "social", label: "Социальная сфера", short: "Соцсфера", symbol: "+" },
  { id: "safety", label: "Безопасность", short: "Безопасность", symbol: "◇" },
  { id: "services", label: "Городские сервисы", short: "Сервисы", symbol: "≋" },
];

export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

export const formatEffects = (effects: IndicatorEffects) =>
  Object.entries(effects)
    .map(([id, value]) => `${id} ${value > 0 ? "+" : ""}${value}`)
    .join(" · ");

export function heatLevel(value: number, threshold: number) {
  if (value < threshold) return "critical";
  if (value < 50) return "low";
  if (value < 65) return "medium";
  return "high";
}
