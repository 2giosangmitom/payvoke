# T001 — Baseline repo Payvoke

## Mốc và phạm vi

- Khảo sát ngày 20/10/2026 (UTC), trên commit `d14bd98c6854284f195d3b6be9be7007f9ae51ac`.
- Working tree sạch trước và sau khi chạy checks, trước khi thêm tài liệu T001.
- Chỉ kiểm kê và chạy checks hiện có; không sửa implementation, dependencies, lockfile hoặc format để che lỗi.
- PASS dưới đây chỉ chứng minh phạm vi của từng lệnh, không có nghĩa marketplace dùng được.

## Môi trường

| Thành phần | Khai báo                                          | Thực tế                        |
| ---------- | ------------------------------------------------- | ------------------------------ |
| OS         | Chưa quy định                                     | Linux `7.2.11-arch1-1`, x86_64 |
| Node       | `24` trong `mise.toml`                            | `v24.22.0`                     |
| pnpm       | `12` trong `mise.toml`, `^12` trong root manifest | `12.14.0`                      |
| Workspace  | `apps/*`, `packages/*`                            | Root và 3 workspace packages   |

Các phiên bản cài thực tế từ `pnpm list -r --depth 0`:

| Khu vực  | Dependencies chính                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Root     | oxfmt 0.73.0, oxlint 1.88.0                                                                                      |
| Backend  | Fastify 5.12.7, Prisma/client/adapter-pg 7.10.1, pg 8.23.1, tsx 4.23.15, TypeScript 7.0.2, @types/node 26.6.5    |
| Frontend | React/react-dom 19.3.1, react-router 1.170.45, react-start 1.169.3, Vite 8.3.4, Tailwind 4.3.3, TypeScript 7.0.2 |
| Vault    | Hardhat 3.20.0, toolbox-viem 5.0.7, ignition 3.1.9, viem 2.57.7, forge-std 1.16.2, TypeScript 6.0.3              |

Manifest đa số dùng khoảng version; đây không phải bằng chứng đã pin đầy đủ theo T005. `pnpm-lock.yaml` hiện có được giữ nguyên. Khảo sát dùng `node_modules` đã cài; chưa chứng minh clean install trên máy mới hoặc môi trường khác.

## Kiểm kê implementation

