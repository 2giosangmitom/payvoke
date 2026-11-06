// Utility to generate verified, working application & job search links for top platforms and companies

export type PlatformLink = {
  platform: string;
  label: string;
  url: string;
};

export function toSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeCitySlug(location?: string): string {
  if (!location) return "";
  const clean = location.toLowerCase();
  if (clean.includes("hà nội") || clean.includes("ha noi") || clean.includes("hn")) return "ha-noi";
  if (clean.includes("hồ chí minh") || clean.includes("ho chi minh") || clean.includes("hcm") || clean.includes("sài gòn")) return "ho-chi-minh";
  if (clean.includes("đà nẵng") || clean.includes("da nang")) return "da-nang";
  if (clean.includes("hải phòng") || clean.includes("hai phong")) return "hai-phong";
  if (clean.includes("cần thơ") || clean.includes("can tho")) return "can-tho";
  if (clean.includes("bắc ninh") || clean.includes("bac ninh")) return "bac-ninh";
  if (clean.includes("bình dương") || clean.includes("binh duong")) return "binh-duong";
  if (clean.includes("đồng nai") || clean.includes("dong nai")) return "dong-nai";
  if (clean.includes("quảng nam") || clean.includes("quang nam")) return "quang-nam";
  if (clean.includes("huế") || clean.includes("hue")) return "hue";
  return toSlug(location);
}

export function buildTopCvUrl(role: string, location?: string): string {
  const roleSlug = toSlug(role);
  const citySlug = normalizeCitySlug(location);
  if (citySlug && citySlug !== "viet-nam") {
    return `https://www.topcv.vn/tim-viec-lam-${roleSlug}-tai-${citySlug}`;
  }
  return `https://www.topcv.vn/tim-viec-lam-${roleSlug}`;
}

export function buildPlatformLinks(role: string, location?: string): PlatformLink[] {
  const cleanRole = role.replace(/["'\\]/g, "").trim();
  const encRole = encodeURIComponent(cleanRole);
  const encRolePlus = encodeURIComponent(cleanRole).replace(/%20/g, "+");
  const loc = (location || "Việt Nam").replace(/["'\\]/g, "").trim();
  const encLoc = encodeURIComponent(loc);
  const topcvUrl = buildTopCvUrl(cleanRole, location);

  return [
    {
      platform: "TopCV",
      label: `Xem danh sách việc làm "${cleanRole}" trên TopCV`,
      url: topcvUrl,
    },
    {
      platform: "ITviec",
      label: `Xem việc làm IT / Tech "${cleanRole}" trên ITviec`,
      url: `https://itviec.com/it-jobs?query=${encRolePlus}`,
    },
    {
      platform: "VietnamWorks",
      label: `Xem việc làm "${cleanRole}" trên VietnamWorks`,
      url: `https://www.vietnamworks.com/viec-lam?q=${encRole}`,
    },
    {
      platform: "LinkedIn Jobs",
      label: `Tìm việc "${cleanRole}" tại ${loc} trên LinkedIn`,
      url: `https://www.linkedin.com/jobs/search/?keywords=${encRole}&location=${encLoc}`,
    },
    {
      platform: "Google Jobs",
      label: `Tổng hợp việc làm "${cleanRole}" tại ${loc} trên Google Jobs`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`tuyển dụng ${cleanRole} ${loc}`)}&ibp=htl;jobs`,
    },
  ];
}

export function formatQuickApplySection(role: string, location?: string): string {
  const links = buildPlatformLinks(role, location);
  const loc = location || "khu vực của bạn và các tỉnh lân cận";

  return `\n\n---
## 🔗 Danh Sách Link Tuyển Dụng Trực Tiếp (TopCV, ITviec, VietnamWorks, LinkedIn)

Bấm vào các đường link bên dưới để xem trực tiếp các tin tuyển dụng đang mở và nộp hồ sơ ngay cho vị trí **${role}** tại **${loc}**:

### 🌐 Cổng Tìm Việc Trực Tiếp Theo Vị Trí Của Bạn:
${links.map((l) => `- 🟢 **${l.platform}**: [${l.label}](${l.url})`).join("\n")}

### 🏢 Cổng Tuyển Dụng Trực Tiếp Của Các Doanh Nghiệp Hàng Đầu:
- 🏢 **FPT Software**: [Cổng tuyển dụng FPT Software](https://career.fpt-software.com/) | [Tìm việc FPT trên TopCV](https://www.topcv.vn/tim-viec-lam-fpt)
- 🏢 **Tập đoàn Viettel**: [Cổng thông tin tuyển dụng Viettel](https://tuyendung.viettel.vn) | [Tìm việc Viettel trên TopCV](https://www.topcv.vn/tim-viec-lam-viettel)
- 🏢 **Ngân hàng Techcombank**: [Cổng sự nghiệp Techcombank Jobs](https://www.techcombankjobs.com) | [Tìm việc Techcombank trên TopCV](https://www.topcv.vn/tim-viec-lam-techcombank)
- 🏢 **VNG Corporation**: [Cổng tuyển dụng VNG](https://careers.vng.com.vn) | [Tìm việc VNG trên TopCV](https://www.topcv.vn/tim-viec-lam-vng)
- 🏢 **Tập đoàn Vingroup / One Mount**: [One Mount Careers](https://careers.onemount.com) | [Tìm việc Vingroup trên TopCV](https://www.topcv.vn/tim-viec-lam-vingroup)
- 🏢 **KMS Technology / NashTech**: [KMS Careers](https://careers.kms-technology.com) | [NashTech Careers](https://careers.nashtechglobal.com)
`;
}
