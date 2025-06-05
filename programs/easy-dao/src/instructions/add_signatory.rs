//! 添加签名者指令
use anchor_lang::prelude::*;

use crate::{
    error::GovernanceError, 
    Governance, 
    GovernanceAccountType, 
    Proposal, 
    RequiredSignatory, 
    SignatoryRecord, 
    TokenOwnerRecord, 
    Realm
};


#[derive(Accounts)]
pub struct AddSignatory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub signatory: SystemAccount<'info>,

    pub realm: Account<'info, Realm>,

    #[account(
        has_one = realm @ GovernanceError::InvalidGovernanceRealm
    )]
    pub governance: Account<'info, Governance>,

    #[account(
        mut,
        has_one = governance @ GovernanceError::InvalidGovernanceForAccount,
        constraint = proposal.token_owner_record == authority.key() 
            @ GovernanceError::InvalidProposalTokenOwnerRecord
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = authority,
        space = SignatoryRecord::LEN,
        seeds = [
            SignatoryRecord::SIGNATORY_RECORD_SEED,
            proposal.key().as_ref(),
            signatory.key().as_ref()
        ],
        bump
    )]
    pub signatory_record: Account<'info, SignatoryRecord>,

    #[account(
        has_one = governance @ GovernanceError::InvalidRequiredGovernance,
        has_one = signatory @ GovernanceError::InvalidRequiredSignatory,
    )]
    pub required_signatory: Option<Account<'info, RequiredSignatory>>,

    #[account(
        constraint = token_owner_record.governing_token_owner == authority.key() 
            @ GovernanceError::InvalidProposalTokenOwnerRecord
    )]
    pub token_owner_record: Option<Account<'info, TokenOwnerRecord>>,

    pub system_program: Program<'info, System>
}


impl<'info> AddSignatory<'info> {
    pub fn process(&mut self) -> Result<()> {
        if self.proposal.signatories_count < self.governance.required_signatories_count {
            let _required_info = self.required_signatory
                .as_deref()
                .ok_or(GovernanceError::MissingRequiredSignatory)?;
        } else {
            let _token_owner_record = self.token_owner_record
                .as_deref()
                .ok_or(GovernanceError::MissingRequiredSignatory)?;
        }

        self.proposal.signatories_count = self.proposal.signatories_count
            .checked_add(1)
            .ok_or(GovernanceError::Overflow)?;
        
        let signatory_record = &mut self.signatory_record;

        signatory_record.account_type = GovernanceAccountType::SignatoryRecord;
        signatory_record.proposal = self.proposal.key();
        signatory_record.signatory = self.signatory.key();
        signatory_record.signed_off = false;

        Ok(())
    }
}
