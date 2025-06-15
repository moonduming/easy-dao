import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getProgram, REALM_MINT, REALM_PDA } from '../anchor';

const CreateProposal: React.FC = () => {
  const { publicKey, wallet } = useWallet();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [txid, setTxid] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!wallet || !publicKey || !title) return;
    setLoading(true);
    setError('');
    setTxid('');
    try {
      const program = getProgram(wallet.adapter ?? wallet);
      const authority = publicKey.toBase58();
      const tx = await program.methods.createProposal(title, url)
        .accounts({
          mint: REALM_MINT,
          authority,
          realm: REALM_PDA,
        } as any)
        .rpc();
      setTxid(tx);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="create-proposal-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        maxWidth: '480px',
        margin: '30px auto',
      }}
    >
      <h2>创建提案</h2>
      <div style={{ marginBottom: 16 }}>
        <input
          style={{ width: '100%', marginBottom: 8 }}
          placeholder="提案标题"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <input
          style={{ width: '100%' }}
          placeholder="链接（选填）"
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      </div>
      <button
        onClick={handleCreate}
        disabled={loading || !title || !wallet || !publicKey}
      >
        {publicKey
          ? loading
            ? '创建中...'
            : '创建提案'
          : '请先连接钱包'}
      </button>
      {txid && (
        <div style={{ marginTop: 12, color: 'green' }}>
          成功！TxID: {txid}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, color: 'red' }}>
          错误: {error}
        </div>
      )}
    </div>
  );
};

export default CreateProposal;