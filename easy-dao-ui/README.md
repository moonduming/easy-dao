# easy-dao UI

基于 React、TypeScript 和 Vite 的 DAO 交互前端，用于查看 Realm 与 Governance 状态、管理提案，以及进行签名和投票。合约与治理流程说明见[项目 README](../README.md)。

## 运行准备

- 安装 Node.js 和 npm，并在仓库根目录安装项目依赖。
- 在仓库根目录运行 `anchor build`，生成前端引用的 `target/idl/easy_dao.json` 和 `target/types/easy_dao.ts`。
- 在目标网络部署合约并初始化 Realm、社区代币及治理账户。
- 准备目标网络上的钱包和测试余额；前端配置了 Solflare 钱包适配器。

## 网络与账户配置

启动前检查以下文件：

| 文件 | 配置 |
| --- | --- |
| [src/App.tsx](src/App.tsx) | 钱包连接的 RPC endpoint 和钱包适配器网络，当前使用 Devnet |
| [src/anchor.ts](src/anchor.ts) | 合约 provider 的 `NETWORK`、`PROGRAM_ID`、`REALM_PDA` 和 `REALM_MINT` |

`src/anchor.ts` 中的 `NETWORK` 当前为 `http://127.0.0.1:8899`。需将两处 RPC 配置及钱包网络统一到同一目标网络；连接 Devnet 时将 `NETWORK` 改为对应的 Devnet RPC，使用本地验证器时则调整 `src/App.tsx` 的连接配置。

将 Realm 和社区代币地址替换为目标网络上的实际地址。`GOVERNANCE_PDA` 由 `REALM_PDA` 和 `PROGRAM_ID` 派生，需要对应的治理账户已初始化。确认 Program ID 与构建生成的 IDL 及部署一致。

## 本地启动

在仓库根目录运行：

```bash
cd easy-dao-ui
npm install
npm run dev
```

打开 Vite 输出的本地地址并连接钱包。

## 开发命令

在本目录运行：

```bash
npm run build
npm run lint
npm run preview
```

`preview` 用于预览构建产物，需先完成 `build`。提案、签名和投票操作受链上账户状态、治理规则及钱包权限约束。
