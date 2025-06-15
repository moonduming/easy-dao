import React, { useState, useEffect, useCallback } from 'react';
import { addSignatoryInstruction } from './AddSignatory';
import { finalizeVoteInstruction } from './FinalizeVote';
import { useWallet } from '@solana/wallet-adapter-react';
import { getProgram, REALM_MINT, REALM_PDA } from '../anchor';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { signOffProposalAll } from './SingOffProposal';

const formatDate = (ts?: number | null): string =>
  ts != null ? new Date(ts * 1000).toLocaleString() : 'null';

// 将 Anchor 枚举对象 `{ voting: {} }` ➜ "Voting"
const getProposalStateName = (state: any): string => {
  if (!state || typeof state !== 'object') return 'Unknown';
  return Object.keys(state)[0] ?? 'Unknown';
};

/**
 * 轻量级提案列表
 * - 一次性拉取该 wallet 在指定 Realm 下的所有 Proposal
 * - 点击条目时再拉取详情（占位，后续可扩展）
 */
const ProposalList: React.FC = () => {
  const { wallet, publicKey } = useWallet();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 选中提案用于弹窗详情
  const [selectedProposal, setSelectedProposal] = useState<any | null>(null);
  const selectedStateName = selectedProposal ? getProposalStateName(selectedProposal.data.state) : '';
  const [showAddSignModal, setShowAddSignModal] = useState(false);
  const [newSignatoryAddress, setNewSignatoryAddress] = useState('');
  const [_, setConfirmedSignatoryAddress] = useState<string | null>(null);
  const [addSignLoading, setAddSignLoading] = useState(false);
  const [addSignError, setAddSignError] = useState<string | null>(null);
  const [addSignSuccess, setAddSignSuccess] = useState<string | null>(null);

  const walletContext = useWallet(); // get full WalletContextState
  const [finalizeStatus, setFinalizeStatus] = useState<string | null>(null);
  const [skipStatus, setSkipStatus] = useState<string | null>(null);

  const getStateColor = (state: string) => {
    const s = state.toLowerCase();
    switch (s) {
      case 'draft':
        return '#9e9e9e';
      case 'signingoff':
        return '#ff9800';
      case 'voting':
        return '#42a5f5';
      case 'defeated':
        return '#e57373';
      case 'executing':
        return '#ab47bc';
      case 'executionfailed':
        return '#d32f2f';
      case 'completed':
        return '#66bb6a';
      default:
        return '#9e9e9e';
    }
  };

  /** 主查询逻辑：一次性获取 proposal 列表 */
  const fetchProposals = useCallback(async () => {
    if (!wallet || !publicKey) return;
    setLoading(true);
    setError(null);

    try {
      const program = getProgram(wallet.adapter ?? wallet);

      // 1) governance PDA
      const [governancePda] = PublicKey.findProgramAddressSync(
        [REALM_PDA.toBuffer(), Buffer.from('governance')],
        program.programId,
      );

      // 2) tokenOwnerRecord PDA
      const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('governance'),
          REALM_PDA.toBuffer(),
          REALM_MINT.toBuffer(),
          publicKey.toBuffer(),
        ],
        program.programId,
      );

      const tokenOwnerRecordAccount = await program.account.tokenOwnerRecord.fetch(tokenOwnerRecordPda);

      const proposalCount: number = tokenOwnerRecordAccount.proposalIndex.toNumber();

      const results: any[] = [];

      for (let i = 0; i <= proposalCount; i++) {
        const [proposalPda] = PublicKey.findProgramAddressSync(
          [
            governancePda.toBuffer(),
            tokenOwnerRecordPda.toBuffer(),
            new BN(i).toArrayLike(Buffer, 'le', 8),
          ],
          program.programId,
        );

        try {
          const proposalAccount = await program.account.proposal.fetch(proposalPda);
          results.push({
            pda: proposalPda.toBase58(),
            index: i,
            data: proposalAccount,
          });
        } catch (_) {
          // ignore fetch error (e.g., slot not found)
        }
      }

      setProposals(results);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey]);

  /* 初始加载 & 钱包切换时刷新 */
  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  /* UI */
  return (
    <div
      className="proposal-list-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      <h2 style={{ marginTop: 0 }}>我的提案</h2>

      {loading && <p>加载中...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && proposals.length === 0 && <p>暂无提案</p>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {proposals.map((p) => {
          const stateName = getProposalStateName(p.data.state);
          const badgeColor = getStateColor(stateName);
          return (
            <li
              key={p.pda}
              style={{
                border: '1px solid #233',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 12,
                cursor: 'pointer',
              }}
              onClick={() => setSelectedProposal(p)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>
                  #{p.index} ‧ {p.data.name ?? '(未命名)'}
                </span>
                <span style={{
                  background: badgeColor,
                  color: '#fff',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 12,
                  whiteSpace: 'nowrap'
                }}>
                  {stateName}
                </span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                PDA: {p.pda.slice(0, 4)}…{p.pda.slice(-4)}
              </div>
            </li>
          );
        })}
      </ul>

      {selectedProposal && (
        <div
          onClick={() => setSelectedProposal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f1120',
              padding: '24px 32px',
              borderRadius: 8,
              maxWidth: '90%',
              width: 420,
              color: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>提案详情</h3>
            <p><strong>标题:</strong> {selectedProposal.data.name || '(未命名)'}</p>
            <p><strong>状态:</strong> {getProposalStateName(selectedProposal.data.state)}</p>
            <p><strong>Yes:</strong> {selectedProposal.data.yesVoteWeight.toString()}</p>
            <p><strong>No:</strong> {selectedProposal.data.noVoteWeight.toString()}</p>
            <p><strong>投票开始:</strong> {formatDate(selectedProposal.data.votingStartedAt)}</p>
            <p><strong>投票完成:</strong> {formatDate(selectedProposal.data.votingCompletedAt)}</p>
            <p><strong>提案关闭时间:</strong> {formatDate(selectedProposal.data.closedAt)}</p>
            <p><strong>执行链上指令:</strong> {selectedProposal.data.hasTransaction ? '是' : '否'}</p>
            <p>
              <strong>描述链接:</strong>{' '}
              {selectedProposal.data.descriptionLink ? (
                <a href={selectedProposal.data.descriptionLink} target="_blank" rel="noreferrer">
                  查看
                </a>
              ) : (
                '无'
              )}
            </p>
            <p style={{ fontSize: 12, opacity: 0.75 }}>
              PDA: {selectedProposal.pda}
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
              <button
                style={{ padding: '8px 12px', background: 'var(--c-primary)', color: '#fff', border: 'none', borderRadius: '4px' }}
                disabled={selectedStateName !== 'draft'}
                onClick={() => { setShowAddSignModal(true); setNewSignatoryAddress(''); setConfirmedSignatoryAddress(null); }}
              >
                添加签名人
              </button>
              <button
                style={{
                  padding: '8px 12px',
                  background: 'var(--c-accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                }}
                disabled={selectedStateName !== 'draft'}
              >
                添加执行指令
              </button>
              <button
                style={{
                  padding: '8px 12px',
                  background: '#42a5f5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                }}
              >
                执行指令
              </button>
              <button
                style={{ padding: '8px 12px', background: '#66bb6a', color: '#fff', border: 'none', borderRadius: '4px' }}
                onClick={async () => {
                  setFinalizeStatus('加载中...');
                  const result = await finalizeVoteInstruction(
                    walletContext,
                    new PublicKey(selectedProposal.pda)
                  );
                  if (result.success) {
                    setFinalizeStatus(`完成投票成功: ${result.tx}`);
                    fetchProposals();
                  } else {
                    setFinalizeStatus(`完成投票失败: ${result.error}`);
                  }
                }}
              >
                完成投票
              </button>
              <button
                style={{
                  padding: '8px 12px',
                  background: '#ff9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                }}
                onClick={async () => {
                  setSkipStatus('加载中...');
                  const result = await signOffProposalAll(
                    walletContext,
                    new PublicKey(selectedProposal.pda)
                  );
                  if (result.success) {
                    setSkipStatus(`跳过签名成功: ${result.tx}`);
                    fetchProposals();
                  } else {
                    setSkipStatus(`跳过签名失败: ${result.error}`);
                  }
                }}
              >
                跳过签名
              </button>
              {finalizeStatus && (
                <p style={{ marginTop: '8px', color: finalizeStatus.startsWith('完成投票成功') ? 'lightgreen' : 'red' }}>
                  {finalizeStatus}
                </p>
              )}
              {skipStatus && (
                <p style={{ marginTop: '8px', color: skipStatus.startsWith('跳过签名成功') ? 'lightgreen' : 'red' }}>
                  {skipStatus}
                </p>
              )}
            </div>
            {showAddSignModal && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#1e2430', borderRadius: '6px' }}>
                <input
                  type="text"
                  placeholder="输入签名人地址"
                  value={newSignatoryAddress}
                  onChange={(e) => setNewSignatoryAddress(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    style={{ padding: '8px 12px', background: 'var(--c-primary)', color: '#fff', border: 'none', borderRadius: '4px' }}
                    onClick={async () => {
                      setAddSignLoading(true);
                      setAddSignError(null);
                      setAddSignSuccess(null);
                      setShowAddSignModal(false);
                      try {
                        const result = await addSignatoryInstruction(
                          { wallet, publicKey } as any,
                          new PublicKey(selectedProposal.pda),
                          new PublicKey(newSignatoryAddress)
                        );
                        if (result.success) {
                          setAddSignSuccess(`签名人添加成功，tx: ${result.tx}`);
                          fetchProposals();
                          // setSelectedProposal(null); // removed as per instructions
                        } else {
                          setAddSignError(result.error);
                        }
                      } catch (e: any) {
                        setAddSignError(e.message || String(e));
                      } finally {
                        setAddSignLoading(false);
                      }
                    }}
                  >
                    确认
                  </button>
                  <button
                    style={{ padding: '8px 12px', background: '#666', color: '#fff', border: 'none', borderRadius: '4px' }}
                    onClick={() => setShowAddSignModal(false)}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
            {addSignLoading && <p>添加中...</p>}
            {addSignError && <p style={{ color: 'red' }}>{addSignError}</p>}
            {addSignSuccess && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{
                  color: 'lightgreen',
                  wordBreak: 'break-all',
                  overflowWrap: 'break-word',
                  maxWidth: '100%',
                  margin: 0,
                }}>
                  {addSignSuccess}
                </p>
                <button
                  style={{
                    padding: '8px 12px',
                    background: 'var(--c-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    alignSelf: 'flex-start'
                  }}
                  onClick={() => {
                    setShowAddSignModal(true);
                    setAddSignSuccess(null);
                    setAddSignError(null);
                    setNewSignatoryAddress('');
                  }}
                >
                  确定
                </button>
              </div>
            )}
            <button
              style={{ marginTop: 12 }}
              onClick={() => setSelectedProposal(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <button onClick={fetchProposals} disabled={loading} style={{ marginTop: 8 }}>
        刷新
      </button>
    </div>
  );
};

export default ProposalList;