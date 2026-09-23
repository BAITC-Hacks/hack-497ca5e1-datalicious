import type { Dataset, Decision } from "@/domain/types";

/** Organizer data; no validation or score calculation in this module. */
export const dataset = {
  version: "organizers-v1",
  rules: {
    budget: 100, requiredDecisions: 5, maxPerDirection: 2, horizonQuarters: 8,
    criticalThreshold: 40, criticalPenalty: 1, averageWeight: 0.7, weakestDistrictWeight: 0.3,
  },
  indicators: [
    { id: "T1", direction: "transport", name: "Разгрузка дорог", description: "100 = нет пробок в час пик, 0 = стоит всё", weight: 0.10 },
    { id: "T2", direction: "transport", name: "Доступность общественного транспорта", description: "100 = все жители в 500 м от остановки с интервалом ≤10 мин", weight: 0.10 },
    { id: "E1", direction: "ecology", name: "Озеленение", description: "100 = ≥20 м² зелени на жителя", weight: 0.09 },
    { id: "E2", direction: "ecology", name: "Качество воздуха", description: "100 = зимой AQI ≤50, 0 = хронический смог", weight: 0.11 },
    { id: "S1", direction: "social", name: "Школы и детсады", description: "100 = 100% нормативной потребности, без 2-й смены", weight: 0.11 },
    { id: "S2", direction: "social", name: "Поликлиники и первичная медпомощь", description: "100 = норматив на жителя выполнен полностью", weight: 0.11 },
    { id: "B1", direction: "safety", name: "Безопасность улиц", description: "100 = освещение и камеры везде, минимум происшествий", weight: 0.09 },
    { id: "B2", direction: "safety", name: "Безопасность дорожного движения", description: "100 = минимум ДТП с пострадавшими", weight: 0.09 },
    { id: "C1", direction: "services", name: "Надёжность ЖКХ", description: "100 = нет аварий отопления/воды за год", weight: 0.10 },
    { id: "C2", direction: "services", name: "Скорость решения обращений жителей", description: "100 = все обращения закрыты в срок", weight: 0.10 },
  ],
  districts: [
    { id: "esil", name: "Есиль", populationShare: 0.27, profile: "Богатый, но с пробками на мостах и переполненными школами.", indicators: { T1: 45, T2: 62, E1: 68, E2: 72, S1: 48, S2: 55, B1: 78, B2: 60, C1: 75, C2: 70 } },
    { id: "almaty", name: "Алматы", populationShare: 0.24, profile: "Старый ЖКХ и пробки.", indicators: { T1: 40, T2: 75, E1: 50, E2: 55, S1: 60, S2: 65, B1: 62, B2: 52, C1: 50, C2: 60 } },
    { id: "saryarka", name: "Сарыарка", populationShare: 0.20, profile: "Смог от частного сектора, слабое озеленение.", indicators: { T1: 50, T2: 70, E1: 42, E2: 40, S1: 62, S2: 68, B1: 58, B2: 55, C1: 45, C2: 55 } },
    { id: "baikonur", name: "Байконур", populationShare: 0.13, profile: "Середняк без ярких перекосов.", indicators: { T1: 52, T2: 68, E1: 55, E2: 50, S1: 58, S2: 60, B1: 52, B2: 58, C1: 55, C2: 58 } },
    { id: "nura", name: "Нура", populationShare: 0.16, profile: "Главный аутсайдер по соцсфере и транспорту.", indicators: { T1: 55, T2: 40, E1: 45, E2: 65, S1: 38, S2: 35, B1: 55, B2: 50, C1: 60, C2: 50 } },
  ],
  measures: [
    { id: "M1", direction: "transport", name: "Выделенные полосы для автобусов", scope: "district", cost: 18, lagQuarters: 2, effects: { T1: 6, T2: 9 } },
    { id: "M2", direction: "transport", name: "Умные светофоры (адаптивное управление)", scope: "city", cost: 22, lagQuarters: 2, effects: { T1: 4, B2: 3 } },
    { id: "M3", direction: "transport", name: "Линия ЛРТ / расширение", scope: "district", cost: 30, lagQuarters: 4, effects: { T1: 16, T2: 20, E2: 4 } },
    { id: "M4", direction: "ecology", name: "Парк / сквер", scope: "district", cost: 15, lagQuarters: 2, effects: { E1: 12, E2: 3, B1: 2 } },
    { id: "M5", direction: "ecology", name: "Перевод частного сектора на чистое топливо", scope: "district", cost: 25, lagQuarters: 3, effects: { E2: 14, C1: 4 } },
    { id: "M6", direction: "ecology", name: "Городская программа озеленения и ветрозащитных полос", scope: "city", cost: 20, lagQuarters: 4, effects: { E1: 5, E2: 3 } },
    { id: "M7", direction: "social", name: "Школа + детсад (модульное строительство)", scope: "district", cost: 24, lagQuarters: 3, effects: { S1: 16 } },
    { id: "M8", direction: "social", name: "Центр семейного здоровья / поликлиника", scope: "district", cost: 20, lagQuarters: 3, effects: { S2: 14 } },
    { id: "M9", direction: "social", name: "Дворовые спорт-хабы", scope: "district", cost: 10, lagQuarters: 1, effects: { S1: 3, S2: 3, B1: 3 } },
    { id: "M10", direction: "safety", name: "Освещение и камеры (расширение Safe City)", scope: "district", cost: 12, lagQuarters: 1, effects: { B1: 12, B2: 2 } },
    { id: "M11", direction: "safety", name: "Безопасные переходы и школьные зоны", scope: "district", cost: 10, lagQuarters: 1, effects: { B2: 12, T1: -2 } },
    { id: "M12", direction: "services", name: "Единая цифровая платформа обращений", scope: "city", cost: 14, lagQuarters: 1, effects: { C2: 5 } },
    { id: "M13", direction: "services", name: "Модернизация тепло- и водосетей", scope: "district", cost: 28, lagQuarters: 4, effects: { C1: 18, E2: 2 } },
    { id: "M14", direction: "services", name: "Аварийные бригады ЖКХ + раннее оповещение", scope: "city", cost: 16, lagQuarters: 1, effects: { C1: 5, C2: 2 } },
  ],
  synergies: [
    { pair: ["M1", "M2"], target: "first-measure-district", effects: { T1: 2 } },
    { pair: ["M10", "M12"], target: "first-measure-district", effects: { B1: 2 } },
    { pair: ["M5", "M6"], target: "first-measure-district", effects: { E2: 2 } },
  ],
  incompatibilities: [
    { pair: ["M1", "M3"], scope: "anywhere", reason: "Либо BRT, либо ЛРТ, в любом районе." },
    { pair: ["M4", "M7"], scope: "same-district", reason: "Конфликт за участок." },
    { pair: ["M5", "M13"], scope: "same-district", reason: "Дублирование программы." },
  ],
} as const satisfies Dataset;

export const exampleDecisions = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12" },
  { measureId: "M5", districtId: "saryarka" },
] as const satisfies readonly Decision[];
