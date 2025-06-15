import React, { useEffect, useState } from 'react';
import { getProgram, REALM_PDA, REALM_MINT } from '../anchor';
import { voteOnProposal } from './CastVote';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { signOffProposalAll } from './SingOffProposal';

const SIGNATORY_OFFSET = 8 + 1 + 32; // discriminator + account_type + proposal
const SIGNED_OFF_OFFSET = SIGNATORY_OFFSET + 32; // after signatory

const PROPOSAL_STATE_ENUM_OFFSET = 8 + 1 + 32 + 32 + 1 + 1 + 9;
const STATE_VOTING = 2; // assuming enum value for Voting is 2

const VOTERECORD_SEED_OFFSET = 8 + 1 + 32; // discriminator + proposal pubkey + owner record

/**
 * Hook to fetch proposals that the current user needs to sign.
 */
export function usePendingSignatures() {
  const { publicKey, wallet } = useWallet();
  const [pendingProposals, setPendingProposals] = useState<PublicKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || !wallet) {
      setPendingProposals([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    async function fetchPending() {
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(wallet?.adapter ?? wallet);
        const records = await program.account.signatoryRecord.all([
          {
            memcmp: {
              offset: SIGNATORY_OFFSET,
              bytes: publicKey?.toBase58() ?? '',
            },
          },
          {
            memcmp: {
              offset: SIGNED_OFF_OFFSET,
              bytes: bs58.encode(Buffer.from([0])),
            },
          },
        ]);
        if (!cancelled) {
          setPendingProposals(records.map((r) => r.account.proposal));
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPending();
    return () => { cancelled = true; };
  }, [publicKey, wallet]);

  return { pendingProposals, loading, error };
}

/**
 * Hook to fetch proposals currently in voting state that the user has not voted on.
 */
export function usePendingVotes() {
  const { publicKey, wallet } = useWallet();
  const [pendingVotes, setPendingVotes] = useState<PublicKey[]>([]);
  const [loadingVotes, setLoadingVotes] = useState(false);
  const [errorVotes, setErrorVotes] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || !wallet) {
      setPendingVotes([]);
      setLoadingVotes(false);
      setErrorVotes(null);
      return;
    }
    let cancelled = false;
    async function fetchPendingVotes() {
      setLoadingVotes(true);
      setErrorVotes(null);
      try {
        const program = getProgram(wallet?.adapter ?? wallet);
        // 1. fetch all proposals in Voting state
        const allProposals = await program.account.proposal.all([{
          memcmp: {
            offset: PROPOSAL_STATE_ENUM_OFFSET,
            bytes: bs58.encode(Buffer.from([STATE_VOTING])),
          }
        }]);

        const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"), 
                REALM_PDA.toBuffer(), 
                REALM_MINT.toBuffer(), 
                publicKey?.toBuffer() ?? Buffer.from('')
            ],
            program.programId
        );
        // 2. fetch user's vote records
        const voteRecords = await program.account.voteRecord.all([{
          memcmp: {
            offset: VOTERECORD_SEED_OFFSET,
            bytes:  tokenOwnerPda.toBase58() ?? '',
          }
        }]);
        const votedProposals = new Set(voteRecords.map(r => r.account.proposal.toBase58()));
        // 3. filter out proposals already voted
        const pending = allProposals
          .map(r => r.publicKey)
          .filter(pk => !votedProposals.has(pk.toBase58()));
        if (!cancelled) {
          setPendingVotes(pending);
        }
      } catch (e: any) {
        if (!cancelled) setErrorVotes(e.message);
      } finally {
        if (!cancelled) setLoadingVotes(false);
      }
    }
    fetchPendingVotes();
    return () => { cancelled = true; };
  }, [publicKey, wallet]);

  return { pendingVotes, loadingVotes, errorVotes };
}

/**
 * Page component to display and act on pending proposal signatures.
 */
