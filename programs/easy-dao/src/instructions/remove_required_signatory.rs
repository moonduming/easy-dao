use anchor_lang::prelude::*;

use crate::{error::GovernanceError, Governance, Realm, RequiredSignatory};


#[derive(Accounts)]
pub struct RemoveRequiredSignatory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub signatory: SystemAccount<'info>,

    #[account(
        has_one = authority @ GovernanceError::UnauthorizedRealmAuthority
    )]
    pub realm: Box<Account<'info, Realm>>,

    #[account(
        mut,
        has_one = realm @ GovernanceError::InvalidGovernanceRealm
    )]
    pub governance: Box<Account<'info, Governance>>,

    #[account(
        mut,
        close = authority,
        seeds = [
            RequiredSignatory::REQUIRED_SIGNATORY_SEED,
            governance.key().as_ref(),
            signatory.key().as_ref()
        ],
        bump
    )]
    pub required_signatory: Box<Account<'info, RequiredSignatory>>,

    pub system_program: Program<'info, System>
}


impl<'info> RemoveRequiredSignatory<'info> {
    pub fn process(&mut self) -> Result<()> {
        self.governance.required_signatories_count = self.governance
            .required_signatories_count
            .checked_sub(1)
            .ok_or(error!(GovernanceError::Overflow))?;

        
        Ok(())
    }
}
