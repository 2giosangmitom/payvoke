import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { keccak256, stringToHex } from "viem";
import PayvokeVaultModule from "./PayvokeVault.js";

// Grants the operational roles the backend needs. Run with the admin key:
// AccessControl only lets the default admin grant roles.
export default buildModule("PayvokeVaultRoles", (m) => {
  const { vault } = m.useModule(PayvokeVaultModule);
  const relayer = m.getParameter("relayer");
  const financeApprover = m.getParameter("financeApprover");
  const financeExecutor = m.getParameter("financeExecutor");

  const grants = [
    ["RELAYER_ROLE", relayer],
    ["REFUND_APPROVER_ROLE", financeApprover],
    ["RELEASE_APPROVER_ROLE", financeApprover],
    ["FINANCE_EXECUTOR_ROLE", financeExecutor],
  ] as const;
  for (const [role, account] of grants)
    m.call(vault, "grantRole", [keccak256(stringToHex(role)), account], { id: `grant_${role}` });

  return { vault };
});