export const SignAndVotePage: React.FC = () => {
  const { pendingProposals, loading, error } = usePendingSignatures();
  const { pendingVotes, loadingVotes, errorVotes } = usePendingVotes();
  const walletContext = useWallet();
  const [signStatus, setSignStatus] = useState<Record<string, string>>({});
  const [voteStatus, setVoteStatus] = useState<Record<string, string>>({});

  return (
    <div
      className="card sign-and-vote"
      style={{
        padding: '20px',
        margin: '20px auto',
        maxWidth: '800px',
        borderRadius: '18px',
      }}
    >
      <h2>待签名提案</h2>
      {loading && <p>加载中...</p>}
      {error && <p style={{ color: 'red' }}>错误: {error}</p>}
      {!loading && !error && pendingProposals.length === 0 && (
        <p>暂无待签名提案</p>
      )}
      {!loading && !error && pendingProposals.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {pendingProposals.map((pubkey) => (
            <li key={pubkey.toBase58()} style={{ marginBottom: '12px' }}>
              <span style={{ marginRight: '8px' }}>
                {pubkey.toBase58()}
              </span>
              <button
                style={{
                  padding: '4px 8px',
                  background: 'var(--c-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  setSignStatus(prev => ({ ...prev, [pubkey.toBase58()]: '加载中...' }));
                  const result = await signOffProposalAll(walletContext, pubkey);
                  if (result.success) {
                    setSignStatus(prev => ({ ...prev, [pubkey.toBase58()]: `签名成功: ${result.tx}` }));
                  } else {
                    setSignStatus(prev => ({ ...prev, [pubkey.toBase58()]: `签名失败: ${result.error}` }));
                  }
                }}
              >
                签名
              </button>
              {signStatus[pubkey.toBase58()] && (
                <div style={{ marginTop: '4px', fontSize: '0.9em', color: '#666' }}>
                  {signStatus[pubkey.toBase58()]}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pending Votes */}
      <h2>待投票提案</h2>
      {loadingVotes && <p>加载中...</p>}
      {errorVotes && <p style={{ color: 'red' }}>错误: {errorVotes}</p>}
      {!loadingVotes && !errorVotes && pendingVotes.length === 0 && (
        <p>暂无待投票提案</p>
      )}
      {!loadingVotes && !errorVotes && pendingVotes.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {pendingVotes.map((pubkey) => (
            <li key={pubkey.toBase58()} style={{ marginBottom: '12px' }}>
              <span style={{ marginRight: '8px' }}>
                {pubkey.toBase58()}
              </span>
              <button
                style={{
                  padding: '4px 8px',
                  marginRight: '4px',
                  background: 'var(--c-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  setVoteStatus(prev => ({ ...prev, [pubkey.toBase58()]: '加载中...' }));
                  const result = await voteOnProposal(walletContext, pubkey, true);
                  if (result.success) {
                    setVoteStatus(prev => ({ ...prev, [pubkey.toBase58()]: `投票成功 (YES): ${result.tx}` }));
                  } else {
                    setVoteStatus(prev => ({ ...prev, [pubkey.toBase58()]: `投票失败 (YES): ${result.error}` }));
                  }
                }}
              >
                赞成
              </button>
              <button
                style={{
                  padding: '4px 8px',
                  background: 'var(--c-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  setVoteStatus(prev => ({ ...prev, [pubkey.toBase58()]: '加载中...' }));
                  const result = await voteOnProposal(walletContext, pubkey, false);
                  if (result.success) {
                    setVoteStatus(prev => ({ ...prev, [pubkey.toBase58()]: `投票成功 (NO): ${result.tx}` }));
                  } else {
                    setVoteStatus(prev => ({ ...prev, [pubkey.toBase58()]: `投票失败 (NO): ${result.error}` }));
                  }
                }}
              >
                反对
              </button>
              {voteStatus[pubkey.toBase58()] && (
                <div style={{ marginTop: '4px', fontSize: '0.9em', color: '#666' }}>
                  {voteStatus[pubkey.toBase58()]}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
