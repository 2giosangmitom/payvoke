import type { V3 } from "./stage";

// Where things are in the little Huế, as plain data so any module can read
// it without import cycles. Metres; -z is north (the river), +z south.
//
//   z =  -23        Lê Lợi, along the river (Quốc Học, Hai Bà Trưng west)
//   z =   -8        his street of tube houses
//   z =   32        Đống Đa: Cao Thắng, Nguyễn Chí Diễu | ĐH Khoa học
//   x =   59        Hùng Vương, from the bridge south (Nguyễn Trường Tộ)
//   east end        Chu Văn An and Nguyễn Tri Phương (Xuân Phú, Vỹ Dạ side)
//   north bank      the Citadel; Nguyễn Huệ on Đinh Tiên Hoàng inside it

export const DONG_DA = { z: 32, x0: -62, x1: 142, half: 5.2, median: 0.8 };
export const HUNG_VUONG = { x: 59, z0: -25.2, z1: 150, half: 7, median: 0.4 };
export const RIVER_ROAD = { z: -23, x0: -118, x1: 52 };

export type SchoolId =
  | "quocHoc"
  | "haiBaTrung"
  | "caoThang"
  | "nguyenChiDieu"
  | "khoaHoc"
  | "nguyenTruongTo"
  | "nguyenHue"
  | "nguyenTriPhuong"
  | "chuVanAn";

/** Each school's centre and the yaw its front (gate side) faces. */
export const SCHOOLS: Record<SchoolId, { at: V3; yaw: number }> = {
  // Lê Lợi, facing the river
  quocHoc: { at: [-72, 0, -11.8], yaw: Math.PI },
  haiBaTrung: { at: [-101, 0, -11.8], yaw: Math.PI },
  // Đống Đa: north side faces +z (the road), south side faces -z
  nguyenChiDieu: { at: [-8, 0, 17], yaw: 0 },
  caoThang: { at: [27, 0, 17], yaw: 0 },
  khoaHoc: { at: [14, 0, 49], yaw: Math.PI },
  // Hùng Vương, east side, facing west
  nguyenTruongTo: { at: [82, 0, 8], yaw: -Math.PI / 2 },
  // further east on Đống Đa, near each other
  chuVanAn: { at: [112, 0, 17], yaw: 0 },
  nguyenTriPhuong: { at: [102, 0, 49], yaw: Math.PI },
  // inside the Citadel
  nguyenHue: { at: [52, 0, -123], yaw: 0 },
};

/** Ground the filler rooftops must keep off: [x0, x1, z0, z1]. */
export const DISTRICTS: [number, number, number, number][] = [
  [-120, -56, -27, -2], // Lê Lợi schools and the road west
  [-64, 146, 11, 60], // Đống Đa and its schools
  [48, 96, -27, 152], // Hùng Vương and the east side
  [126, 152, 20, 46], // the glass tower
  [36, 70, -142, -104], // Nguyễn Huệ, in the Citadel
  [32, 56, 54, 72], // the white hotel south of his block
];