| Đường dẫn                                                           | Phân loại và giới hạn                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/src/app.ts`                                           | Skeleton: khởi tạo Fastify với logger, chưa đăng ký route/plugin nghiệp vụ. Có dependency auth/CORS/Swagger không đồng nghĩa đã tích hợp.                                                                                               |
| `apps/backend/src/server.ts`                                        | Entry point gọi `app.listen()`; chưa có config boot, health/readiness hoặc shutdown riêng. Smoke test bên dưới dùng app với loopback/port động, không chứng minh cấu hình entrypoint deployment.                                        |
| `apps/backend/prisma/schema.prisma`                                 | Schema thực có **64 models, 40 enums**; datasource PostgreSQL, generator `prisma-client`, output `apps/backend/src/generated/prisma`. Chưa có thư mục migrations hoặc generated client được track.                                      |
| `apps/backend/prisma7.config.ts`                                    | Đọc `DATABASE_URL`, khai báo đường dẫn migrations. Tên config phải được truyền rõ qua `--config prisma7.config.ts` trong lệnh kiểm tra này.                                                                                             |
| `packages/payvoke-vault/contracts/Counter.sol`                      | Counter sample, không phải PayvokeVault.                                                                                                                                                                                                |
| `packages/payvoke-vault/contracts/Counter.t.sol`, `test/Counter.ts` | 3 Solidity sample tests (gồm fuzz) và 2 TypeScript sample tests. Chưa có tests cho ledger/grants/holds/refunds.                                                                                                                         |
| `packages/payvoke-vault/hardhat.config.ts`                          | Solidity 0.8.34; simulated L1/OP và HTTP Sepolia sample. Chưa có cấu hình Fuji triển khai sản phẩm.                                                                                                                                     |
| `packages/payvoke-vault/ignition/modules/Counter.ts`                | Deployment module cho Counter, chưa deploy trong T001.                                                                                                                                                                                  |
| `packages/payvoke-vault/scripts/send-op-tx.ts`                      | Sample giao dịch trên simulated OP; không phải luồng thanh toán Avalanche Fuji. Không chạy trong T001.                                                                                                                                  |
| `apps/frontend/src/routes/index.tsx`                                | Skeleton chỉ hiển thị “This is home page”; chưa có marketplace/payment UI.                                                                                                                                                              |
| `apps/frontend/src/routeTree.gen.ts`                                | File route sinh tự động đã được track; không chỉnh tay để xử lý lint warning.                                                                                                                                                           |
| `docs/specs/fixtures/x402-v1.json`                                  | Fixture hashing/chữ ký EIP-712, dùng public Hardhat test key và snapshots marker. Không phải input nghiệp vụ hợp lệ hoặc deployment config. Không thấy runner kiểm chứng fixture được track; không chạy lại hashing/signing trong T001. |
| `docs/specs`, `docs/modules`, `GLOSSARY.md`                         | Đặc tả và thuật ngữ, không phải bằng chứng implementation.                                                                                                                                                                              |
| `compose.yml`                                                       | PostgreSQL 18 test local tại `127.0.0.1:55433`, tmpfs, không bền vững. Giữ nguyên nhưng không khởi động trong T001.                                                                                                                     |

Schema có ghi rõ các bounds, state transitions, immutable snapshots và actor XOR còn cần application logic/SQL checks khi triển khai. `prisma validate` không chứng minh các bất biến đó đã được thực thi trong database.

Chưa có packages protocol/client hoặc app MCP. Chưa có backend/frontend test suites hay CI được track. Root chỉ có `fmt`, `lint`, `lint:fix`; backend chỉ có `dev`; frontend có `dev`, `build`; vault chưa khai báo scripts. Không dùng lệnh recursive test để suy diễn rằng mọi workspace đã được test.

## Checklist tái hiện

Từ repo root, với đúng runtime và dependencies đã cài:

```sh
git rev-parse HEAD
git status --short
node --version
pnpm --version
uname -srm
pnpm list -r --depth 0
```

Nếu clone mới, bước chuẩn bị dự kiến là `pnpm install --frozen-lockfile`; bước clean install này chưa được chạy trong T001. Không nâng cấp hoặc sửa lockfile khi tái hiện baseline. Chạy từng check bên dưới riêng và ghi exit code; một check fail không được che bằng check chạy sau.

| Check / lệnh từ repo root                                               | Trạng thái      | Exit | Bằng chứng                                                                                                                                          |
| ----------------------------------------------------------------------- | --------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec oxfmt --check`                                               | FAIL            | 1    | Kiểm tra 46 files; phát hiện format issue ở `pnpm-workspace.yaml`.                                                                                  |
| `pnpm lint`                                                             | PASS có warning | 0    | `oxlint`: `createStart` import không dùng tại `apps/frontend/src/routeTree.gen.ts:60`.                                                              |
| `pnpm --filter backend exec tsc --noEmit`                               | FAIL            | 1    | `thread-stream@4.2.0/index.d.ts:96:73`, TS2694: `worker_threads` không export `TransferListItem`. Chưa chẩn đoán hoặc sửa tương thích dependencies. |
| `pnpm --filter frontend exec tsc --noEmit`                              | PASS            | 0    | Không diagnostics. Frontend config có `skipLibCheck: true`; không tương đương mức kiểm tra declaration của backend.                                 |
| `pnpm --filter backend exec prisma validate --config prisma7.config.ts` | PASS            | 0    | Schema hợp lệ; không kết nối DB, không chạy migration.                                                                                              |
| `pnpm --dir packages/payvoke-vault exec hardhat compile`                | PASS            | 0    | Compile 2 Solidity files bằng solc 0.8.34, EVM target `osaka`.                                                                                      |
| `pnpm --dir packages/payvoke-vault exec tsc --noEmit`                   | PASS            | 0    | Chạy sau compile; không diagnostics.                                                                                                                |
| `pnpm --dir packages/payvoke-vault exec hardhat test`                   | PASS            | 0    | **5 passing:** 3 Solidity, 2 nodejs; fuzz test chạy 256 lượt. Chỉ Counter sample.                                                                   |
| `pnpm --filter frontend build`                                          | PASS            | 0    | Build client và SSR thành công, 134/111 modules transformed. Chưa chứng minh frontend deployment hoặc E2E.                                          |
| Backend HTTP smoke bên dưới                                             | PASS            | 0    | Listen thành công trên loopback/port động, GET `/` trả JSON 404, sau đó đóng server.                                                                |
| Kết nối Neon, migrations và DB integration                              | BLOCKED         | —    | Chờ chủ dự án cung cấp URL test Neon và môi trường DB cô lập; chưa có migrations/integration suite.                                                 |
| Backend/frontend tests nghiệp vụ, Fuji E2E                              | CHƯA CÓ SUITE   | —    | Không tính là pass.                                                                                                                                 |

