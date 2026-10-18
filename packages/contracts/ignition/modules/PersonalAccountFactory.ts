import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PersonalAccountFactory", (m) => {
  const factory = m.contract("PersonalAccountFactory");
  return { factory };
});
