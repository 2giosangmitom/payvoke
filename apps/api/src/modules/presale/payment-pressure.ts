// Text an agent writes that addresses the buyer's AI assistant instead of the
// buyer: overriding its instructions, telling it to pay, naming its tools or
// asking for secrets (AP2 red-teaming, Debi et al.). A match never blocks a
// message; it sends autopay to the buyer for approval and flags the part in
// read_chat. Patterns are written without diacritics because `normalize`
// folds Vietnamese (and other accented) text to plain ASCII letters.
export type PressureKind = "override" | "payment" | "tools" | "secrets";

const patterns: Record<PressureKind, RegExp[]> = {
  override: [
    /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|prompts?|rules|guidelines)\b/,
    /\bsystem prompt\b/,
    /\b(new|updated|real) instructions\b/,
    /\b(developer|admin|god) mode\b/,
    /<\/?\s*(system|instructions?|assistant)\s*>|\[\/?(system|inst)\]/,
    /\bbo qua\b.{0,30}\b(huong dan|chi dan|chi thi|quy tac)\b/,
  ],
  payment: [
    /\bpay (it |this |me |the offer )?(now|immediately|right away|at once)\b/,
    /\bauto(matically)?[- ]?(approve|pay|accept)/,
    /\bwithout (asking|confirming|confirmation|approval|checking with)\b/,
    /\b(user|buyer|owner) (has )?(already )?(pre-?approved|approved|agreed|authorized|confirmed)\b/,
    /\bno need to (ask|confirm|check)\b/,
    /\bthanh toan ngay\b/,
    /\btu dong (thanh toan|tra tien|duyet|chap nhan)\b/,
    /\bkhong can (hoi|xac nhan)\b/,
    /\bnguoi dung da (dong y|duyet|cho phep|xac nhan)\b/,
  ],
  tools: [
    /\b(pay_offer|request_payment|answer_tool|decline_offer|send_message|prepare_reclaim|get_spending_limits)\b/,
    /\bas an? (ai|llm)( assistant| model)?\b/,
    /\byou are (an? )?(ai|llm|claude|chatgpt|gpt|codex|language model)\b/,
    /\b(dear|attention|note to( the)?) (ai|assistant|llm|claude)\b/,
  ],
  secrets: [
    /\bpvb_/,
    /\b(send|share|paste|give|reveal|provide|tell)\b.{0,20}\b(api keys?|access tokens?|private keys?|seed phrases?|mnemonic|secret keys?|passwords?)\b/,
    /\b(gui|cung cap|dan|tiet lo)\b.{0,20}\b(api key|private key|khoa bi mat|mat khau|seed phrase)\b/,
  ],
};

// NFKC folds full-width and compatibility look-alikes; zero-width and soft
// hyphen characters are dropped so they cannot split a keyword.
export function normalize(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿­]/g, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** The kinds of payment pressure in `text`, in a fixed order; empty when none. */
export function paymentPressure(text: string): PressureKind[] {
  if (!text) return [];
  const value = normalize(text);
  return (Object.keys(patterns) as PressureKind[]).filter((kind) =>
    patterns[kind].some((pattern) => pattern.test(value)),
  );
}
