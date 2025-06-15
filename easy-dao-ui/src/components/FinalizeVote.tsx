import type { WalletContextState } from '@solana/wallet-adapter-react';
import { getProgram, REALM_PDA, REALM_MINT, GOVERNANCE_PDA } from '../anchor';
import { PublicKey } from '@solana/web3.js';

export async function finalizeVoteInstruction(
  walletContext: WalletContextState,
  proposalAddress: PublicKey,
): Promise<{ success: true; tx: string } | { success: false; error: string }> {
  const { wallet, publicKey } = walletContext;
  if (!wallet || !publicKey) {
    return { success: false, error: 'Wallet not connected' };
  }
  const program = getProgram(wallet.adapter ?? wallet);
  try {
    // Send the transaction
    const tx = await program.methods
      .finalizeVote()
      .accounts({
        proposal: proposalAddress,
        governance: GOVERNANCE_PDA,
        realm: REALM_PDA,
        mint: REALM_MINT,
        user: publicKey,
      } as any)
      .rpc();

    return { success: true, tx };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}