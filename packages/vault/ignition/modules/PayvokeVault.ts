import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PayvokeVaultV2", (m) => {
  const asset = m.getParameter("asset", "0x5425890298aed601595a70AB815c96711a31Bc65");
  const admin = m.getParameter("admin");
  const adminDelay = m.getParameter("adminDelay");
  const feeCapBps = m.getParameter("feeCapBps");
  const maxQuoteLifetimeSeconds = m.getParameter("maxQuoteLifetimeSeconds");
  const maxHoldSeconds = m.getParameter("maxHoldSeconds");

  const vault = m.contract("PayvokeVault", [
    asset,
    admin,
    adminDelay,
    feeCapBps,
    maxQuoteLifetimeSeconds,
    maxHoldSeconds,
  ]);

  return { vault };
});
