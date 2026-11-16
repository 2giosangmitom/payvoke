import { NetworkAvalancheFuji } from "@web3icons/react";
import { WalletMinimal } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { vaultAddress, wallet } from "@/src/remotion/launch/mock";
import { Logo } from "@/src/remotion/launch/screens/console";

// A browser wallet's signature prompt for the EIP-3009 authorization that
// PaymentConfirm asks for: one ReceiveWithAuthorization of 1 USDC to the
// vault, valid for this quote only. Generic, not any one wallet's design.

const rows: [string, string][] = [
  ["from", wallet],
  ["to", `${vaultAddress} (PayvokeVault)`],
  ["value", "1000000"],
  ["validAfter", "1763111640"],
  ["validBefore", "1763112540"],
  ["nonce", "0x4f1c…a92e"],
];

export function WalletPopup({ press = 0, confirmed = false }: { press?: number; confirmed?: boolean }) {
  return (
    <div className="flex w-[380px] flex-col overflow-hidden border border-border-strong bg-[#141f1b] text-[#e8ecdf] shadow-[0_40px_90px_-10px_rgb(0_0_0/0.8)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <WalletMinimal size={18} className="text-[#f5a524]" /> Wallet
        </span>
        <span className="flex items-center gap-1.5 border border-white/15 px-2 py-1 text-xs">
          <NetworkAvalancheFuji size={14} /> Avalanche Fuji
        </span>
      </div>
      <div className="grid gap-4 px-5 pt-5 pb-4">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="grid size-11 place-items-center border border-white/10 bg-background">
            <Logo className="size-6" />
          </span>
          <p className="text-lg font-semibold">Signature request</p>
          <p className="font-mono text-xs text-[#a9b8ad]">https://payvoke.xyz</p>
        </div>
        <div className="grid gap-1 border border-white/10 bg-black/20 p-3 text-xs">
          <p className="mb-1 flex justify-between text-[#a9b8ad]">
            <span>Primary type</span>
            <span className="font-mono text-[#e8ecdf]">ReceiveWithAuthorization</span>
          </p>
          <p className="mb-1 flex justify-between text-[#a9b8ad]">
            <span>Contract</span>
            <span className="font-mono text-[#e8ecdf]">USDC · Fuji</span>
          </p>
          <div className="my-1 h-px bg-white/10" />
          {rows.map(([key, value]) => (
            <p key={key} className="flex justify-between gap-3">
              <span className="text-[#a9b8ad]">{key}</span>
              <span
                className={cn(
                  "truncate font-mono",
                  key === "value" ? "text-[#8cbea2]" : "text-[#e8ecdf]",
                )}
              >
                {value}
              </span>
            </p>
          ))}
        </div>
        <p className="text-center text-xs text-[#a9b8ad]">No gas fee · Signing does not send a transaction</p>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
        <span className="grid h-10 place-items-center border border-white/20 text-sm font-medium">
          Cancel
        </span>
        <span
          className="grid h-10 place-items-center bg-[#8cbea2] text-sm font-semibold text-[#102319]"
          style={{ scale: 1 - press * 0.05, filter: `brightness(${1 + press * 0.2})` }}
        >
          {confirmed ? "Signed ✓" : "Confirm"}
        </span>
      </div>
    </div>
  );
}
