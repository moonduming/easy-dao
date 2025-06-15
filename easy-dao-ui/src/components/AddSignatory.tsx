import type { WalletContextState } from '@solana/wallet-adapter-react';
import { getProgram, REALM_PDA, REALM_MINT, GOVERNANCE_PDA } from '../anchor';
import { PublicKey } from '@solana/web3.js';

/**
 * Add a signatory to an existing proposal.
 * @param walletContext The connected wallet context.
 * @param proposalAddress The PDA of the proposal to modify.
 * @param signatoryAddress The public key of the new signatory.
 * @returns The transaction signature.
 */
export async function addSignatoryInstruction(
  walletContext: WalletContextState,
  proposalAddress: PublicKey,
  signatoryAddress: PublicKey
): Promise<{ success: true; tx: string } | { success: false; error: string }> {
  const { wallet, publicKey } = walletContext;
  if (!wallet || !publicKey) {
    return { success: false, error: 'Wallet not connected' };
  }
  const program = getProgram(wallet.adapter ?? wallet);
  try {
    // Fetch governance and proposal accounts
    const governanceAccount = await program.account.governance.fetch(GOVERNANCE_PDA);
    const proposalAccount = await program.account.proposal.fetch(proposalAddress);

    // 2) token owner record for authority
    const [authRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('governance'),
        REALM_PDA.toBuffer(),
        REALM_MINT.toBuffer(),
        publicKey.toBuffer(),
      ],
      program.programId,
    );

    // Decide which record to use based on required signatories
    const ok =
      proposalAccount.signatoriesCount < governanceAccount.requiredSignatoriesCount;
    let signerRecordPda: PublicKey;
    if (ok) {
      [signerRecordPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('required_signatory'), 
            GOVERNANCE_PDA.toBuffer(), 
            signatoryAddress.toBuffer()
        ],
        program.programId,
      );
    } else {
      [signerRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('governance'),
          REALM_PDA.toBuffer(),
          REALM_MINT.toBuffer(),
          signatoryAddress.toBuffer(),
        ],
        program.programId,
      );
    }

    // Send the transaction
    const tx = await program.methods
      .addSignatory()
      .accounts({
        governance: GOVERNANCE_PDA,
        realm: REALM_PDA,
        proposal: proposalAddress,
        authority: publicKey,
        signatory: signatoryAddress,
        autRecord: authRecordPda,
        tokenOwnerRecord: ok ? null : signerRecordPda,
        requiredSignatory: ok ? signerRecordPda : null,
      } as any)
      .rpc();

    return { success: true, tx };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}