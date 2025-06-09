use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{error::GovernanceError, Proposal, ProposalDeposit, Realm, TokenOwnerRecord};


#[derive(Accounts)]
pub struct RefundProposalDeposit<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub realm: Account<'info, Realm>,
    #[account(address = realm.community_mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [
            TokenOwnerRecord::RECORD_SEED,
            realm.key().as_ref(),
            mint.key().as_ref(),
            authority.key().as_ref(),
        ],
        bump,
        has_one = realm @ GovernanceError::InvalidTokenOwnerRecordRealm,
        constraint = token_owner_record.governing_token_owner == authority.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub token_owner_record: Account<'info, TokenOwnerRecord>,

    #[account(
        has_one = token_owner_record 
            @ GovernanceError::InvalidProposalTokenOwnerRecord
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        has_one = proposal @ GovernanceError::InvalidProposalDepositProposal,
        constraint = proposal_deposit.deposit_payer == authority.key() 
            @ GovernanceError::InvalidProposalDepositDepositPayer,
        close = authority
    )]
    pub proposal_deposit: Account<'info, ProposalDeposit>,
    
    pub system_program: Program<'info, System>,
}

impl<'info> RefundProposalDeposit<'info> {
    pub fn process(&mut self) -> Result<()> {
        if self.proposal.closed_at.is_none() {
            return err!(GovernanceError::ProposalStillInVoting);
        }

        Ok(())
    }
}
