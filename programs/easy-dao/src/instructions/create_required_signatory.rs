use anchor_lang::prelude::*;

use crate::{error::GovernanceError, Governance, GovernanceAccountType, Realm, RequiredSignatory};


#[derive(Accounts)]
pub struct CreateRequiredSignatory<'info> {
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
        init,
        payer = authority,
        space = RequiredSignatory::LEN,
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


impl<'info> CreateRequiredSignatory<'info> {
    pub fn process(&mut self) -> Result<()> {
        let required_signatory = &mut self.required_signatory;
        required_signatory.account_type = GovernanceAccountType::RequiredSignatory;
        required_signatory.governance = self.governance.key();
        required_signatory.signatory = self.signatory.key();

        self.governance.required_signatories_count = self.governance
            .required_signatories_count
            .checked_add(1)
            .ok_or(error!(GovernanceError::Overflow))?;

        Ok(())
    }
}