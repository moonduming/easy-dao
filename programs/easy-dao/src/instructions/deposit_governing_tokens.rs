//! 用户治理账户存入代币

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, 
    token_interface::{
        Mint, 
        TokenAccount, 
        TokenInterface,
        transfer_checked,
        TransferChecked
    }
};

use crate::{error::GovernanceError, Realm, RealmConfigAccount, TokenOwnerRecord};


#[derive(Accounts)]
pub struct DepositGoverningTokens<'info> {
    pub user: Signer<'info>,

    pub realm: Box<Account<'info, Realm>>,

    #[account(
        address = realm.community_mint
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [
            mint.key().as_ref(),
            realm.key().as_ref(),
            RealmConfigAccount::COMMUNITY_TOKEN_SEEDS
        ],
        bump,
        token::mint = mint,
        token::authority = realm
    )]
    pub community_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [
            TokenOwnerRecord::RECORD_SEED,
            realm.key().as_ref(),
            mint.key().as_ref(),
            user.key().as_ref(),
        ],
        bump,
        constraint = token_owner_record.governing_token_owner == user.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner
    )]
    pub token_owner_record: Box<Account<'info, TokenOwnerRecord>>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>
}


impl<'info> DepositGoverningTokens<'info> {
    pub fn process(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, GovernanceError::InvalidDepositAmount);

        // 转账
        transfer_checked(CpiContext::new(
            self.token_program.to_account_info(), 
            TransferChecked { 
                from: self.user_token_account.to_account_info(), 
                mint: self.mint.to_account_info(), 
                to: self.community_token_account.to_account_info(), 
                authority: self.user.to_account_info() 
            }
            ), 
            amount, 
            self.mint.decimals
        )?;

        // 变更用户治理账户
        self.token_owner_record.governing_token_deposit_amount = self.token_owner_record
            .governing_token_deposit_amount
            .checked_add(amount)
            .ok_or(error!(GovernanceError::Overflow))?;

        Ok(())
    }
}
