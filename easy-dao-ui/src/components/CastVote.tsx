import type { WalletContextState } from '@solana/wallet-adapter-react';
import { getProgram, REALM_PDA, REALM_MINT, GOVERNANCE_PDA } from '../anchor';
import { PublicKey } from '@solana/web3.js';


export async function voteOnProposal(
  walletContext: WalletContextState,
  proposalAddress: PublicKey,
  yes: boolean,
): Promise<{ success: true; tx: string } | { success: false; error: string }> {
  // Derive governance PDA
  const { wallet, publicKey } = walletContext;
  if (!wallet || !publicKey) {
    return { success: false, error: 'Wallet not connected' };
  }
  const program = getProgram(wallet.adapter ?? wallet);
  try {
    const proposalAccount = await program.account.proposal.fetch(proposalAddress);
    const tokenOwnerAccount = await program.account.tokenOwnerRecord.fetch(proposalAccount.tokenOwnerRecord);
    
    const voteArg: any = yes ? { yes: {} } : { no: {} };
    const tx = await program.methods.castVote(
        voteArg
      )
      .accounts({
        proposal: proposalAddress,
        governance: GOVERNANCE_PDA,
        realm: REALM_PDA,
        mint: REALM_MINT,
        authority: publicKey,
        user: tokenOwnerAccount.governingTokenOwner,
      } as any)
      .rpc();

    return { success: true, tx };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}