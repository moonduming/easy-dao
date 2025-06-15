import { useEffect, useState, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import {
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { SignAndVotePage } from "./components/signAndVote";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./App.css";


import { getProgram, REALM_PDA, GOVERNANCE_PDA } from "./anchor";
import ProposalManager from "./components/ProposalManager";

// 地址缩略显示组件
function ShortPubkey({ address }: { address: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);

  if (!address) return null;

  const short = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <>
      <span
        style={{ cursor: "pointer", userSelect: "none" }}
        title={address}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setShowModal(true)}
      >
        {isHovered ? address : short}
      </span>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f1120",
              padding: "24px 32px",
              borderRadius: 8,
              maxWidth: "90%",
              wordBreak: "break-all",
              textAlign: "center",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>完整地址</h3>
            <p
              style={{
                fontFamily: "monospace",
                margin: "16px 0 24px",
                wordBreak: "break-all",
              }}
            >
              {address}
            </p>
            <button
              style={{
                padding: "6px 18px",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 600,
                marginRight: 12,
              }}
              onClick={() => navigator.clipboard.writeText(address).catch(() => {})}
            >
              复制到剪贴板
            </button>
            <button
              style={{
                padding: "6px 18px",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 600,
              }}
              onClick={() => setShowModal(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---- 钱包配置 ----
const endpoint = clusterApiUrl(WalletAdapterNetwork.Devnet);
const useWalletAdapters = () =>
  useMemo(
    () => [new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet })],
    []
  );

// ---- DAO 信息卡片 ----
function RealmGovernanceInfo() {
  const { wallet, publicKey } = useWallet();

  const [realmInfo, setRealmInfo] = useState<any | null>(null);
  const [govInfo, setGovInfo] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet || !publicKey) return;

    (async () => {
      try {
        setError(null);
        const program = getProgram(wallet.adapter ?? wallet);

        // Realm
        const realm = await program.account.realm.fetch(REALM_PDA);
        setRealmInfo(realm);

        // Governance
        const gov = await program.account.governance.fetch(GOVERNANCE_PDA);
        setGovInfo(gov);
      } catch (e) {
        setError((e as Error).message);
        setRealmInfo(null);
        setGovInfo(null);
      }
    })();
  }, [wallet, publicKey]);

  if (!wallet) {
    return (
      <div className="card text-center">
        <p style={{ color: "#fff" }}>请先连接钱包…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-center accent-title" style={{ marginBottom: 32, letterSpacing: 1.5 }}>
        DAO 状态
      </h2>
      {error && (
        <p style={{ color: "#ff6e6e", textAlign: "center", fontWeight: 600 }}>
          ⚠️ {error}
        </p>
      )}

      <h3 className="text-center accent-title" style={{ marginTop: 20 }}>Realm 账户</h3>
      {realmInfo && (
        <>
          <div className="info-row">
            <label>名称:</label>
            <span>{realmInfo.name}</span>
          </div>
          <div className="info-row">
            <label>社区 Mint:</label>
            <ShortPubkey address={(realmInfo.communityMint as PublicKey).toBase58()} />
          </div>
          <div className="info-row">
            <label>Token Account:</label>
            <ShortPubkey address={(realmInfo.communityTokenAccount as PublicKey).toBase58()} />
          </div>
          <div className="info-row">
            <label>Authority:</label>
            <ShortPubkey address={(realmInfo.authority as PublicKey).toBase58()} />
          </div>
          <div className="info-row">
            <label>最小治理权:</label>
            <span>{realmInfo.config.minCommunityWeightToCreateGovernance.toString()}</span>
          </div>
        </>
      )}

      <h3 className="text-center accent-title" style={{ margin: "38px 0 12px" }}>Governance 账户</h3>
      {govInfo && (
        <>
          <div className="info-row">
            <label>活跃提案数:</label>
            <span>{govInfo.activeProposalCount.toString()}</span>
          </div>
          <div className="info-row">
            <label>需要签名者数:</label>
            <span>{govInfo.requiredSignatoriesCount.toString()}</span>
          </div>
          <div className="info-row">
            <label>社区投票门槛:</label>
            <span>
              {govInfo.config.communityVoteThreshold?.percentage ?? "N/A"}%
            </span>
          </div>
          <div className="info-row">
            <label>提案所需最小权重:</label>
            <span>{govInfo.config.minCommunityWeightToCreateProposal.toString()}</span>
          </div>
        </>
      )}
      <div className="mt-24"></div>
    </div>
  );
}

// ---- 主组件 ----
function App() {
  const wallets = useWalletAdapters();

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <main className="page">
            <div className="text-center" style={{ marginBottom: 32 }}>
              <h1>easy-dao UI</h1>
              <WalletMultiButton className="wallet-button" />
            </div>
            <div className="app-grid">
              <RealmGovernanceInfo />
              <ProposalManager />
              <div className="signature-panel">
                <SignAndVotePage />
              </div>
            </div>
          </main>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;