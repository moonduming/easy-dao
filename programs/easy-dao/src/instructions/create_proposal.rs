use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::Mint;

use crate::{
    error::GovernanceError, Governance, GovernanceAccountType, Proposal, ProposalDeposit, ProposalState, Realm, TokenOwnerRecord, VoteThreshold
};


#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,

    pub realm: Box<Account<'info, Realm>>,

    #[account(
        address = realm.community_mint
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        seeds = [
            realm.key().as_ref(),
            Governance::GOVERNANCE_SEED
        ],
        bump
    )]
    pub governance: Box<Account<'info, Governance>>,

    #[account(
        mut,
        seeds = [
            TokenOwnerRecord::RECORD_SEED,
            realm.key().as_ref(),
            mint.key().as_ref(),
            authority.key().as_ref(),
        ],
        bump,
        constraint = token_owner_record.realm == realm.key()
            @ GovernanceError::InvalidTokenOwnerRecordRealm,
        constraint = token_owner_record.governing_token_owner == authority.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub token_owner_record: Box<Account<'info, TokenOwnerRecord>>,

    #[account(
        init,
        payer = payer,
        space = Proposal::LEN,
        seeds = [
            governance.key().as_ref(),
            token_owner_record.key().as_ref(),
            token_owner_record.outstanding_proposal_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    #[account(
        init,
        payer = payer,
        space = ProposalDeposit::LEN,
        seeds = [
            ProposalDeposit::PROPOSAL_DEPOSIT_SEED,
            payer.key().as_ref(),
            proposal.key().as_ref()
        ],
        bump
    )]
    pub proposal_deposit: Box<Account<'info, ProposalDeposit>>,

    pub system_program: Program<'info, System>
}


impl<'info> CreateProposal<'info> {
    pub fn process(
        &mut self,
        name: String, 
        description_link: String,
        voting_duration: u64,
        vote_threshold: VoteThreshold
    ) -> Result<()> {
        self.governance.resolve_vote_threshold()?;

        // 基本参数校验
        require!(voting_duration > 0, GovernanceError::InvalidVotingDuration);
        require!(name.as_bytes().len() <= 50, GovernanceError::NameTooLong);
        require!(description_link.as_bytes().len() <= 255, GovernanceError::LinkTooLong);
        
        if self.token_owner_record.governing_token_deposit_amount 
            < self.governance.config.min_community_weight_to_create_proposal 
        {
            return err!(GovernanceError::InsufficientVotingPower);
        }

        let current_ts = Clock::get()?.unix_timestamp as u64;

        let token_owner_record = &mut self.token_owner_record;
        let new_outstanding_proposal_coun = token_owner_record
                .outstanding_proposal_count
                .checked_add(1)
                .ok_or(error!(GovernanceError::Overflow))?;
        token_owner_record.outstanding_proposal_count = new_outstanding_proposal_coun;

        let governance = &mut self.governance;
        let new_active_proposal_count = governance.active_proposal_count
            .checked_add(1)
            .ok_or(error!(GovernanceError::Overflow))?;
        governance.active_proposal_count = new_active_proposal_count;

        let proposal = &mut self.proposal;
        proposal.account_type = GovernanceAccountType::Proposal;
        proposal.governance = self.governance.key();
        proposal.token_owner_record = self.token_owner_record.key();
        proposal.state = ProposalState::Draft;
        proposal.voting_started_at = current_ts;
        proposal.voting_deadline = current_ts + voting_duration;
        proposal.vote_threshold = vote_threshold;
        proposal.name = name;
        proposal.description_link = description_link;

        let proposal_deposit_amount = self.governance.get_proposal_deposit_amount();

        let proposal_deposit = &mut self.proposal_deposit;
        proposal_deposit.account_type = GovernanceAccountType::ProposalDeposit;
        proposal_deposit.proposal = self.proposal.key();
        proposal_deposit.deposit_payer = self.payer.key();

        // 将押金 lamports 转入 proposal_deposit 账户（在 rent_exempt 之外再锁定押金）
        if proposal_deposit_amount > 0 {
            let cpi_ctx = CpiContext::new(
                self.system_program.to_account_info(),
                system_program::Transfer {
                    from: self.payer.to_account_info(),
                    to: self.proposal_deposit.to_account_info(),
                },
            );
            system_program::transfer(cpi_ctx, proposal_deposit_amount)?;
        }
        

        Ok(())
    }
}
