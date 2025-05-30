use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod error;

pub use instructions::*;
pub use state::*;

declare_id!("6D4BY2xMmPu54faKU9mbpNXkfwmqAgE6C5HrqNUEtXEM");

/*
CreateGovernance – 创建管理目标（PDA、账户等）
CreateProposal – 创建提案
CastVote – 投票流程
*/

#[program]
pub mod easy_dao {
    use super::*;

    pub fn create_realm(
        ctx: Context<CreateRealm>,
        id: u64,
        name: String,
        realm_config: RealmConfig,
        governing_token_config: GoverningTokenConfig
    ) -> Result<()> {
        ctx.accounts.process(id, name, realm_config, governing_token_config)
    }

    pub fn creat_token_owner_record(
        ctx: Context<CreateTokenOwnerRecord>
    ) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn deposit_governing_tokens(
        ctx: Context<DepositGoverningTokens>,
        amount: u64
    ) -> Result<()> {
        ctx.accounts.process(amount)
    }

    pub fn create_governance(
        ctx: Context<CreateGovernance>,
        governance_config: GovernanceConfig
    ) -> Result<()> {
        ctx.accounts.process(ctx.bumps.governance, governance_config)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        name: String, 
        description_link: String,
        voting_duration: u64,
        vote_threshold: VoteThreshold
    ) -> Result<()> {
        ctx.accounts.process(name, description_link, voting_duration, vote_threshold)
    }
}

