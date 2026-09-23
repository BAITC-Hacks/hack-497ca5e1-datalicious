import type { DistrictId } from "@/domain/types";

/** Illustrative parcels only. These are NOT administrative/GIS boundaries. */
export const cityLayout: {
  id: DistrictId;
  color: number;
  center: [number, number];
  polygon: [number, number][];
}[] = [
  {
    id: "saryarka",
    color: 0xc5d7bf,
    center: [-3.7, -2.1],
    polygon: [
      [-7, -3],
      [-2.7, -5.2],
      [-0.1, -4.7],
      [0, -1.3],
      [-2.4, 0.05],
      [-6.7, -0.4],
    ],
  },
  {
    id: "baikonur",
    color: 0xd8ddc6,
    center: [2.3, -2.4],
    polygon: [
      [0.2, -4.7],
      [4.5, -4],
      [5.7, -1.3],
      [2.6, 0.3],
      [0.3, -1.1],
    ],
  },
  {
    id: "almaty",
    color: 0xd4d4bd,
    center: [4.7, 1.6],
    polygon: [
      [5.9, -1.1],
      [7.3, 1.8],
      [5, 4.3],
      [2.2, 2.6],
      [2.7, 0.6],
    ],
  },
  {
    id: "esil",
    color: 0xc4d6cf,
    center: [-4, 2.5],
    polygon: [
      [-6.5, 0.4],
      [-2.7, 0.7],
      [-0.5, 2.4],
      [-0.7, 5.1],
      [-4.6, 4.5],
      [-7.1, 2],
    ],
  },
  {
    id: "nura",
    color: 0xe1d0b6,
    center: [1.3, 4.3],
    polygon: [
      [-0.3, 2.5],
      [1.8, 2.8],
      [4.7, 4.7],
      [0.8, 6],
      [-0.5, 5.1],
    ],
  },
];

export const districtSummaries: Record<DistrictId, string> = {
  esil: "Разгрузить дороги. Дать место новым школьникам.",
  almaty: "Обновить сети ЖКХ и сделать дороги свободнее.",
  saryarka: "Больше зелени и чистого воздуха.",
  baikonur: "Улучшать городскую среду без резких перекосов.",
  nura: "Школы и поликлиники нужны в первую очередь.",
};
