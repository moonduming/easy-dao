//! 投票指令
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{error::GovernanceError, Governance, GovernanceAccountType, Proposal, Realm, TokenOwnerRecord, Vote, VoteRecord};


#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub proposal_owner: SystemAccount<'info>,

    pub realm: Account<'info, Realm>,

    #[account(address = realm.community_mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        has_one = realm @ GovernanceError::InvalidGovernanceRealm
    )]
    pub governance: Account<'info, Governance>,

    #[account(
        has_one = governance @ GovernanceError::InvalidGovernanceForAccount,
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
            authority.key().as_ref(),
        ],
        bump,
        has_one = realm @ GovernanceError::InvalidTokenOwnerRecordRealm,
        constraint = vote_token_owner_record.governing_token_owner == authority.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub vote_token_owner_record: Account<'info, TokenOwnerRecord>,

    // todo: 如果 proposal_owner == authority，那么账户重复了
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

    #[account(
        init,
        payer = authority,
        space = VoteRecord::LEN,
        seeds = [
            VoteRecord::VOTERECORD_SEED,
            proposal.key().as_ref(),
            vote_token_owner_record.key().as_ref()
        ],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    pub system_program: Program<'info, System>
}


impl<'info> CastVote<'info> {
    pub fn process(&mut self, vote: Vote) -> Result<()> {
        self.governance.resolve_vote_threshold()?;

        self.proposal.assert_can_cast_vote(&self.governance.config)?;

        self.vote_token_owner_record.unrelinquished_votes_count = self.vote_token_owner_record
            .unrelinquished_votes_count
            .checked_add(1)
            .ok_or(error!(GovernanceError::Overflow))?;

        match vote {
            Vote::Yes => {
                self.proposal.yes_vote_weight = self.proposal.yes_vote_weight
                    .checked_add(self.vote_token_owner_record.governing_token_deposit_amount)
                    .ok_or(error!(GovernanceError::Overflow))?;
            },
            Vote::No => {
                self.proposal.no_vote_weight = self.proposal.no_vote_weight
                    .checked_add(self.vote_token_owner_record.governing_token_deposit_amount)
                    .ok_or(error!(GovernanceError::Overflow))?;
            }
        }

        let max_voter_weight = self.proposal
            .get_max_voter_weight_from_mint_supply(
                self.mint.supply,
                self.realm.config.community_mint_max_voter_weight_source.clone()
            ).ok_or(error!(GovernanceError::Overflow))?;

        if self.proposal.maybe_finalize_vote(
            max_voter_weight, 
            self.governance.config.community_vote_threshold.clone()
        )? {
            if self.proposal_owner.key() == self.authority.key() {
                self.vote_token_owner_record.decrease_outstanding_proposal_count()?;
            } else {
                self.proposal_token_owner_record.decrease_outstanding_proposal_count()?;
            }
            
            self.governance.active_proposal_count = self.governance.active_proposal_count
                .checked_sub(1)
                .ok_or(error!(GovernanceError::Overflow))?; 
        }

        let vote_record = &mut self.vote_record;
        vote_record.account_type = GovernanceAccountType::VoteRecord;
        vote_record.proposal = self.proposal.key();
        vote_record.governing_token_owner = self.vote_token_owner_record.key();
        vote_record.is_relinquished = false;
        vote_record.vote_weight = self.vote_token_owner_record.governing_token_deposit_amount;
        vote_record.vote = vote;
        
        Ok(())
    }
}
