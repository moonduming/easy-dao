//! 管理目标账户创建指令

use anchor_lang::prelude::*;

use crate::{error::GovernanceError, Governance, GovernanceAccountType, GovernanceConfig, Realm};


#[derive(Accounts)]
pub struct CreateGovernance<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,

    #[account(
        constraint = realm.authority == authority.key() 
            @ GovernanceError::UnauthorizedRealmAuthority
    )]
    pub realm: Box<Account<'info, Realm>>,

    #[account(
        init,
        payer = payer,
        space = Governance::LEN,
        seeds = [
            realm.key().as_ref(),
            Governance::GOVERNANCE_SEED
        ],
        bump
    )]
    pub governance: Box<Account<'info, Governance>>,

    pub system_program: Program<'info, System>
}


impl<'info> CreateGovernance<'info> {
    pub fn process(
        &mut self,
        bump_governance: u8,
        governance_config: GovernanceConfig
    ) -> Result<()> {
        Governance::assert_is_valid_vote_threshold(&governance_config.community_vote_threshold)?;

        let governance = &mut self.governance;
        governance.account_type = GovernanceAccountType::Governance;
        governance.realm = self.realm.key();
        governance.governance_seed = bump_governance;
        governance.config = governance_config;
        governance.required_signatories_count = 0;
        governance.active_proposal_count = 0;

        Ok(()) 
    }
}
