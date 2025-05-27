use anchor_lang::prelude::*;

pub mod realm_config;
pub mod realm;

pub use realm_config::*;
pub use realm::*;



#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub enum GovernanceAccountType {
    /// 默认的未初始化账户状态
    #[default]
    Uninitialized,

    /// 顶层治理聚合体，包含社区代币（可选委员会代币）
    Realm,

    /// 给定Realm内特定治理代币所有者的代币所有者记录
    TokenOwnerRecord,

    /// 治理账户
    Governance,

    /// 治理账户的提案账户。单个治理账户可以拥有多个提案账户
    Proposal,

    /// 提案签署者账户
    SignatoryRecord,

    /// 给定提案的投票记录账户。提案可以有0到多个投票记录
    VoteRecord,

    /// 提案交易账户，包含单个交易中执行提案的指令，V2替代ProposalInstruction并增加了提案选项索引和多条指令支持
    ProposalTransaction,

    /// Realm配置账户（V2引入）
    RealmConfig,
}