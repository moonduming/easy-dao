use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;

pub use instructions::*;
pub use state::*;

declare_id!("6fZhpaeYWCjy6gy4kB2HqTBTdMGpeLK9gvY6jrwF8rP9");

#[program]
pub mod easy_dao {
    use super::*;

    pub fn create_realm(
        ctx: Context<CreateRealm>,
        name: String,
        realm_config: RealmConfig,
        governing_token_config: GoverningTokenConfig
    ) -> Result<()> {
        ctx.accounts.process(name, realm_config, governing_token_config)
    }
}