Backend smoke (lệnh đã chạy; không dùng watch, không cần DB, không giữ server chạy):

```sh
pnpm --filter backend exec tsx --eval 'import app from "./src/app.ts"; (async () => { try { const address = await app.listen({ host: "127.0.0.1", port: 0 }); const response = await fetch(address + "/"); console.log(JSON.stringify({ status: response.status, body: await response.json() })); if (response.status !== 404) process.exitCode = 1; } finally { await app.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });'
```

Body quan sát được: `{"message":"Route GET:/ not found","error":"Not Found","statusCode":404}`. Đây chỉ là bằng chứng HTTP skeleton phản hồi, không phải endpoint health hoặc readiness DB. Khi tái hiện, đặt timeout ngoài tiến trình khoảng 30 giây để tránh treo nếu startup/shutdown gặp lỗi.

## Database: hướng Neon và ranh giới an toàn

- Chủ dự án sẽ cung cấp URL Neon cloud sau; T001 không yêu cầu Docker hoạt động và không truy cập DB bên ngoài.
- Không tạo `.env`, không tìm/in credential, không chạy `db push`, `migrate`, reset hoặc seed.
- Docker local được giữ làm tùy chọn cho phát triển API; chưa kiểm tra Docker/Compose hoặc khởi động/dừng container. Không xóa `compose.yml` trong task kiểm kê.
- Khi có URL, cần xác nhận branch/database riêng cho test và cách kết nối phù hợp cho runtime/migration trước khi chạy thao tác ghi. Không dùng DB dùng chung hoặc deployment làm DB có thể reset.
- Việc nhận URL không tự hoàn tất T007: vẫn cần migration/reset/seed an toàn và bằng chứng isolation, dù dùng Neon hay PostgreSQL local.

## Tác dụng phụ và bàn giao

- Hardhat sinh `artifacts/`, `cache/`; frontend build sinh `dist/` và có thể cập nhật generated routes/cache. Các output đã được ignore hoặc không làm thay đổi tracked files trong lần chạy này.
- Sau checks, `git status --short --untracked-files=all` vẫn sạch. Không xóa sample, không sửa nguồn, không thay lockfile, không tạo migration, không deploy và không dùng RPC/key thật.
- T003/T004: config có schema, fail startup và phân biệt test-local/Fuji; quyết định cấu hình Neon an toàn.
- T005: kiểm tra tương thích artifact/dependency, gồm lỗi declaration backend; chưa kết luận cách sửa.
- T006: scripts checks rõ ràng và xử lý lỗi format/lint theo phạm vi task; không dùng `fmt` hoặc `lint:fix` để khảo sát read-only.
- T007: database test cô lập, migrations và fixtures; cập nhật cách vận hành theo Neon sau khi có URL.
- T008: CI chạy checks, không biến thiếu suite thành thành công.

T001 hoàn tất ở mức **baseline được ghi nhận và tái hiện bằng lệnh cụ thể**, không phải tất cả checks xanh. Clean install, DB integration, chữ ký Solidity/TS và luồng thanh toán Fuji vẫn chưa được chứng minh.
