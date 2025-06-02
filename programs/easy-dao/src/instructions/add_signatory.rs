use anchor_lang::prelude::*;

use crate::{
    error::GovernanceError, Governance, GovernanceAccountType, Proposal, RequiredSignatory, SignatoryRecord, TokenOwnerRecord
};


#[derive(Accounts)]
pub struct AddSignatory<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    pub signatory: SystemAccount<'info>,

    pub governance: Box<Account<'info, Governance>>,

    #[account(
        mut,
        has_one = governance @ GovernanceError::InvalidProposalGovernance,
        constraint = proposal.token_owner_record == authority.key() 
            @ GovernanceError::InvalidProposalTokenOwnerRecord
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    #[account(
        init,
        payer = payer,
        space = SignatoryRecord::LEN,
        seeds = [
            SignatoryRecord::SIGNATORY_RECORD_SEED,
            proposal.key().as_ref(),
            signatory.key().as_ref()
        ],
        bump
    )]
    pub signatory_record: Box<Account<'info, SignatoryRecord>>,

    pub system_program: Program<'info, System>
}


pub fn process_add_signatory<'info>(ctx: Context<'_, '_, 'info, 'info, AddSignatory<'info>>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let governance = &ctx.accounts.governance;

    if proposal.signatories_count < governance.required_signatories_count {
        let required_info = ctx.remaining_accounts
            .get(0)
            .ok_or(GovernanceError::MissingRequiredSignatory)?;
        let required: Account<'info, RequiredSignatory> = Account::try_from(required_info)?;
        
        if required.governance != governance.key() {
            return err!(GovernanceError::InvalidProposalGovernance);
        }
        if required.signatory != ctx.accounts.signatory.key() {
            return err!(GovernanceError::InvalidRequiredSignatory);
        }
    } else {
        let required_info = ctx.remaining_accounts
            .get(0)
            .ok_or(GovernanceError::MissingRequiredSignatory)?;
        let required: Account<'info, TokenOwnerRecord> = Account::try_from(required_info)?;
        
        if required.governing_token_owner != ctx.accounts.authority.key() {
            return err!(GovernanceError::InvalidProposalTokenOwnerRecord);
        }
    }

    proposal.signatories_count = proposal.signatories_count
        .checked_add(1)
        .ok_or(GovernanceError::Overflow)?;
    
    let signatory_record = &mut ctx.accounts.signatory_record;

    signatory_record.account_type = GovernanceAccountType::SignatoryRecord;
    signatory_record.proposal = proposal.key();
    signatory_record.signatory = ctx.accounts.signatory.key();
    signatory_record.signed_off = false;

    Ok(())
}

