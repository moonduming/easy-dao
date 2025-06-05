use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::Mint;

use crate::{
    error::GovernanceError, 
    Governance, 
    GovernanceAccountType, 
    Proposal, 
    ProposalDeposit, 
    ProposalState, 
    Realm, 
    TokenOwnerRecord
};


#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub realm: Account<'info, Realm>,

    #[account(
        address = realm.community_mint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [
            realm.key().as_ref(),
            Governance::GOVERNANCE_SEED
        ],
        bump
    )]
    pub governance: Account<'info, Governance>,

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
        init,
        payer = authority,
        space = Proposal::LEN,
        seeds = [
            governance.key().as_ref(),
            token_owner_record.key().as_ref(),
            token_owner_record.outstanding_proposal_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = authority,
        space = ProposalDeposit::LEN,
        seeds = [
            ProposalDeposit::PROPOSAL_DEPOSIT_SEED,
            authority.key().as_ref(),
            proposal.key().as_ref()
        ],
        bump
    )]
    pub proposal_deposit: Account<'info, ProposalDeposit>,

    pub system_program: Program<'info, System>
}


impl<'info> CreateProposal<'info> {
    pub fn process(
        &mut self,
        name: String, 
        description_link: String,
    ) -> Result<()> {
        self.governance.resolve_vote_threshold()?;

        // 基本参数校验
        require!(name.as_bytes().len() <= 50, GovernanceError::NameTooLong);
        require!(description_link.as_bytes().len() <= 255, GovernanceError::LinkTooLong);
        
        if self.token_owner_record.governing_token_deposit_amount 
            < self.governance.config.min_community_weight_to_create_proposal 
        {
            return err!(GovernanceError::InsufficientVotingPower);
        }

        let current_ts = Clock::get()?.unix_timestamp as u64;

        self.token_owner_record.outstanding_proposal_count = self.token_owner_record
                .outstanding_proposal_count
                .checked_add(1)
                .ok_or(error!(GovernanceError::Overflow))?;

        self.governance.active_proposal_count =  self.governance
            .active_proposal_count
            .checked_add(1)
            .ok_or(error!(GovernanceError::Overflow))?;

        let proposal = &mut self.proposal;
        proposal.account_type = GovernanceAccountType::Proposal;
        proposal.governance = self.governance.key();
        proposal.token_owner_record = self.token_owner_record.key();
        proposal.state = ProposalState::Draft;
        proposal.voting_started_at = current_ts;
        proposal.name = name;
        proposal.description_link = description_link;

        let proposal_deposit_amount = self.governance.get_proposal_deposit_amount();

        let proposal_deposit = &mut self.proposal_deposit;
        proposal_deposit.account_type = GovernanceAccountType::ProposalDeposit;
        proposal_deposit.proposal = self.proposal.key();
        proposal_deposit.deposit_payer = self.authority.key();

        // 将押金 lamports 转入 proposal_deposit 账户（在 rent_exempt 之外再锁定押金）
        if proposal_deposit_amount > 0 {
            let cpi_ctx = CpiContext::new(
                self.system_program.to_account_info(),
                system_program::Transfer {
                    from: self.authority.to_account_info(),
                    to: self.proposal_deposit.to_account_info(),
                },
            );
            system_program::transfer(cpi_ctx, proposal_deposit_amount)?;
        }
        

        Ok(())
    }
}
