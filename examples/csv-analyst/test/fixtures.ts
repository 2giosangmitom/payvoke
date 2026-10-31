export const salesCsv = [
  "date,region,product,units,revenue,note",
  ...Array.from({ length: 60 }, (_, i) => {
    const region = ["EU", "US", "APAC"][i % 3];
    const product = ["Widget", "Gadget"][i % 2];
    const month = String((i % 12) + 1).padStart(2, "0");
    const units = 10 + (i % 7);
    const revenue = i === 42 ? "$99,000.00" : `$${(units * 12.5).toFixed(2)}`;
    return `2026-${month}-15,${region},${product},${units},"${revenue}",${i % 5 ? "" : "see <b>http://x.io</b>"}`;
  }),
].join("\n");
