# M10 · PayvokeVault

**PayvokeVault** là smart contract giữ USDC testnet của buyer trên Avalanche Fuji C-Chain. Địa chỉ USDC được cố định khi triển khai: `0x5425890298aed601595a70AB815c96711a31Bc65` (6 chữ số thập phân); không nhận token khác cùng tên, USDC.e hoặc AVAX. [Địa chỉ USDC Fuji theo Avalanche](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/04-x402-on-avalanche/02-network-setup). Contract ghi số dư theo ví, thu USDC cho từng lần gọi, giữ tiền chờ giao hàng, hoàn tiền và trả provider. Nạp USDC không mua trước số lượt.

## Nạp và giới hạn chi

Buyer ký giao dịch nạp USDC bằng ví. Có thể cần thêm giao dịch `approve`; không mặc định dùng `permit`. Buyer đăng ký khóa phiên do client tạo, kèm giới hạn chi bằng USDC: tối đa mỗi lần gọi, tối đa trong một khoảng thời gian và thời điểm hết hạn. Khóa riêng nằm ở client, không đưa cho Payvoke. Chỉ ví buyer được tăng giới hạn hoặc thay khóa; buyer có thể giảm giới hạn hoặc thu hồi khóa bất cứ lúc nào. Đăng nhập ví không tự cấp quyền chi.

[S02](../specs/02-x402-and-vault.md) cụ thể hóa grantId/epoch, fixed-period cap và total cap hữu hạn, typed-data, ABI, decision signature và vectors. Grant không phải sessionId của phiên chat/tool. Cập nhật/thu hồi invalidate authorization cũ chưa settle; không reset spending counters khi hoàn tiền hoặc sửa grant. Tổng cap của nhiều grant không tự gộp thành cap toàn ví.

Khóa phiên ký chứng từ x402 tự động khi buyer gửi từng yêu cầu; ví chính không phải hiện hộp thoại ký. Payvoke chỉ chuyển chứng từ tới contract, không được tự trừ tiền khi thiếu chữ ký hợp lệ. Nếu khóa phiên bị lộ, kẻ khác vẫn có thể chi trong giới hạn đã cấp; buyer cần thu hồi khóa và rút phần tiền khả dụng. Giao diện phải nói rõ phạm vi này trước khi buyer bật chi tự động.

## Trừ, hoàn và rút

Mỗi khoản thu ghi mã lần gọi duy nhất, ví buyer, provider nhận tiền, giá gộp, tỷ lệ phí nền tảng và hạn giữ tiền. Chứng từ khóa phiên ký phải ràng buộc mã lần gọi, báo giá, provider, giá, phí, hạn dùng, Fuji và địa chỉ vault. Contract kiểm tra chữ ký, đủ số dư, còn quyền chi, không vượt giới hạn và mã chưa dùng; sau đó chuyển tiền từ số dư khả dụng sang khoản đang giữ của lần gọi. Tỷ lệ phí phải nằm dưới trần công bố và được khóa cho lần gọi đó. Chỉ sau khi giao dịch được xác nhận, Payvoke mới giao việc cho provider.

Theo quyết định hợp lệ, khoản đang giữ được hoàn về số dư buyer hoặc giải ngân. Phí Payvoke tính trên **giá gộp trừ phần đã hoàn**; doanh thu provider bằng phần đó trừ phí Payvoke. Contract ghi riêng hai số dư này và chỉ cho từng bên rút phần của mình. Không thu trùng, hoàn quá tiền đã giữ hoặc giải ngân hai lần. Buyer tự rút số dư khả dụng về chính ví của mình; tạm dừng thu mới không được khóa quyền rút đó.

Mỗi lần gọi có thời điểm sớm nhất được giải ngân và hạn xử lý cuối cùng, cố định khi thu tiền. Buyer có thể đánh dấu tranh chấp trước khi giải ngân để chặn payout tự động; bên giải quyết tranh chấp chỉ được hoàn hoặc giải ngân theo số tiền còn giữ. Nếu hết hạn xử lý mà chưa có quyết định, buyer được tự lấy lại phần còn giữ. Contract không tự biết provider đã giao hàng; quyết định nghiệp vụ vẫn thuộc M09.

## Phí gas

Mặc định buyer trả gas bằng AVAX khi `approve`, nạp, đăng ký khóa phiên và rút tiền. Payvoke trả gas cho giao dịch x402 `settle` trừ tiền mỗi lần gọi, hoàn tiền và giải ngân do mình gửi. Provider trả gas khi tự rút doanh thu. Payvoke phải theo dõi chi phí gas so với phí thu được trên mỗi lần gọi. Đây là chính sách vận hành, không phải quy tắc EVM bắt buộc: muốn Payvoke tài trợ gas nạp/rút phải xây thêm luồng chữ ký và relayer/paymaster, kiểm tra token cùng ví hỗ trợ; phí đó lấy từ ngân sách nền tảng, không âm thầm trừ số dư buyer. [OpenZeppelin về permit](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20) và [tài trợ gas](https://docs.openzeppelin.com/contracts/5.x/account-abstraction).

## Quyền vận hành

Contract dùng OpenZeppelin Contracts phiên bản khóa cố định: `SafeERC20` cho USDC, `EIP712`/`SignatureChecker` cho chứng từ, `ReentrancyGuard` cho đường chuyển tiền, `Pausable` chỉ chặn thu mới, `AccessControlDefaultAdminRules` và multisig/timelock cho quyền quản trị. Quyền relay thu tiền, quyết định hoàn, giải ngân và tạm dừng tách riêng; mỗi thay đổi phát event. Đổi quyền và trần phí phải có thời gian chờ; khóa vận hành bị lộ có thể dừng thu mới. Không có hàm rút tùy ý số dư buyer hay nâng cấp contract tùy ý. [Chữ ký EIP-712](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography), [quyền quản trị](https://docs.openzeppelin.com/contracts/5.x/access-control), [chống tái nhập và tạm dừng](https://docs.openzeppelin.com/contracts/5.x/api/utils).

Trước khi cho nạp USDC testnet, kiểm thử bất biến tổng số dư phải khớp USDC contract đang giữ, hạn mức không thể bị vượt, khoản giữ không thể chi hai lần, tranh chấp chặn payout và quyền rút vẫn hoạt động khi dừng thu. Cần fuzz test, rà soát độc lập và diễn tập mất khóa. Bản triển khai chỉ trên Fuji; địa chỉ contract, mã nguồn, địa chỉ USDC, tỷ lệ/trần phí và quyền vận hành phải công khai trước khi buyer nạp.
