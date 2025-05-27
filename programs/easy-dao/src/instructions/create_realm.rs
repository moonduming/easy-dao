use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::{GovernanceAccountType, GoverningTokenConfig, Realm, RealmConfig, RealmConfigAccount, Reserved110};


#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateRealm<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        space = RealmConfigAccount::LEN,
        seeds = [
            id.to_le_bytes().as_ref(), 
            RealmConfigAccount::REALM_CONFIG_SEEDS
        ],
        bump
    )]
    pub realm_config_account: Box<Account<'info, RealmConfigAccount>>,

    #[account(
        init,
        payer = payer,
        space = Realm::LEN,
        seeds = [
            id.to_le_bytes().as_ref(),
            realm_config_account.key().as_ref(),
            Realm::REALM_SEEDS
        ],
        bump
    )]
    pub realm: Box<Account<'info, Realm>>,

    #[account(
        init,
        payer = payer,
        seeds = [
            id.to_le_bytes().as_ref(),
            mint.key().as_ref(),
            realm.key().as_ref(),
            RealmConfigAccount::COMMUNITY_TOKEN_SEEDS
        ],
        bump,
        token::mint = mint,
        token::authority = realm
    )]
    pub community_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>
}


impl<'info> CreateRealm<'info> {
    pub fn process(
        &mut self,
        name: String,
        realm_config: RealmConfig,
        governing_token_config: GoverningTokenConfig
    ) -> Result<()> {
        let realm_config_account = &mut self.realm_config_account;
        realm_config_account.account_type = GovernanceAccountType::RealmConfig;
        realm_config_account.realm = self.realm.key();
        realm_config_account.community_token_config = governing_token_config;
        realm_config_account.reserved = Reserved110::default();

        let realm = &mut self.realm;
        realm.name = name;
        realm.account_type = GovernanceAccountType::Realm;
        realm.config = realm_config;
        realm.community_mint = self.community_token_account.key();
        realm.authority = Some(self.authority.key());
        realm.reserved = [0; 128];

        Ok(())
    }
}
