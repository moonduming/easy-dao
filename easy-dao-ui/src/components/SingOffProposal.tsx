import type { WalletContextState } from '@solana/wallet-adapter-react';
import { getProgram, REALM_PDA, REALM_MINT, GOVERNANCE_PDA } from '../anchor';
import { PublicKey } from '@solana/web3.js';

/**
 * Sign off a proposal for a list of users.
 * @param program Anchor program instance
 * @param realmPda Realm PDA
 * @param mint Realm mint PublicKey
 * @param users Array of Keypairs who will sign off
 * @param proposalSeed Seed number for the proposal (default: 0)
 */
export async function signOffProposalAll(
  walletContext: WalletContextState,
  proposalAddress: PublicKey,
): Promise<{ success: true; tx: string } | { success: false; error: string }> {
  // Derive governance PDA
  const { wallet, publicKey } = walletContext;
  if (!wallet || !publicKey) {
    return { success: false, error: 'Wallet not connected' };
  }
  const program = getProgram(wallet.adapter ?? wallet);
  try {
    // Fetch proposal account
    const proposalAccount = await program.account.proposal.fetch(proposalAddress);

    // Decide which record to use based on required signatories
    const ok = proposalAccount.signatoriesCount == 0;
    let signerRecordPda: PublicKey;
    if (ok) {
      [signerRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("governance"), 
          REALM_PDA.toBuffer(), 
          REALM_MINT.toBuffer(), 
          publicKey.toBuffer()
        ],
        program.programId
      );
    } else {
      [signerRecordPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("signatory_record"),
            proposalAddress.toBuffer(),
            publicKey.toBuffer()
        ],
        program.programId
      );
    }

    // Send the transaction
    const tx = await program.methods.signOffProposal()
      .accounts({
        proposal: proposalAddress,
        governance: GOVERNANCE_PDA,
        realm: REALM_PDA,
        signatory: publicKey,
        tokenOwnerRecord: ok ? signerRecordPda : null,
        signatoryRecord: !ok ? signerRecordPda : null,
      } as any)
      .rpc();

    return { success: true, tx };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}