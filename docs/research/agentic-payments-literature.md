# Nghiên cứu agentic payments và x402 áp dụng cho Payvoke

Khảo sát ngày 25/10/2026 qua arXiv. Tài liệu này tóm tắt các paper đã đọc, đối chiếu từng phát hiện với thiết kế và code hiện tại của Payvoke, rồi nêu việc cần làm. Nội dung paper là nguồn bên ngoài: Payvoke dùng làm checklist và động lực thiết kế, không coi kết quả thực nghiệm của họ là bằng chứng cho hệ thống của mình.

Quy ước trạng thái:

- **Local**: đã có code và test chạy local (xem [payment-acceptance](../payment-acceptance.md)); chưa phải bằng chứng Fuji.
- **Thiết kế**: đã có trong đặc tả, chưa có implementation đầy đủ.
- **Đề xuất**: ý tưởng mới rút từ paper, chưa nằm trong đặc tả bắt buộc; task tương ứng ở [roadmap §17](../roadmap.md#17-bổ-sung-từ-nghiên-cứu-25102026).

## 1. Bảo mật facilitator và scheme x402

### 1.1 Tám quy tắc facilitator — [P1] Wang et al., 2607.19545

Paper chia trách nhiệm facilitator thành hai nhóm: _authorization correctness_ (SR1–SR4) và _execution safety_ (SR5–SR8). Họ thử 15 facilitator x402 lớn (hơn 60K seller, 360K buyer) và tìm thấy 49 vi phạm; mọi facilitator vi phạm ít nhất một quy tắc. Từ đó họ rút ra bốn kiểu tấn công: Free Shopping, Asset Theft, Service Denial, Gas Abuse.

| Quy tắc                                                                         | Payvoke                                                                                                                                                        | Trạng thái                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| SR1 — proof phải khớp requirements server công bố                               | `accepted` so với requirements đã persist và `body.quoteId`; mọi field kinh tế/hash phải khớp ([S02 §5.2](../specs/02-x402-and-vault.md#52-payment-signature)) | Local (PAY-07)                                           |
| SR2 — chữ ký payer phải xác thực đúng mô hình chữ ký                            | Grant signer ECDSA; không nhận ERC-6492/counterfactual; contract tái tạo digest                                                                                | Local (PAY-02/03)                                        |
| SR3 — từ chối authorization hết hạn                                             | `validUntil` tuyệt đối, kiểm tra cả ở facilitator lẫn contract                                                                                                 | Local (PAY-05)                                           |
| SR4 — chỉ báo thành công khi đã settle onchain                                  | Finality gate: receipt + `HoldReserved` + `getHold` ở finalized state; pending không `success:true`                                                            | Local (PAY-09/10)                                        |
| SR5 — fail fast với payment vô nghĩa kinh tế hoặc không thể settle; idempotency | `grossAmount` dương, nằm trong cap; preview grant/balance + simulation trước khi ký tx; consume-once theo `invocationKey`                                      | Local, nhưng **chưa có giá sàn so với gas**; đề xuất R02 |
| SR6 — giới hạn gas/phí do sponsor trả                                           | `GAS_MAX_LIMIT`, `GAS_MAX_FEE_PER_GAS`, `GAS_MAX_TRANSACTION_COST`, cửa sổ chi phí (`worker-config.ts`)                                                        | Local (PAY-08); ngân sách AVAX thật chờ T089             |
| SR7 — settle phải kiểm tra lại, không tin verify trước đó                       | `settle` chạy lại đầy đủ checks của `verify` ([S02 §6.3](../specs/02-x402-and-vault.md#63-private-facilitator))                                                | Local                                                    |
| SR8 — chỉ settle ngữ nghĩa onchain đã allowlist                                 | Settlement signer chỉ ký `reserveHold` trên đúng vault/network; không nhận calldata tùy ý                                                                      | Local                                                    |

Ba hướng giảm thiểu paper đề xuất đều đã là nguyên tắc của S02: (1) ràng buộc verify với settle; (2) coi mọi field client gửi là input thù địch, dùng allowlist và transaction shape cố định; (3) giới hạn chi phí sponsor theo mặc định.

### 1.2 Năm bất biến và bốn lớp lỗi — [P2] Ling et al., 2605.30998

Paper đặt năm bất biến: I1 payment integrity, I2 value consistency, I3 context binding, I4 authorization uniqueness, I5 execution conservation. Bốn lớp lỗi tìm được:

| Lỗi                                     | Nguyên nhân trong x402 `exact`/`upto`                                    | Payvoke                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Cross-resource substitution (I3)     | Chữ ký EIP-3009 gắn payee/value nhưng không gắn resource                 | `InvocationQuote` ký `invocationKey`, `quoteKey`, `inputHash`, `termsHash`, `commandKey`; resource cố định `POST /v1/invocations`. Một chữ ký không mở được invocation khác. **Local** |
| F2 Duplicate-settlement race (I4)       | Facilitator không có trạng thái pending, nhiều request dùng cùng nonce   | Durable operation + CAS theo `invocationKey`; contract consume-once. Có test hai submit đồng thời. **Local**                                                                           |
| F3 Allowance overdraft trên `upto` (I2) | Verify chỉ kiểm tra snapshot allowance, settle chuyển số thực tế         | Không dùng `upto`. Giá cố định; cap grant được kiểm tra và cộng dồn atomically trong `reserveHold`                                                                                     |
| F4 Denial of settlement (I1, I5)        | Server chạy công việc trước, settle sau; client rút allowance giữa chừng | Flow `upfront`: chỉ phát việc cho provider sau khi hold đã finalized                                                                                                                   |

Paper còn chứng minh F5: với dịch vụ có "hidden compute" (thinking tokens), không cách tính giá chỉ theo output nào vừa công bằng với người dùng trung thực vừa chống được việc thổi phồng token ẩn; khoảng thao túng ước tính 35–3.213× trên 10 model. Đây là căn cứ học thuật cho quyết định **giá cố định theo command revision** của [M03](../modules/03-per-use-pricing.md).

### 1.3 Năm tấn công và sáu biện pháp — [P3] Li, Wang, Wang, 2605.11781

Paper coi header payment là một _bearer capability_ có thể bị replay hoặc cache. Sáu biện pháp:

| Biện pháp                                                                 | Payvoke                                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M1 Typed encoding chuẩn + nonce/timestamp                                 | EIP-712 + JCS; vectors và mutation tests (P). **Local**                                                  |
| M2 Settlement gắn với facilitator được ủy quyền                           | `reserveHold` chỉ gọi được bởi `RELAYER_ROLE`; header bị lộ cũng không tự settle được. **Local**         |
| M3 Grant dùng một lần + gắn resource                                      | Consume-once theo invocation; quote thuộc đúng buyer/thread. **Local**                                   |
| M4 Two-phase: chỉ giao sau reserve hoặc đủ finality                       | Finality gate trước `HELD` và outbox. **Local**                                                          |
| M5 Response có `Cache-Control: no-store`, cô lập header                   | Quote/payment/auth trả `no-store`. Header không được log. **Local**; cần test proxy/CDN khi deploy (R01) |
| M6 Chống steering ở lớp discovery (metadata giả, Sybil, prompt injection) | **Một phần**: metadata provider coi là dữ liệu không tin cậy; store chưa có xếp hạng chống Sybil (R06)   |

### 1.4 Phân tích hình thức bốn giao thức — [P4] Jiang et al., 2609.00060

Họ mô hình hoá x402, MPP, ACP và AP2 bằng Tamarin (529 lemma), tìm 40 phát hiện mới và gom thành 18 nguyên tắc P1–P18. Các nguyên tắc Payvoke dùng làm checklist kiểm thử:

- **P1 Complete Terms Binding** và **P15 Tool Invocation Accountability**: mọi vai trò (buyer, facilitator, vault, provider) cùng nhìn một context. Payvoke dùng `quoteDigest` và snapshots làm context chung.
- **P3 Single Payment, Single Effect**: một invocation, một hold, một logical ready event.
- **P4 Pay–Service–Compensation Correspondence**: hold, delivery, refund, release cùng tham chiếu một `holdId`.
- **P5 Settlement and Finality Soundness**: không giao dựa trên trạng thái mempool.
- **P8 Budget and Metering Conservation**: cap grant và bất biến kế toán của vault.
- **P13 Cost DoS Safety**: thao tác đắt (ký/broadcast) chỉ chạy sau admission checks.
- **P14 Agent Intent Preservation**: MCP bridge cần approval ngoài model ([S03](../specs/03-mcp-client.md)).
- **P16 Sensitive Payment-Artifact Disclosure**: không log signature, token, signed URL.
- **P17 Credential Lifecycle**: revoke grant tăng epoch; API token và grant thu hồi độc lập.

### 1.5 PII trong metadata thanh toán — [P5] Stantchev, 2604.11430

Trong x402 thông thường, `resource_url`, `description`, `reason` đi dạng plaintext tới server và facilitator trước khi settle. Paper xây middleware lọc PII (micro-F1 0,894, p99 5,73 ms).

Payvoke: header `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE` chỉ chứa ID opaque, hash snapshot và `description: "Payvoke invocation"` cố định (`gateway.ts`). Prompt, file và câu trả lời buyer không đi qua header hay facilitator. Cần một test hồi quy bảo đảm điều này không bị phá (R01).

### 1.6 Đo lường: số settlement không phải adoption — [P6] Ling et al., 2607.12575

Trên Base trong 280 ngày: 136,7 triệu settlement (44,1 triệu USD), nhưng 21,20% là giả (tự trả cho chính mình hoặc cụm đóng) và 63,78% là thanh toán nội bộ trong cụm ví liên kết; Gini của payer, payee và giá trị đều trên 0,98. Lý do: facilitator trả gas nên tạo giao dịch gần như miễn phí.

Payvoke cũng trả gas cho `reserveHold`. Vì vậy store và Studio **không được dùng số invocation thô làm chỉ số uy tín**; xem [M09](../modules/09-reputation-and-operations.md) và R05.

## 2. Verify-then-pay và bằng chứng giao hàng

### 2.1 TessPay — [P7] Goenka, Pathak, Asthana, 2602.00213

Kiến trúc hai plane: control/verification tách khỏi settlement. Tiền nằm trong escrow; executor "câm" chỉ gọi `settle()` khi có Proof of Task Execution (PoTE) đã được neo hash. Họ chia ba tier rủi ro: tier thấp chấp nhận batch và rủi ro dispute; tier trung bình cần PoTE đầy đủ; tier cao cần nhiều witness.

Payvoke đã có đúng hình dạng này: hold → `VERIFYING` → quyết định finance được ký bởi approver tách khỏi executor. Thứ còn thiếu là verifier thật (PAY-13 hiện là **Partial**).

### 2.2 RAILS — [P8] de Valois-Franklin, Bogdan, 2606.08790

Bảy primitive: Obligation Object, Evidence Envelope, Verification Mesh, Clearing Decision, Settlement Instruction, Clearing Passport, Finality Rules. Bất biến soundness: không settlement nào có giá trị tài chính được dựa trên bằng chứng dưới _admissibility floor_ của obligation. Lớp bằng chứng là thứ tự từng phần:

```text
SELF ≼ SIGN ≼ {WIT, REC} ≼ ATT ≼ PROOF
```

(SELF: provider tự báo; SIGN: provider ký; WIT: nhân chứng thứ ba; REC: biên nhận từ hệ thống ngoài không có lợi ích; ATT: attestation TEE; PROOF: chứng minh mật mã.)

Áp dụng cho Payvoke (Đề xuất R03/R04): command revision khai báo mức bằng chứng tối thiểu; M05 ghi nhận mức bằng chứng thực tế cho từng artifact version; finance chỉ release khi mức thực tế ≥ mức tối thiểu. Xem [M05](../modules/05-artifacts-and-verification.md).

### 2.3 A402 — [P9] Li et al., 2603.01179

Atomic Service Channels dùng adaptor signature có TEE hỗ trợ để bảo đảm "trả tiền khi và chỉ khi dịch vụ chạy đúng và kết quả được giao", đồng thời gộp nhiều lần settle thành một giao dịch. Ngoài phạm vi MVP (roadmap §15 đã loại payment channel/TEE), ghi lại làm hướng giảm gas sau Fuji; xem [M10](../modules/10-payvoke-vault.md).

## 3. Phía buyer: ra quyết định, gian lận, prompt injection

### 3.1 402Pilot — [P10] Li et al., 2608.01341

Lớp quyết định phía buyer chọn provider dưới "wallet pressure" bằng Thompson sampling có chiết khấu (PA-DCT); chỉ tiêu 39–43% ví mà chất lượng vẫn cạnh tranh. Reward: `r = (1 − λ)·u − λ·c̃`, trong đó λ tăng khi chi tiêu vượt kế hoạch.

Áp dụng (Đề xuất R07): MCP bridge hoặc store có thể **gợi ý** app theo rating đã xác minh, giá và hạn mức grant còn lại. Gợi ý chỉ là dữ liệu hiển thị; không được tự chọn, tự ký hay thay approval ngoài model của S03.

### 3.2 Agentic Commerce Bench — [P11] Srivastava, Paul, 2609.35886

Phân loại gian lận theo năm mức quan sát: L0 reasoning của agent, L1 wire, L2 settlement rail, L3 counterparty, L4 principal. Sáu trong 20 lớp gian lận đến từ counterparty "đúng danh tính" nhưng tính quá giá. Tám lớp không phát hiện được tốt hơn ngẫu nhiên. Giá trung vị 0,007 USD nên một lần review thủ công tốn gấp 143 lần giá trị giao dịch.

Payvoke: giá cố định theo revision chặn sẵn kiểu "tính quá giá niêm yết". Tín hiệu còn lại nằm ở L3 (lịch sử provider) và L4 (policy grant). Đề xuất R08: tín hiệu tự động cho dispute và incident, chỉ đưa người duyệt khi vượt ngưỡng giá trị. Xem [M09](../modules/09-reputation-and-operations.md).

### 3.3 Prompt injection vào AP2 — [P12] Debi, Zhu, Sen Gupta, 2601.22569

Mandate có chữ ký bảo đảm _thực thi_ đúng, nhưng không bảo đảm _quyết định_ đúng: Branded Whisper Attack đạt 100% thành công trong việc thao túng xếp hạng sản phẩm qua nội dung mô tả; Vault Whisper Attack làm lộ dữ liệu người dùng khác.

Payvoke đã tách quyết định chi tiền khỏi model ([S03 §1](../specs/03-mcp-client.md)): `confirmed:true` không phải approval, mô tả command và output provider là dữ liệu không tin cậy. Paper củng cố hai yêu cầu: (1) catalog/metadata provider không được dùng làm chỉ dẫn cho model; (2) xếp hạng store không được phụ thuộc vào văn bản do provider tự viết.

## 4. Reputation và credential

### 4.1 LEGIT — [P13] Drew, Zhou, 2609.21325

Credential ký số gắn chất lượng và chi phí đo được với _đúng cấu hình agent_, miền tác vụ và ngân sách đánh giá. Reputation dùng cập nhật Beta có chiết khấu; mỗi danh tính mới phải đặt cọc, nên thao túng reputation bằng Sybil phải khoá vốn tỷ lệ với số danh tính.

Áp dụng (Đề xuất R05/R06): rating gắn với command revision (schema đã có `ProductRating` theo invocation đã giao); điểm hiển thị là posterior có chiết khấu thay vì trung bình thô; cân nhắc yêu cầu provider đặt cọc USDC trước khi được xếp hạng công khai.

## 5. Tổng hợp việc cần làm

| ID  | Việc                                                                                                   | Nguồn        | Module   |
| --- | ------------------------------------------------------------------------------------------------------ | ------------ | -------- |
| R01 | Bộ conformance test theo SR1–SR8, F1–F4, M1–M6, gồm test không lộ PII/prompt trong header và log       | P1–P5        | M06, S02 |
| R02 | Policy giá sàn mỗi command so với chi phí gas `reserveHold` + release                                  | P1 (SR5), P6 | M03, M06 |
| R03 | `terms.verification` khai báo mức bằng chứng tối thiểu theo lớp SELF→PROOF                             | P7, P8       | M05, S01 |
| R04 | Finance chỉ release khi mức bằng chứng của artifact đạt mức tối thiểu; Evidence Envelope băm vào hồ sơ | P7, P8       | M05, M06 |
| R05 | Chỉ số store chống số liệu ảo: buyer độc lập đã xác minh, rating posterior theo revision               | P6, P13      | M09, M07 |
| R06 | Xếp hạng store chống Sybil/steering; cân nhắc provider deposit                                         | P3 (M6), P13 | M09      |
| R07 | Gợi ý app theo ngân sách cho MCP/store, chỉ mang tính tư vấn                                           | P10, P12     | M08, S03 |
| R08 | Tín hiệu tự động phân loại dispute/incident theo mức quan sát L2–L4                                    | P11          | M09      |

## Danh mục paper

- [P1] Q. Wang, Y. Yang, Y. Chen, S. Ji, M. Payer. _When HTTP 402 Meets the Blockchain: Risks on Emerging x402 Payments_. arXiv:2607.19545, 2026.
- [P2] S. Ling, Y. Huang, Y. Du, Y. Chen, Y. Zhou, L. Wu, C. Wang. _Free-Riding the Agentic Web: A Systematic Security Analysis of x402 Payments_. arXiv:2605.30998, 2026.
- [P3] Z. Li, Q. Wang, Z. Wang. _Five Attacks on x402 Agentic Payment Protocol_. arXiv:2605.11781, 2026.
- [P4] K. Jiang, M. Yu, Y. Chang, M. K. Jangid, J. Niu, C. Wang, Y. Zhang. _A Formal Analysis of Agent Payment Protocols_. arXiv:2609.00060, 2026.
- [P5] V. Stantchev. _Hardening x402: PII-Safe Agentic Payments via Pre-Execution Metadata Filtering_. arXiv:2604.11430, 2026.
- [P6] S. Ling, Y. Zhou, L. Wu, C. Wang. _How Agentic Is Agentic Commerce? A Population-Scale Measurement of x402 Adoption and Authenticity_. arXiv:2607.12575, 2026.
- [P7] M. Goenka, T. Pathak, S. Asthana. _TessPay: Verify-then-Pay Infrastructure for Trusted Agentic Commerce_. arXiv:2602.00213, 2026.
- [P8] A. de Valois-Franklin, A. Bogdan. _RAILS: Verification-Native Clearing for Agentic Commerce_. arXiv:2606.08790, 2026.
- [P9] Y. Li, L. Wang, K. Wang, Z. Yang, K. Wang, Z. Guan, J. Gao. _A402: Binding Cryptocurrency Payments to Service Execution for Agentic Commerce_. arXiv:2603.01179, 2026.
- [P10] Y. Li, Y. He, B.-H. Yang, R. Lawana, Z. Li, W. Zeng, J. Tang, F. Tsung. _402Pilot: An x402 Decision Layer for Autonomous Agent Micropayments_. arXiv:2608.01341, 2026.
- [P11] A. Srivastava, D. Paul. _Agentic Commerce Bench: Measuring Fraud Detection for Agents That Spend Money_. arXiv:2609.35886, 2026.
- [P12] T. Debi, W. Zhu, P. Sen Gupta. _Whispers of Wealth: A Systematic Red-Teaming Study of the Agent Payments Protocol (AP2)_. arXiv:2601.22569, 2026.
- [P13] S. Drew, J. Zhou. _LEGIT: Credentialing Protocol for Trustworthy AI Agent Marketplaces_. arXiv:2609.21325, 2026.
