//! 释放投票指令

use anchor_lang::prelude::*;

use crate::{error::GovernanceError, Governance, Proposal, ProposalState, Realm, TokenOwnerRecord, VoteRecord};

#[derive(Accounts)]
pub struct RelinquishVote<'info> {
    pub signer: Signer<'info>,

    pub realm: Account<'info, Realm>,

    #[account(
        has_one = realm @GovernanceError::InvalidGovernanceRealm,
    )]
    pub governance: Account<'info, Governance>,

    #[account(
        mut,
        has_one = realm @GovernanceError::InvalidTokenOwnerRecordRealm,
        constraint = token_owner_record.governing_token_owner == signer.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub token_owner_record: Account<'info, TokenOwnerRecord>,

    #[account(
        mut,
        has_one = governance @ GovernanceError::InvalidGovernanceForAccount,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        has_one = proposal @ GovernanceError::InvalidGovernanceForAccount,
        constraint = vote_record.governing_token_owner == signer.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub vote_record: Account<'info, VoteRecord>,
}


impl<'info> RelinquishVote<'info> {
    pub fn process(&mut self) -> Result<()> {

        require!(
            matches!(
                self.proposal.state, 
                ProposalState::Completed 
                    | ProposalState::Defeated
            ), 
            GovernanceError::ProposalStillInVoting
        );

        require!(
            !self.vote_record.is_relinquished,
            GovernanceError::VoteAlreadyRelinquished
        );
        
        self.vote_record.is_relinquished = true;
        self.token_owner_record.unrelinquished_votes_count = self.token_owner_record
            .unrelinquished_votes_count
            .checked_sub(1)
            .ok_or(GovernanceError::Overflow)?;
        
        Ok(())
    }
}