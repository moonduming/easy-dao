//! 创建用户治理账户

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{
    GovernanceAccountType, 
    Realm, 
    TokenOwnerRecord, 
    error::GovernanceError
};


#[derive(Accounts)]
pub struct CreateTokenOwnerRecord<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        constraint = realm.community_mint == mint.key() 
            @ GovernanceError::InvalidCommunityMint
    )]
    pub realm: Box<Account<'info, Realm>>,

    #[account(
        init,
        payer = user,
        space = TokenOwnerRecord::LEN,
        seeds = [
            TokenOwnerRecord::RECORD_SEED,
            realm.key().as_ref(),
            mint.key().as_ref(),
            user.key().as_ref(),
        ],
        bump
    )]
    pub token_owner_record: Box<Account<'info, TokenOwnerRecord>>,

    pub system_program: Program<'info, System>
}


impl<'info> CreateTokenOwnerRecord<'info> {
    pub fn process(&mut self) -> Result<()> {
        let token_owner_record = &mut self.token_owner_record;
        token_owner_record.account_type = GovernanceAccountType::TokenOwnerRecord;
        token_owner_record.realm = self.realm.key();
        token_owner_record.governing_token_owner = self.user.key();
        token_owner_record.governing_token_deposit_amount = 0;
        token_owner_record.governing_token_mint = self.mint.key();
        token_owner_record.governance_delegate = None;
        token_owner_record.unrelinquished_votes_count = 0;
        token_owner_record.outstanding_proposal_count = 0;
        token_owner_record.version = TokenOwnerRecord::TOKEN_OWNER_RECORD_LAYOUT_VERSION;
        token_owner_record.locks = vec![];

        Ok(())
    }
}
