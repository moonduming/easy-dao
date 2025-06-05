//! 完成投票流程

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{error::GovernanceError, Governance, Proposal, ProposalState, Realm, TokenOwnerRecord};


#[derive(Accounts)]
pub struct FinalizeVote<'info> {
    pub proposal_owner: SystemAccount<'info>,

    pub realm: Account<'info, Realm>,

    #[account(
       address = realm.community_mint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        has_one = realm @ GovernanceError::InvalidGovernanceRealm,
    )]
    pub governance: Account<'info, Governance>,

    #[account(
        mut,
        has_one = governance @ GovernanceError::InvalidProposalGovernance,
        constraint = proposal.token_owner_record == proposal_owner.key() 
            @ GovernanceError::InvalidProposalTokenOwnerRecord
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        seeds = [
            TokenOwnerRecord::RECORD_SEED,
            realm.key().as_ref(),
            mint.key().as_ref(),
            proposal_owner.key().as_ref(),
        ],
        bump,
        has_one = realm @ GovernanceError::InvalidTokenOwnerRecordRealm,
        constraint = proposal_token_owner_record.governing_token_owner == proposal_owner.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub proposal_token_owner_record: Account<'info, TokenOwnerRecord>,
}


impl<'info> FinalizeVote<'info> {
    pub fn process(&mut self) -> Result<()> {
        self.proposal.assert_can_finalize_vote(&self.governance.config)?;
        
        let max_voter_weight = self.proposal.get_max_voter_weight_from_mint_supply(
            self.mint.supply,
            self.realm.config.community_mint_max_voter_weight_source.clone()
        ).ok_or(error!(GovernanceError::Overflow))?;


        let finalized = self.proposal.maybe_finalize_vote(
            max_voter_weight, 
            self.governance.config.community_vote_threshold.clone()
        )?; 

        if !finalized {
            self.proposal.state = ProposalState::Defeated;
            let now = Clock::get()?.unix_timestamp.try_into()?;
            self.proposal.voting_completed_at = Some(now);
            self.proposal.vote_threshold = Some(self.governance.config.community_vote_threshold.clone());
        }
        
        self.proposal_token_owner_record.decrease_outstanding_proposal_count()?;
        self.governance.active_proposal_count = self.governance.active_proposal_count
            .checked_sub(1)
            .ok_or(error!(GovernanceError::Overflow))?;

        Ok(())
    }
}
